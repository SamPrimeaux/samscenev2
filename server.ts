import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { StudioTemplatesRepository } from './server/studioTemplatesDb.ts';
import { PrimeTechEcosystemRepository } from './server/primetechEcosystemDb.ts';
import { SKY_PRESET_MAP } from './src/constants.ts';
import type {
  AtmosphereMoodId,
  CameraShotId,
  CharacterPoseKeyframe,
  CharacterRigSpec,
  CharacterStylePresetId,
  EnvironmentLevelId,
  ExtractedCameraKeyframe,
  ExtractedSurfaceTextureSpec,
  ExtractedVideoKeyframe,
  FinishId,
  MovieBeat,
  SceneryPropType,
  SkyPresetId,
  SkySceneConfig,
  SkyTriggerMode,
  StudioSubjectId,
  TransitionType,
  TtsMode,
  VoiceName,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const templatesRepo = new StudioTemplatesRepository(
  path.resolve(__dirname, '.data', 'samscene_templates.sqlite')
);

const ecosystemRepo = new PrimeTechEcosystemRepository(
  path.resolve(__dirname, '.data', 'primetech_ecosystem.sqlite')
);

const VALID_VOICES = new Set([
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Zephyr',
  'Aoede',
  'Leda',
  'Orus',
  'Callirrhoe',
  'Autonoe',
  'Sulafat',
  'Enceladus',
  'Gacrux',
  'Despina',
  'Umbriel',
]);

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface TtsSinglePayload {
  mode: 'single';
  text: string;
  voiceName?: string;
  stylePrompt?: string;
}

interface TtsDualPayload {
  mode: 'dual';
  text: string;
  speakerA?: string;
  speakerB?: string;
  voiceA?: string;
  voiceB?: string;
  styleA?: string;
  styleB?: string;
}

type TtsPayload = TtsSinglePayload | TtsDualPayload;

function parseDualDialogueParts(
  rawText: string,
  speakerA: string,
  speakerB: string,
  styleA: string,
  styleB: string
) {
  const lines = rawText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parts: Array<{
    text: string;
    speechMetadata: { speaker: string; style?: string };
  }> = [];

  let fallbackIndex = 0;
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 24) {
      const prefix = line.slice(0, colonIdx).trim();
      const content = line.slice(colonIdx + 1).trim();
      if (content) {
        const isB =
          prefix.toLowerCase() === speakerB.toLowerCase() ||
          (prefix.toLowerCase() !== speakerA.toLowerCase() && fallbackIndex % 2 === 1);
        const speaker = isB ? speakerB : speakerA;
        const style = isB ? styleB : styleA;
        parts.push({
          text: `${speaker}: ${content}`,
          speechMetadata: style ? { speaker, style } : { speaker },
        });
        fallbackIndex++;
        continue;
      }
    }
    const isB = fallbackIndex % 2 === 1;
    const speaker = isB ? speakerB : speakerA;
    const style = isB ? styleB : styleA;
    parts.push({
      text: `${speaker}: ${line}`,
      speechMetadata: style ? { speaker, style } : { speaker },
    });
    fallbackIndex++;
  }

  if (parts.length === 0) {
    parts.push({
      text: `${speakerA}: Welcome to SamScene.`,
      speechMetadata: styleA ? { speaker: speakerA, style: styleA } : { speaker: speakerA },
    });
  }

  return parts;
}

function cleanHex(value: unknown, fallback: string): string {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return fallback;
}

async function generatePortraitOrCoverImage(params: {
  prompt: string;
  aspectRatio: '1:1' | '16:9';
  referenceImages?: Array<{ mimeType: string; data: string }>;
}): Promise<string | undefined> {
  try {
    const ai = getGenAI();
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    for (const img of (params.referenceImages || []).slice(0, 2)) {
      if (img?.data && img?.mimeType) {
        const cleanData = img.data.includes(',') ? img.data.split(',')[1] : img.data;
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: cleanData,
          },
        });
      }
    }
    parts.push({ text: params.prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: [{ role: 'user', parts }],
      config: {
        imageConfig: {
          aspectRatio: params.aspectRatio,
          imageSize: '1K',
        },
      },
    });

    const outParts = response.candidates?.[0]?.content?.parts || [];
    for (const part of outParts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
  } catch (err) {
    console.warn('[image-gen] non-fatal fallback:', err instanceof Error ? err.message : err);
  }
  return undefined;
}

async function generateAnimatedOmniClip(params: {
  prompt: string;
  referenceImageDataUrl?: string;
}): Promise<string | undefined> {
  try {
    const ai = getGenAI();
    const input: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mime_type: string }
    > = [{ type: 'text', text: params.prompt }];

    if (params.referenceImageDataUrl && params.referenceImageDataUrl.includes(',')) {
      const [header, base64] = params.referenceImageDataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+);/);
      input.push({
        type: 'image',
        data: base64,
        mime_type: mimeMatch ? mimeMatch[1] : 'image/png',
      });
    }

    const interaction = await ai.interactions.create({
      model: 'gemini-omni-1.2-flash',
      input,
      response_format: {
        type: 'video',
        aspect_ratio: '16:9',
        duration: '5s',
        resolution: '720p',
      },
    } as unknown as Parameters<typeof ai.interactions.create>[0]);

    const outputs = (interaction as unknown as {
      outputs?: Array<{ type?: string; data?: string; mime_type?: string }>;
    }).outputs || [];
    const videoOut = outputs.find((o) => o.type === 'video' && o.data);
    if (videoOut?.data) {
      const mime = videoOut.mime_type || 'video/mp4';
      return `data:${mime};base64,${videoOut.data}`;
    }
  } catch (err) {
    console.warn('[omni-video] non-fatal fallback:', err instanceof Error ? err.message : err);
  }
  return undefined;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '28mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      ttsModel: 'gemini-3.8-flash-tts',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // --- PrimeTech / AgentSam Ecosystem & Architectural Intelligence MCP Endpoints ---
  app.get('/api/primetech/ecosystem', (_req: Request, res: Response) => {
    try {
      res.json(ecosystemRepo.getSnapshot());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load PrimeTech ecosystem snapshot.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/primetech/arch-lookup', (req: Request, res: Response) => {
    try {
      const nominal = typeof req.query.nominal === 'string' ? req.query.nominal : undefined;
      res.json({
        nominal: nominal || 'all',
        specs: ecosystemRepo.lookupLumber(nominal),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to query arch.material.lookup.';
      res.status(500).json({ error: message });
    }
  });

  // --- studio_templates SQLite Registry Endpoints ---
  app.get('/api/templates', (req: Request, res: Response) => {
    try {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const resource_kind =
        typeof req.query.resource_kind === 'string' ? req.query.resource_kind : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const templates = templatesRepo.listTemplates({
        category,
        resource_kind,
        status,
        q,
      });
      res.json({ templates });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list studio_templates.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/templates/export.sql', (_req: Request, res: Response) => {
    try {
      const sql = templatesRepo.exportSqlSeed();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export SQL seed.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/templates/:id', (req: Request, res: Response) => {
    try {
      const found = templatesRepo.getTemplateById(String(req.params.id));
      if (!found) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      res.json({ template: found });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch template.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/templates', (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const title = String(body.title || '').trim();
      const category = String(body.category || 'sky').trim();
      const resource_kind = String(body.resource_kind || 'sky_shader').trim();
      if (!title) {
        res.status(400).json({ error: 'Template title is required.' });
        return;
      }
      const created = templatesRepo.createTemplate({
        id: typeof body.id === 'string' ? body.id : undefined,
        sku: typeof body.sku === 'string' ? body.sku : undefined,
        app_id: typeof body.app_id === 'string' ? body.app_id : 'samscene-studio',
        resource_kind,
        pack_slug: typeof body.pack_slug === 'string' ? body.pack_slug : null,
        pack_title: typeof body.pack_title === 'string' ? body.pack_title : null,
        category,
        title,
        description: typeof body.description === 'string' ? body.description : null,
        use_case: typeof body.use_case === 'string' ? body.use_case : null,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
        specs:
          body.specs && typeof body.specs === 'object'
            ? (body.specs as Record<string, unknown>)
            : {},
        payload:
          body.payload && typeof body.payload === 'object'
            ? (body.payload as Record<string, unknown>)
            : undefined,
        preview_data_url:
          typeof body.preview_data_url === 'string' ? body.preview_data_url : null,
        renderer_key: typeof body.renderer_key === 'string' ? body.renderer_key : null,
        compatible_apps: Array.isArray(body.compatible_apps)
          ? body.compatible_apps.map(String)
          : ['samscene-studio', 'samspeak'],
        source_refs: Array.isArray(body.source_refs)
          ? (body.source_refs as Array<Record<string, unknown>>)
          : [],
        status:
          body.status === 'draft' || body.status === 'active' || body.status === 'archived'
            ? body.status
            : 'active',
        sort_order: typeof body.sort_order === 'number' ? body.sort_order : 10,
      });
      res.status(201).json({ template: created });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create template.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/templates/:id', (req: Request, res: Response) => {
    try {
      const deleted = templatesRepo.deleteTemplate(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Template not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<TtsPayload>;
      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      if (!rawText) {
        res.status(400).json({ error: 'Please enter a script to synthesize.' });
        return;
      }
      if (rawText.length > 4000) {
        res.status(400).json({ error: 'Script is too long (max 4000 characters).' });
        return;
      }

      const ai = getGenAI();
      const mode = body.mode === 'dual' ? 'dual' : 'single';

      let response;
      if (mode === 'dual') {
        const dual = body as Partial<TtsDualPayload>;
        const speakerA = (dual.speakerA || 'Alex').trim() || 'Alex';
        const speakerB = (dual.speakerB || 'Sam').trim() || 'Sam';
        const voiceA = VALID_VOICES.has(dual.voiceA || '') ? String(dual.voiceA) : 'Puck';
        const voiceB = VALID_VOICES.has(dual.voiceB || '') ? String(dual.voiceB) : 'Kore';
        const styleA = (dual.styleA || 'Enthusiastic creative director').trim();
        const styleB = (dual.styleB || 'Curious sound designer').trim();

        const parts = parseDualDialogueParts(rawText, speakerA, speakerB, styleA, styleB);

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: speakerA,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: voiceA },
                    },
                  },
                  {
                    speaker: speakerB,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: voiceB },
                    },
                  },
                ],
              },
            },
          },
        });
      } else {
        const single = body as Partial<TtsSinglePayload>;
        const voiceName = VALID_VOICES.has(single.voiceName || '')
          ? String(single.voiceName)
          : 'Kore';
        const stylePrompt = (single.stylePrompt || '').trim();

        const part: { text: string; speechMetadata?: { style: string } } = {
          text: rawText,
        };
        if (stylePrompt) {
          part.speechMetadata = { style: stylePrompt };
        }

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [part],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });
      }

      const candidateParts = response.candidates?.[0]?.content?.parts || [];
      let base64Audio: string | undefined;
      let mimeType = 'audio/wav';
      for (const p of candidateParts) {
        if (p.inlineData?.data) {
          base64Audio = p.inlineData.data;
          mimeType = p.inlineData.mimeType || 'audio/wav';
          break;
        }
      }

      if (!base64Audio) {
        res.status(502).json({
          error: 'Gemini TTS returned no audio data. Please try adjusting the script.',
        });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType,
        model: 'gemini-3.8-flash-tts',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate speech.';
      console.error('[/api/tts] error:', message);
      res.status(500).json({ error: message });
    }
  });

  async function generateTextWithFallback(params: {
    contents: unknown;
    systemInstruction: string;
    responseMimeType?: string;
    responseSchema?: unknown;
  }) {
    const ai = getGenAI();
    const runModel = async (model: string, level: ThinkingLevel) => {
      const config: Record<string, unknown> = {
        thinkingConfig: { thinkingLevel: level },
        systemInstruction: params.systemInstruction,
      };
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.responseSchema) config.responseSchema = params.responseSchema;

      return ai.models.generateContent({
        model,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: config as Parameters<typeof ai.models.generateContent>[0]['config'],
      });
    };

    try {
      return await Promise.race([
        runModel('gemini-4-hydrogen', ThinkingLevel.LOW),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_4_TIMEOUT')), 11000)
        ),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GEMINI_4_TIMEOUT' || msg.includes('404') || msg.includes('NOT_FOUND')) {
        return await runModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL);
      }
      throw err;
    }
  }

  app.post('/api/script-assist', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        subjectTitle?: string;
        subjectDescription?: string;
        mode?: 'single' | 'dual';
        topic?: string;
      };
      const mode = body.mode === 'dual' ? 'dual' : 'single';
      const subjectTitle = body.subjectTitle || 'Harmonic Astrolabe';
      const subjectDescription =
        body.subjectDescription || 'a kinetic brass and glass spatial sculpture';
      const topic = (body.topic || '').trim();

      const prompt =
        mode === 'dual'
          ? `Write a concise, lively 2-turn creative studio dialogue between Alex and Sam reacting to "${subjectTitle}" (${subjectDescription}). ${topic ? `Focus on: ${topic}.` : ''} Include 1 natural vocal burst like <breath> or <laugh> and 1 backchannel like |yeah| or |mhm|. Format strictly as two lines starting with "Alex: " and "Sam: ". Keep under 45 words total.`
          : `Write a vivid, cinematic 2-sentence studio showcase narration about "${subjectTitle}" (${subjectDescription}). ${topic ? `Focus on: ${topic}.` : ''} Include one subtle <breath> cue where natural. Keep under 38 words total.`;

      const response = await generateTextWithFallback({
        contents: prompt,
        systemInstruction:
          'You are a creative director writing ultra-concise, expressive voiceover scripts for a 3D XR design studio. Return only the script text, no markdown fences or quotes.',
      });

      const script = (response.text || '').trim();
      if (!script) {
        res.status(502).json({ error: 'No script text returned.' });
        return;
      }
      res.json({ script });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate script.';
      console.error('[/api/script-assist] error:', message);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/compose', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        subjectLabel?: string;
        mood?: string;
        images?: Array<{ mimeType?: string; data?: string; name?: string }>;
      };
      const userPrompt = (body.prompt || '').trim();
      const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];

      if (!userPrompt && images.length === 0) {
        res.status(400).json({
          error: 'Type a movie/adventure prompt or drop an image for miniAgentSam.',
        });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      for (const img of images) {
        if (img?.data && img?.mimeType) {
          const cleanData = img.data.includes(',')
            ? img.data.split(',')[1]
            : img.data;
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: cleanData,
            },
          });
        }
      }

      const subjectLabel = body.subjectLabel || 'Astrolabe';
      const currentMood = body.mood || 'studio';
      const instruction = [
        `Compose a 3 to 4 beat cinematic 3D guided movie walkthrough & SamSpeak audio storyboard for SamScene.`,
        `Current 3D centerpiece: "${subjectLabel}". Current atmosphere: "${currentMood}".`,
        images.length > 0
          ? `The user dropped ${images.length} reference image(s) into the 3D scene—weave visual details from those images directly into the narration, mood, and camera beats.`
          : '',
        userPrompt
          ? `User creative brief: "${userPrompt}"`
          : `Create a vivid guided adventure around the dropped imagery and 3D sculpture.`,
        `Each beat must specify:`,
        `- title: short 2-4 word scene title`,
        `- script: 1-2 expressive spoken sentences (under 35 words). Can include <breath>, <laugh>, or if ttsMode is "dual", two lines starting with "Alex: " and "Sam: " using |yeah| or |mhm|.`,
        `- ttsMode: "single" or "dual"`,
        `- voiceName: one of "Kore", "Puck", "Charon", "Fenrir", "Zephyr", "Aoede", "Leda", "Orus", "Callirrhoe", "Autonoe", "Sulafat", "Enceladus", "Gacrux", "Despina", "Umbriel"`,
        `- voiceStyle: concise speaking direction (e.g. "Warm cinematic documentary narrator")`,
        `- cameraShot: one of "establishing", "hero", "closeup", "lowAngle", "overhead", "leftProp", "rightProp"`,
        `- transitionType: one of "glide", "dolly", "orbit", "crane", "cut"`,
        `- mood: one of "studio", "sunset", "twilight", "noir", "dawn"`,
        `- explodeAmount: number between 0 and 0.85`,
        `- skyProgression: number between 0.0 and 1.0 representing sky time/celestial progression`,
      ]
        .filter(Boolean)
        .join('\n');

      parts.push({ text: instruction });

      const response = await generateTextWithFallback({
        contents: { parts },
        systemInstruction:
          'You are miniAgentSam, an imaginative 3D movie director, scenery designer, and voiceover writer. Output valid JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['movieTitle', 'beats'],
          properties: {
            movieTitle: { type: Type.STRING },
            beats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'title',
                  'script',
                  'ttsMode',
                  'voiceName',
                  'voiceStyle',
                  'cameraShot',
                  'transitionType',
                  'mood',
                  'explodeAmount',
                ],
                properties: {
                  title: { type: Type.STRING },
                  script: { type: Type.STRING },
                  ttsMode: { type: Type.STRING },
                  voiceName: { type: Type.STRING },
                  voiceStyle: { type: Type.STRING },
                  cameraShot: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  mood: { type: Type.STRING },
                  explodeAmount: { type: Type.NUMBER },
                  skyProgression: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      });

      const raw = (response.text || '{}').trim();
      const parsed = JSON.parse(raw) as {
        movieTitle?: string;
        beats?: Array<Record<string, unknown>>;
      };

      if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
        res.status(502).json({ error: 'miniAgentSam returned an empty storyboard.' });
        return;
      }

      res.json({
        movieTitle: parsed.movieTitle || 'Untitled Spatial Story',
        beats: parsed.beats,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to compose storyboard.';
      console.error('[/api/compose] error:', message);
      res.status(500).json({ error: message });
    }
  });

  // --- miniAgentSam Character Studio: 1 Image or Prompt -> 3D Cartoon Rig + Portrait + Optional Video ---
  app.post('/api/agent/character-studio', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        stylePreset?: CharacterStylePresetId;
        referenceImages?: Array<{ mimeType: string; data: string; name?: string }>;
        generatePortrait?: boolean;
        generateAnimationVideo?: boolean;
      };

      const userPrompt = (body.prompt || '').trim();
      const stylePreset: CharacterStylePresetId = body.stylePreset || 'pixar-cinematic';
      const refImages = Array.isArray(body.referenceImages)
        ? body.referenceImages.slice(0, 3)
        : [];

      if (!userPrompt && refImages.length === 0) {
        res.status(400).json({
          error:
            'Provide a character description or drop an image/video frame to turn into a 3D cartoon character.',
        });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      for (const img of refImages) {
        if (img?.data && img?.mimeType) {
          const cleanData = img.data.includes(',') ? img.data.split(',')[1] : img.data;
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: cleanData,
            },
          });
        }
      }

      parts.push({
        text: [
          `Design a cinematic 3D cartoon character actor rig ("${stylePreset}" aesthetic) for SamScene.`,
          refImages.length > 0
            ? `Extract the character silhouette, colors, outfit, headgear, held prop, and expressive personality from the attached reference image(s).`
            : '',
          userPrompt ? `User direction: "${userPrompt}"` : '',
          `Return a JSON specification with:`,
          `- name: character name`,
          `- archetype: concise 2-4 word title`,
          `- bio: 1-2 sentence vivid character backstory`,
          `- introScript: 1-2 expressive spoken lines for SamSpeak TTS`,
          `- voiceName: one of "Puck", "Kore", "Zephyr", "Fenrir", "Aoede", "Leda", "Orus", "Charon"`,
          `- voiceStyle: speaking style prompt`,
          `- headShape: "rounded" | "chibi" | "heroic" | "robotic"`,
          `- headgear: "none" | "cat-ears" | "crown" | "antennae" | "wizard-hat" | "astronaut-helmet" | "horns" | "crest"`,
          `- outfit: "jacket" | "cape" | "mech-armor" | "robe" | "explorer"`,
          `- propItem: "none" | "cosmic-orb" | "star-wand" | "lantern" | "microphone" | "hoverboard"`,
          `- animationStyle: "bouncy-cartoon" | "heroic-idle" | "floating-cosmic" | "dance-groove" | "talk-gesture"`,
          `- scaleHeight: number between 0.8 and 1.35`,
          `- palette: { skinHex, primaryHex, secondaryHex, accentHex, eyeHex, hairHex } (all #RRGGBB)`,
          `- poseKeyframes: array of 3 timestamped poses ({ timestampSec: 0..4, poseName, actionDescription, headTiltDeg: -22..22, armRaise: 0..1.2, bounceAmplitude: 0..0.08, propSpinSpeed: 0.4..2.8, expression: "joyful"|"curious"|"heroic"|"serene" })`,
          `- portraitPrompt: rich visual prompt to render a studio turnaround portrait of this exact character`,
        ]
          .filter(Boolean)
          .join('\n'),
      });

      const response = await generateTextWithFallback({
        contents: { parts },
        systemInstruction:
          'You are miniAgentSam Lead Character Technical Director. Output valid JSON matching the character rig schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'name',
            'archetype',
            'bio',
            'introScript',
            'voiceName',
            'voiceStyle',
            'headShape',
            'headgear',
            'outfit',
            'propItem',
            'animationStyle',
            'scaleHeight',
            'palette',
            'poseKeyframes',
            'portraitPrompt',
          ],
          properties: {
            name: { type: Type.STRING },
            archetype: { type: Type.STRING },
            bio: { type: Type.STRING },
            introScript: { type: Type.STRING },
            voiceName: { type: Type.STRING },
            voiceStyle: { type: Type.STRING },
            headShape: { type: Type.STRING },
            headgear: { type: Type.STRING },
            outfit: { type: Type.STRING },
            propItem: { type: Type.STRING },
            animationStyle: { type: Type.STRING },
            scaleHeight: { type: Type.NUMBER },
            palette: {
              type: Type.OBJECT,
              required: [
                'skinHex',
                'primaryHex',
                'secondaryHex',
                'accentHex',
                'eyeHex',
                'hairHex',
              ],
              properties: {
                skinHex: { type: Type.STRING },
                primaryHex: { type: Type.STRING },
                secondaryHex: { type: Type.STRING },
                accentHex: { type: Type.STRING },
                eyeHex: { type: Type.STRING },
                hairHex: { type: Type.STRING },
              },
            },
            poseKeyframes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'timestampSec',
                  'poseName',
                  'actionDescription',
                  'headTiltDeg',
                  'armRaise',
                  'bounceAmplitude',
                  'propSpinSpeed',
                  'expression',
                ],
                properties: {
                  timestampSec: { type: Type.NUMBER },
                  poseName: { type: Type.STRING },
                  actionDescription: { type: Type.STRING },
                  headTiltDeg: { type: Type.NUMBER },
                  armRaise: { type: Type.NUMBER },
                  bounceAmplitude: { type: Type.NUMBER },
                  propSpinSpeed: { type: Type.NUMBER },
                  expression: { type: Type.STRING },
                },
              },
            },
            portraitPrompt: { type: Type.STRING },
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as Record<string, unknown>;

      let portraitDataUrl: string | undefined;
      if (body.generatePortrait !== false) {
        portraitDataUrl = await generatePortraitOrCoverImage({
          prompt: `${String(parsed.portraitPrompt || parsed.name || '3D cartoon character')}, ${stylePreset} character turnaround portrait, subsurface scattering, expressive studio rim lighting, clean dark slate background`,
          aspectRatio: '1:1',
          referenceImages: refImages,
        });
      }

      let animatedVideoDataUrl: string | undefined;
      if (body.generateAnimationVideo) {
        animatedVideoDataUrl = await generateAnimatedOmniClip({
          prompt: `Cinematic 3D animated character shot of ${String(parsed.name || 'Cartoon Hero')}, ${String(parsed.archetype || 'Explorer')}, expressive idle gesture under cosmic sky lighting`,
          referenceImageDataUrl: portraitDataUrl || refImages[0]?.data,
        });
      }

      const validHeadShapes = new Set(['rounded', 'chibi', 'heroic', 'robotic']);
      const validHeadgear = new Set([
        'none',
        'cat-ears',
        'crown',
        'antennae',
        'wizard-hat',
        'astronaut-helmet',
        'horns',
        'crest',
      ]);
      const validOutfits = new Set(['jacket', 'cape', 'mech-armor', 'robe', 'explorer']);
      const validProps = new Set([
        'none',
        'cosmic-orb',
        'star-wand',
        'lantern',
        'microphone',
        'hoverboard',
      ]);
      const validAnim = new Set([
        'bouncy-cartoon',
        'heroic-idle',
        'floating-cosmic',
        'dance-groove',
        'talk-gesture',
      ]);

      const rawPal = (parsed.palette || {}) as Record<string, unknown>;
      const rawKeyframes = Array.isArray(parsed.poseKeyframes) ? parsed.poseKeyframes : [];

      const poseKeyframes: CharacterPoseKeyframe[] = rawKeyframes
        .slice(0, 6)
        .map((kf: Record<string, unknown>, idx: number) => ({
          timestampSec: Number(kf.timestampSec ?? idx * 1.4),
          poseName: String(kf.poseName || `Pose ${idx + 1}`),
          actionDescription: String(
            kf.actionDescription || 'Expressive spatial studio stance'
          ),
          headTiltDeg: Math.max(-28, Math.min(28, Number(kf.headTiltDeg) || 6)),
          armRaise: Math.max(0, Math.min(1.4, Number(kf.armRaise) || 0.35)),
          bounceAmplitude: Math.max(0, Math.min(0.12, Number(kf.bounceAmplitude) || 0.03)),
          propSpinSpeed: Math.max(0.2, Math.min(3.5, Number(kf.propSpinSpeed) || 1.2)),
          expression:
            kf.expression === 'curious' ||
            kf.expression === 'heroic' ||
            kf.expression === 'serene'
              ? kf.expression
              : 'joyful',
        }));

      const character: CharacterRigSpec = {
        id: `char-${Date.now().toString(36)}`,
        name: String(parsed.name || 'Nova Sprocket'),
        archetype: String(parsed.archetype || 'Galactic Cartoon Navigator'),
        stylePreset,
        bio: String(
          parsed.bio ||
            'An imaginative animated hero built in SamScene Character Studio.'
        ),
        voiceName: (VALID_VOICES.has(String(parsed.voiceName || ''))
          ? String(parsed.voiceName)
          : 'Puck') as VoiceName,
        voiceStyle: String(parsed.voiceStyle || 'Bright, expressive animated hero'),
        introScript: String(
          parsed.introScript ||
            'Ready to pilot our next spatial storyboard across the nebula!'
        ),
        headShape: (validHeadShapes.has(String(parsed.headShape).trim())
          ? String(parsed.headShape).trim()
          : 'rounded') as CharacterRigSpec['headShape'],
        headgear: (validHeadgear.has(String(parsed.headgear))
          ? String(parsed.headgear)
          : 'astronaut-helmet') as CharacterRigSpec['headgear'],
        outfit: (validOutfits.has(String(parsed.outfit))
          ? String(parsed.outfit)
          : 'explorer') as CharacterRigSpec['outfit'],
        propItem: (validProps.has(String(parsed.propItem))
          ? String(parsed.propItem)
          : 'star-wand') as CharacterRigSpec['propItem'],
        animationStyle: (validAnim.has(String(parsed.animationStyle))
          ? String(parsed.animationStyle)
          : 'bouncy-cartoon') as CharacterRigSpec['animationStyle'],
        scaleHeight: Math.max(0.75, Math.min(1.4, Number(parsed.scaleHeight) || 1.0)),
        palette: {
          skinHex: cleanHex(rawPal.skinHex, '#f6c7a8'),
          primaryHex: cleanHex(rawPal.primaryHex, '#3b82f6'),
          secondaryHex: cleanHex(rawPal.secondaryHex, '#1e293b'),
          accentHex: cleanHex(rawPal.accentHex, '#f59e0b'),
          eyeHex: cleanHex(rawPal.eyeHex, '#38bdf8'),
          hairHex: cleanHex(rawPal.hairHex, '#4f46e5'),
        },
        poseKeyframes,
        portraitDataUrl: portraitDataUrl || refImages[0]?.data,
        animatedVideoDataUrl,
      };

      const template = templatesRepo.createTemplate({
        sku: `SAM-CHR-${character.id.toUpperCase()}`,
        app_id: 'samscene-studio',
        resource_kind: 'character_actor',
        pack_slug: `character-${character.id}`,
        pack_title: `${character.name} Character Rig`,
        category: 'character',
        title: `${character.name} — ${character.archetype}`,
        description: character.introScript,
        use_case: '3D articulated cartoon actor with SamSpeak lip-sync and pose keyframes',
        tags: ['character', stylePreset, character.headShape, character.propItem],
        specs: {
          stylePreset: character.stylePreset,
          voiceName: character.voiceName,
          headShape: character.headShape,
          outfit: character.outfit,
          poseKeyframeCount: poseKeyframes.length,
        },
        payload: {
          character,
        },
        preview_data_url: character.portraitDataUrl || null,
        renderer_key: 'samscene.character.rig.v1',
        status: 'active',
      });

      res.json({
        character,
        portraitDataUrl: character.portraitDataUrl,
        animatedVideoDataUrl,
        template,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate 3D cartoon character.';
      console.error('[/api/agent/character-studio] error:', message);
      res.status(500).json({ error: message });
    }
  });

  // --- Video Upload Keyframe Parser -> Procedural Scene Pack Extractor ---
  app.post('/api/agent/video-keyframe-pack', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        videoName?: string;
        keyframes?: ExtractedVideoKeyframe[];
        generateCoverArt?: boolean;
        generateAnimationVideo?: boolean;
      };

      const videoName = (body.videoName || 'Uploaded Video').trim();
      const userPrompt = (body.prompt || '').trim();
      const keyframes = Array.isArray(body.keyframes) ? body.keyframes.slice(0, 6) : [];

      if (keyframes.length === 0 && !userPrompt) {
        res.status(400).json({
          error: 'No video keyframes or prompt provided for Scene Pack extraction.',
        });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      for (const kf of keyframes) {
        if (kf?.dataUrl && kf.dataUrl.includes(',')) {
          const [header, base64] = kf.dataUrl.split(',');
          const mimeMatch = header.match(/data:([^;]+);/);
          parts.push({
            inlineData: {
              mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
              data: base64,
            },
          });
          parts.push({
            text: `Keyframe #${kf.index + 1} at t=${kf.timestampSec}s (dominant color swatch: ${kf.dominantHex})`,
          });
        }
      }

      parts.push({
        text: [
          `Analyze the uploaded video "${videoName}" (${keyframes.length} timestamped keyframes) and extract a complete procedural 3D Scene Pack for SamScene.`,
          userPrompt ? `Additional user creative direction: "${userPrompt}"` : '',
          `Extract and synthesize:`,
          `1. packTitle & summary describing the sky atmosphere, motion arc, and surface palette observed across the keyframes.`,
          `2. environmentId ("studio-stage"|"architectural-atrium"|"twilight-forest"|"coastal-observatory"|"orbital-lab"), moodId ("studio"|"sunset"|"twilight"|"noir"|"dawn"), subjectId ("astrolabe"|"pavilion"|"vox"|"terrarium"), finishId ("gold"|"titanium"|"obsidian"|"copper"|"iridescent").`,
          `3. skyConfig: procedural sky dome parameters matching the video sky/background:`,
          `   - presetId: one of "diurnal-cloudscape", "andromeda-nebula", "aurora-borealis", "exoplanet-rings", "supernova-remnant", "orbital-eclipse", "pastel-anime-sky", "studio-void"`,
          `   - title: descriptive sky dome name`,
          `   - triggerMode: "scroll-reactive" or "hover-reactive" or "orbit-time" or "audio-reactive"`,
          `   - zenithHex, horizonHex, nadirHex, cloudPrimaryHex, cloudAccentHex, nebulaPrimaryHex, nebulaSecondaryHex, sunHex (#RRGGBB hex colors sampled from the keyframes)`,
          `   - cloudDensity (0..1), cloudScale (1.2..3.2), cirrusWisps (0..1), starIntensity (0..1), galaxyIntensity (0..1), auroraIntensity (0..1)`,
          `   - sunElevation (0.08..0.85), progression (0..1), evolutionSpeed (0.1..1.2)`,
          `   - celestialBody: "none"|"spiral-galaxy"|"ringed-planet"|"twin-suns"|"eclipse-corona"|"comet-shower"`,
          `4. extractedTextures: array of 3 surface texture specs for surfaceRole "sky-cloud", "stage-floor", and "hero-finish", each with name, surfaceRole, primaryHex, secondaryHex, accentHex, roughness (0.08..0.9), metalness (0.05..0.95), patternType ("cirrus-wisp"|"nebula-swirl"|"travertine-vein"|"cel-halftone"|"metallic-brush").`,
          `5. cameraPath: array of ${Math.max(3, keyframes.length)} timestamped camera path keyframes matching the video progression, each with timestampSec, shotId ("establishing"|"hero"|"closeup"|"lowAngle"|"overhead"|"leftProp"|"rightProp"), transitionType ("glide"|"dolly"|"orbit"|"crane"|"cut"), position ([x,y,z] near stage [0, 1.2..2.2, -0.8..1.6]), target ([x, 0.9..1.3, -1.25]), fovDeg (38..58), skyProgression (0..1), motionNote.`,
          `6. character: a 3D cartoon character actor inspired by the video's energy and color palette, including name, archetype, bio, introScript, voiceName, voiceStyle, headShape ("rounded"|"chibi"|"heroic"|"robotic"), headgear, outfit, propItem, animationStyle, palette, and 3-4 poseKeyframes (timestampSec, poseName, actionDescription, headTiltDeg, armRaise, bounceAmplitude, propSpinSpeed, expression).`,
          `7. sceneryProps: 3-4 stage props ({ type: "pine"|"boulders"|"lantern"|"arch", position: [x,0,z], rotationY: number }).`,
          `8. beats: 3-4 SamSpeak guided movie beats synchronized to the extracted cameraPath and skyProgression.`,
          `9. coverArtPrompt: vivid 16:9 poster art prompt representing this Scene Pack.`,
        ]
          .filter(Boolean)
          .join('\n'),
      });

      const response = await generateTextWithFallback({
        contents: { parts },
        systemInstruction:
          'You are miniAgentSam Scene Pack Architect. Parse the timestamped video keyframes to extract procedural textures, 3D camera paths, character pose keyframes, sky shaders, and storyboard beats as valid JSON.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: [
            'packTitle',
            'summary',
            'environmentId',
            'moodId',
            'subjectId',
            'finishId',
            'skyConfig',
            'extractedTextures',
            'cameraPath',
            'character',
            'sceneryProps',
            'beats',
            'coverArtPrompt',
          ],
          properties: {
            packTitle: { type: Type.STRING },
            summary: { type: Type.STRING },
            environmentId: { type: Type.STRING },
            moodId: { type: Type.STRING },
            subjectId: { type: Type.STRING },
            finishId: { type: Type.STRING },
            coverArtPrompt: { type: Type.STRING },
            skyConfig: {
              type: Type.OBJECT,
              required: [
                'presetId',
                'title',
                'triggerMode',
                'zenithHex',
                'horizonHex',
                'nadirHex',
                'cloudPrimaryHex',
                'cloudAccentHex',
                'nebulaPrimaryHex',
                'nebulaSecondaryHex',
                'sunHex',
                'cloudDensity',
                'cloudScale',
                'cirrusWisps',
                'starIntensity',
                'galaxyIntensity',
                'auroraIntensity',
                'sunElevation',
                'progression',
                'evolutionSpeed',
                'celestialBody',
              ],
              properties: {
                presetId: { type: Type.STRING },
                title: { type: Type.STRING },
                triggerMode: { type: Type.STRING },
                zenithHex: { type: Type.STRING },
                horizonHex: { type: Type.STRING },
                nadirHex: { type: Type.STRING },
                cloudPrimaryHex: { type: Type.STRING },
                cloudAccentHex: { type: Type.STRING },
                nebulaPrimaryHex: { type: Type.STRING },
                nebulaSecondaryHex: { type: Type.STRING },
                sunHex: { type: Type.STRING },
                cloudDensity: { type: Type.NUMBER },
                cloudScale: { type: Type.NUMBER },
                cirrusWisps: { type: Type.NUMBER },
                starIntensity: { type: Type.NUMBER },
                galaxyIntensity: { type: Type.NUMBER },
                auroraIntensity: { type: Type.NUMBER },
                sunElevation: { type: Type.NUMBER },
                progression: { type: Type.NUMBER },
                evolutionSpeed: { type: Type.NUMBER },
                celestialBody: { type: Type.STRING },
              },
            },
            extractedTextures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'name',
                  'surfaceRole',
                  'primaryHex',
                  'secondaryHex',
                  'accentHex',
                  'roughness',
                  'metalness',
                  'patternType',
                ],
                properties: {
                  name: { type: Type.STRING },
                  surfaceRole: { type: Type.STRING },
                  primaryHex: { type: Type.STRING },
                  secondaryHex: { type: Type.STRING },
                  accentHex: { type: Type.STRING },
                  roughness: { type: Type.NUMBER },
                  metalness: { type: Type.NUMBER },
                  patternType: { type: Type.STRING },
                },
              },
            },
            cameraPath: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'timestampSec',
                  'shotId',
                  'transitionType',
                  'position',
                  'target',
                  'fovDeg',
                  'skyProgression',
                  'motionNote',
                ],
                properties: {
                  timestampSec: { type: Type.NUMBER },
                  shotId: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  position: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                  },
                  target: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                  },
                  fovDeg: { type: Type.NUMBER },
                  skyProgression: { type: Type.NUMBER },
                  motionNote: { type: Type.STRING },
                },
              },
            },
            character: {
              type: Type.OBJECT,
              required: [
                'name',
                'archetype',
                'bio',
                'introScript',
                'voiceName',
                'voiceStyle',
                'headShape',
                'headgear',
                'outfit',
                'propItem',
                'animationStyle',
                'palette',
                'poseKeyframes',
              ],
              properties: {
                name: { type: Type.STRING },
                archetype: { type: Type.STRING },
                bio: { type: Type.STRING },
                introScript: { type: Type.STRING },
                voiceName: { type: Type.STRING },
                voiceStyle: { type: Type.STRING },
                headShape: { type: Type.STRING },
                headgear: { type: Type.STRING },
                outfit: { type: Type.STRING },
                propItem: { type: Type.STRING },
                animationStyle: { type: Type.STRING },
                palette: {
                  type: Type.OBJECT,
                  required: [
                    'skinHex',
                    'primaryHex',
                    'secondaryHex',
                    'accentHex',
                    'eyeHex',
                    'hairHex',
                  ],
                  properties: {
                    skinHex: { type: Type.STRING },
                    primaryHex: { type: Type.STRING },
                    secondaryHex: { type: Type.STRING },
                    accentHex: { type: Type.STRING },
                    eyeHex: { type: Type.STRING },
                    hairHex: { type: Type.STRING },
                  },
                },
                poseKeyframes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: [
                      'timestampSec',
                      'poseName',
                      'actionDescription',
                      'headTiltDeg',
                      'armRaise',
                      'bounceAmplitude',
                      'propSpinSpeed',
                      'expression',
                    ],
                    properties: {
                      timestampSec: { type: Type.NUMBER },
                      poseName: { type: Type.STRING },
                      actionDescription: { type: Type.STRING },
                      headTiltDeg: { type: Type.NUMBER },
                      armRaise: { type: Type.NUMBER },
                      bounceAmplitude: { type: Type.NUMBER },
                      propSpinSpeed: { type: Type.NUMBER },
                      expression: { type: Type.STRING },
                    },
                  },
                },
              },
            },
            sceneryProps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['type', 'position', 'rotationY'],
                properties: {
                  type: { type: Type.STRING },
                  position: {
                    type: Type.ARRAY,
                    items: { type: Type.NUMBER },
                  },
                  rotationY: { type: Type.NUMBER },
                },
              },
            },
            beats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'title',
                  'script',
                  'ttsMode',
                  'voiceName',
                  'voiceStyle',
                  'cameraShot',
                  'transitionType',
                  'mood',
                  'explodeAmount',
                  'skyProgression',
                ],
                properties: {
                  title: { type: Type.STRING },
                  script: { type: Type.STRING },
                  ttsMode: { type: Type.STRING },
                  voiceName: { type: Type.STRING },
                  voiceStyle: { type: Type.STRING },
                  cameraShot: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  mood: { type: Type.STRING },
                  explodeAmount: { type: Type.NUMBER },
                  skyProgression: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      });

      const parsed = JSON.parse((response.text || '{}').trim()) as Record<string, unknown>;
      const packTitle = String(parsed.packTitle || `${videoName} Sky & Stage Pack`);
      const packSlug = `${packTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 28)}-${Date.now().toString(36).slice(-4)}`;

      const rawSky = (parsed.skyConfig || {}) as Record<string, unknown>;
      const presetCandidate = String(rawSky.presetId || 'diurnal-cloudscape') as SkyPresetId;
      const baseSky =
        SKY_PRESET_MAP[presetCandidate]?.config ||
        SKY_PRESET_MAP['diurnal-cloudscape'].config;

      const skyConfig: SkySceneConfig = {
        ...baseSky,
        presetId: SKY_PRESET_MAP[presetCandidate] ? presetCandidate : 'diurnal-cloudscape',
        title: String(rawSky.title || packTitle),
        triggerMode: ([
          'orbit-time',
          'hover-reactive',
          'scroll-reactive',
          'audio-reactive',
        ].includes(String(rawSky.triggerMode))
          ? String(rawSky.triggerMode)
          : 'scroll-reactive') as SkyTriggerMode,
        zenithHex: cleanHex(rawSky.zenithHex, baseSky.zenithHex),
        horizonHex: cleanHex(rawSky.horizonHex, baseSky.horizonHex),
        nadirHex: cleanHex(rawSky.nadirHex, baseSky.nadirHex),
        cloudPrimaryHex: cleanHex(rawSky.cloudPrimaryHex, baseSky.cloudPrimaryHex),
        cloudAccentHex: cleanHex(rawSky.cloudAccentHex, baseSky.cloudAccentHex),
        nebulaPrimaryHex: cleanHex(rawSky.nebulaPrimaryHex, baseSky.nebulaPrimaryHex),
        nebulaSecondaryHex: cleanHex(rawSky.nebulaSecondaryHex, baseSky.nebulaSecondaryHex),
        sunHex: cleanHex(rawSky.sunHex, baseSky.sunHex),
        cloudDensity: Math.max(0, Math.min(1, Number(rawSky.cloudDensity ?? baseSky.cloudDensity))),
        cloudScale: Math.max(0.8, Math.min(4.0, Number(rawSky.cloudScale ?? baseSky.cloudScale))),
        cirrusWisps: Math.max(0, Math.min(1, Number(rawSky.cirrusWisps ?? baseSky.cirrusWisps))),
        starIntensity: Math.max(
          0,
          Math.min(1.2, Number(rawSky.starIntensity ?? baseSky.starIntensity))
        ),
        galaxyIntensity: Math.max(
          0,
          Math.min(1.2, Number(rawSky.galaxyIntensity ?? baseSky.galaxyIntensity))
        ),
        auroraIntensity: Math.max(
          0,
          Math.min(1.2, Number(rawSky.auroraIntensity ?? baseSky.auroraIntensity))
        ),
        sunElevation: Math.max(
          0.05,
          Math.min(0.9, Number(rawSky.sunElevation ?? baseSky.sunElevation))
        ),
        progression: Math.max(0, Math.min(1, Number(rawSky.progression ?? baseSky.progression))),
        evolutionSpeed: Math.max(
          0.05,
          Math.min(1.5, Number(rawSky.evolutionSpeed ?? baseSky.evolutionSpeed))
        ),
        celestialBody: ([
          'none',
          'spiral-galaxy',
          'ringed-planet',
          'twin-suns',
          'eclipse-corona',
          'comet-shower',
        ].includes(String(rawSky.celestialBody))
          ? String(rawSky.celestialBody)
          : baseSky.celestialBody) as SkySceneConfig['celestialBody'],
        immersiveSkyOnly: false,
      };

      const rawTextures = Array.isArray(parsed.extractedTextures)
        ? parsed.extractedTextures
        : [];
      const extractedTextures: ExtractedSurfaceTextureSpec[] = rawTextures
        .slice(0, 4)
        .map((t: Record<string, unknown>, idx: number) => ({
          id: `tex-${idx + 1}`,
          name: String(t.name || `Keyframe Surface ${idx + 1}`),
          surfaceRole:
            t.surfaceRole === 'stage-floor' ||
            t.surfaceRole === 'hero-finish' ||
            t.surfaceRole === 'character-outfit'
              ? t.surfaceRole
              : 'sky-cloud',
          primaryHex: cleanHex(
            t.primaryHex,
            keyframes[idx % Math.max(1, keyframes.length)]?.dominantHex || '#38bdf8'
          ),
          secondaryHex: cleanHex(t.secondaryHex, '#1e293b'),
          accentHex: cleanHex(t.accentHex, '#f8fafc'),
          roughness: Math.max(0.05, Math.min(0.95, Number(t.roughness) || 0.35)),
          metalness: Math.max(0, Math.min(1, Number(t.metalness) || 0.4)),
          patternType:
            t.patternType === 'nebula-swirl' ||
            t.patternType === 'travertine-vein' ||
            t.patternType === 'cel-halftone' ||
            t.patternType === 'metallic-brush'
              ? t.patternType
              : 'cirrus-wisp',
        }));

      const rawCamPath = Array.isArray(parsed.cameraPath) ? parsed.cameraPath : [];
      const cameraPath: ExtractedCameraKeyframe[] = rawCamPath
        .slice(0, 6)
        .map((ck: Record<string, unknown>, idx: number) => {
          const posArr = Array.isArray(ck.position) ? ck.position.map(Number) : [0, 1.55, 0.45];
          const tgtArr = Array.isArray(ck.target) ? ck.target.map(Number) : [0, 1.05, -1.25];
          return {
            timestampSec: Number(ck.timestampSec ?? keyframes[idx]?.timestampSec ?? idx * 1.5),
            shotId: ([
              'establishing',
              'hero',
              'closeup',
              'lowAngle',
              'overhead',
              'leftProp',
              'rightProp',
            ].includes(String(ck.shotId))
              ? String(ck.shotId)
              : 'establishing') as CameraShotId,
            transitionType: (['glide', 'dolly', 'orbit', 'crane', 'cut'].includes(
              String(ck.transitionType)
            )
              ? String(ck.transitionType)
              : 'glide') as TransitionType,
            position: [
              Number.isFinite(posArr[0]) ? posArr[0] : 0,
              Number.isFinite(posArr[1]) ? Math.max(0.5, Math.min(3.5, posArr[1])) : 1.55,
              Number.isFinite(posArr[2]) ? posArr[2] : 0.45,
            ],
            target: [
              Number.isFinite(tgtArr[0]) ? tgtArr[0] : 0,
              Number.isFinite(tgtArr[1]) ? tgtArr[1] : 1.05,
              Number.isFinite(tgtArr[2]) ? tgtArr[2] : -1.25,
            ],
            fovDeg: Math.max(32, Math.min(68, Number(ck.fovDeg) || 46)),
            skyProgression: Math.max(
              0,
              Math.min(1, Number(ck.skyProgression ?? idx / Math.max(1, rawCamPath.length - 1)))
            ),
            motionNote: String(ck.motionNote || `Keyframe ${idx + 1} camera sweep`),
          };
        });

      let coverArtDataUrl: string | undefined;
      if (body.generateCoverArt !== false) {
        const refImgs = keyframes
          .slice(0, 2)
          .filter((k) => Boolean(k.dataUrl))
          .map((k) => ({ mimeType: 'image/jpeg', data: k.dataUrl }));
        coverArtDataUrl = await generatePortraitOrCoverImage({
          prompt: `${String(parsed.coverArtPrompt || packTitle)}, cinematic 3D spatial scene pack key art, volumetric sky clouds and celestial lighting, high-contrast studio art direction`,
          aspectRatio: '16:9',
          referenceImages: refImgs,
        });
      }
      if (!coverArtDataUrl && keyframes[0]?.dataUrl) {
        coverArtDataUrl = keyframes[0].dataUrl;
      }

      let animatedVideoDataUrl: string | undefined;
      if (body.generateAnimationVideo) {
        animatedVideoDataUrl = await generateAnimatedOmniClip({
          prompt: `Cinematic atmospheric sky and 3D stage motion for ${packTitle}: ${String(parsed.summary || '')}`,
          referenceImageDataUrl: coverArtDataUrl,
        });
      }

      const rawChar = (parsed.character || {}) as Record<string, unknown>;
      const rawCharPal = (rawChar.palette || {}) as Record<string, unknown>;
      const rawPoses = Array.isArray(rawChar.poseKeyframes) ? rawChar.poseKeyframes : [];
      const characterPoses: CharacterPoseKeyframe[] = rawPoses
        .slice(0, 6)
        .map((kf: Record<string, unknown>, idx: number) => ({
          timestampSec: Number(kf.timestampSec ?? keyframes[idx]?.timestampSec ?? idx * 1.4),
          poseName: String(kf.poseName || `Keyframe Pose ${idx + 1}`),
          actionDescription: String(
            kf.actionDescription || 'Dynamic cartoon pose synced to video beat'
          ),
          headTiltDeg: Math.max(-28, Math.min(28, Number(kf.headTiltDeg) || 8)),
          armRaise: Math.max(0, Math.min(1.4, Number(kf.armRaise) || 0.4)),
          bounceAmplitude: Math.max(0, Math.min(0.12, Number(kf.bounceAmplitude) || 0.035)),
          propSpinSpeed: Math.max(0.2, Math.min(3.5, Number(kf.propSpinSpeed) || 1.3)),
          expression:
            kf.expression === 'curious' ||
            kf.expression === 'heroic' ||
            kf.expression === 'serene'
              ? kf.expression
              : 'joyful',
        }));

      const character: CharacterRigSpec = {
        id: `char-${Date.now().toString(36)}`,
        name: String(rawChar.name || 'Cirrus Voyager'),
        archetype: String(rawChar.archetype || 'Sky Keyframe Host'),
        stylePreset: 'pixar-cinematic',
        bio: String(rawChar.bio || `Generated from ${videoName} keyframes.`),
        voiceName: (VALID_VOICES.has(String(rawChar.voiceName || ''))
          ? String(rawChar.voiceName)
          : 'Kore') as VoiceName,
        voiceStyle: String(rawChar.voiceStyle || 'Expressive spatial guide'),
        introScript: String(rawChar.introScript || `Welcome to ${packTitle}!`),
        headShape: 'rounded',
        headgear: 'astronaut-helmet',
        outfit: 'explorer',
        propItem: 'star-wand',
        animationStyle: 'floating-cosmic',
        scaleHeight: 1.0,
        palette: {
          skinHex: cleanHex(rawCharPal.skinHex, '#f6c7a8'),
          primaryHex: cleanHex(rawCharPal.primaryHex, skyConfig.horizonHex),
          secondaryHex: cleanHex(rawCharPal.secondaryHex, skyConfig.zenithHex),
          accentHex: cleanHex(rawCharPal.accentHex, skyConfig.nebulaSecondaryHex),
          eyeHex: cleanHex(rawCharPal.eyeHex, '#38bdf8'),
          hairHex: cleanHex(rawCharPal.hairHex, '#4f46e5'),
        },
        poseKeyframes: characterPoses,
        portraitDataUrl: coverArtDataUrl,
      };

      const rawScenery = Array.isArray(parsed.sceneryProps) ? parsed.sceneryProps : [];
      const sceneryProps = rawScenery
        .slice(0, 5)
        .map((sp: Record<string, unknown>, idx: number) => {
          const typeRaw = String(sp.type || sp.kind || 'lantern');
          const type: SceneryPropType =
            typeRaw === 'pine' ||
            typeRaw === 'boulders' ||
            typeRaw === 'lantern' ||
            typeRaw === 'arch'
              ? typeRaw
              : idx % 2 === 0
                ? 'lantern'
                : 'boulders';
          const pos = Array.isArray(sp.position) ? sp.position.map(Number) : [];
          return {
            type,
            position: [
              Number.isFinite(pos[0]) ? Math.max(-2.4, Math.min(2.4, pos[0])) : (idx - 1.5) * 1.1,
              0,
              Number.isFinite(pos[2]) ? Math.max(-2.8, Math.min(-0.4, pos[2])) : -1.8,
            ] as [number, number, number],
            rotationY: Number(sp.rotationY) || 0,
          };
        });

      const rawBeats = Array.isArray(parsed.beats) ? parsed.beats : [];
      const beats: MovieBeat[] = rawBeats
        .slice(0, 5)
        .map((b: Record<string, unknown>, idx: number) => ({
          id: `pack-beat-${Date.now()}-${idx}`,
          title: String(b.title || `Keyframe Scene ${idx + 1}`),
          script: String(b.script || `Exploring keyframe ${idx + 1} of ${packTitle}.`),
          ttsMode: (b.ttsMode === 'dual' ? 'dual' : 'single') as TtsMode,
          voiceName: (VALID_VOICES.has(String(b.voiceName || ''))
            ? String(b.voiceName)
            : character.voiceName) as VoiceName,
          voiceStyle: String(b.voiceStyle || character.voiceStyle),
          cameraShot: (cameraPath[idx]?.shotId || 'establishing') as CameraShotId,
          transitionType: (cameraPath[idx]?.transitionType || 'glide') as TransitionType,
          mood: (['studio', 'sunset', 'twilight', 'noir', 'dawn'].includes(String(b.mood))
            ? String(b.mood)
            : 'studio') as AtmosphereMoodId,
          explodeAmount: Math.max(0, Math.min(0.85, Number(b.explodeAmount) || 0)),
          skyProgression:
            cameraPath[idx]?.skyProgression ??
            Math.max(0, Math.min(1, Number(b.skyProgression) || idx * 0.3)),
        }));

      const environmentId = ([
        'studio-stage',
        'architectural-atrium',
        'twilight-forest',
        'coastal-observatory',
        'orbital-lab',
        'primetech-vault',
        'iamscene-circuit',
      ].includes(String(parsed.environmentId))
        ? String(parsed.environmentId)
        : 'coastal-observatory') as EnvironmentLevelId;
      const moodId = (['studio', 'sunset', 'twilight', 'noir', 'dawn'].includes(
        String(parsed.moodId)
      )
        ? String(parsed.moodId)
        : 'studio') as AtmosphereMoodId;
      const subjectId = ([
        'astrolabe',
        'pavilion',
        'vox',
        'terrarium',
        'primetech-cadmesh',
        'primetech-plinth',
      ].includes(String(parsed.subjectId))
        ? String(parsed.subjectId)
        : 'astrolabe') as StudioSubjectId;
      const finishId = (['gold', 'titanium', 'obsidian', 'copper', 'iridescent'].includes(
        String(parsed.finishId)
      )
        ? String(parsed.finishId)
        : 'gold') as FinishId;

      const mainTemplate = templatesRepo.createTemplate({
        sku: `SAM-PACK-${Date.now().toString(36).toUpperCase()}`,
        app_id: 'samscene-studio',
        resource_kind: 'scene_pack',
        pack_slug: packSlug,
        pack_title: packTitle,
        category: 'scene_pack',
        title: packTitle,
        description: String(
          parsed.summary ||
            `Extracted from ${videoName} (${keyframes.length} keyframes): procedural sky, textures, camera path, and character poses.`
        ),
        use_case: 'Video-derived procedural 3D scene pack with keyframe camera path and textures',
        tags: ['video-keyframe-pack', skyConfig.presetId, skyConfig.triggerMode, environmentId],
        specs: {
          sourceVideo: videoName,
          keyframeCount: keyframes.length,
          textureCount: extractedTextures.length,
          cameraNodeCount: cameraPath.length,
          poseKeyframeCount: characterPoses.length,
        },
        payload: {
          packSlug,
          packTitle,
          environmentId,
          moodId,
          subjectId,
          finishId,
          skyConfig,
          extractedTextures,
          cameraPath,
          character,
          characterPoses,
          sceneryProps,
          beats,
          coverArtDataUrl,
        },
        preview_data_url: coverArtDataUrl || null,
        renderer_key: 'samscene.scenepack.keyframes.v1',
        source_refs: keyframes.map((k) => ({
          index: k.index,
          timestampSec: k.timestampSec,
          dominantHex: k.dominantHex,
        })),
        status: 'active',
      });

      const skyTemplate = templatesRepo.createTemplate({
        sku: `SAM-SKY-${Date.now().toString(36).toUpperCase()}`,
        app_id: 'samscene-studio',
        resource_kind: 'sky_shader',
        pack_slug: packSlug,
        pack_title: packTitle,
        category: 'sky',
        title: `${packTitle} — Procedural Sky Dome`,
        description: `Keyframe-extracted sky shader (${skyConfig.zenithHex} → ${skyConfig.horizonHex}) with ${skyConfig.triggerMode} trigger.`,
        use_case: 'Hover/scroll reactive procedural sky dome extracted from video keyframes',
        tags: ['sky', skyConfig.presetId, skyConfig.triggerMode],
        specs: {
          presetId: skyConfig.presetId,
          triggerMode: skyConfig.triggerMode,
          celestialBody: skyConfig.celestialBody,
        },
        payload: {
          skyConfig,
          extractedTextures,
        },
        preview_data_url: coverArtDataUrl || null,
        renderer_key: 'samscene.sky.dome.v2',
        status: 'active',
      });

      res.json({
        packSlug,
        packTitle,
        summary: String(parsed.summary || ''),
        environmentId,
        moodId,
        subjectId,
        finishId,
        skyConfig,
        character,
        coverArtDataUrl,
        animatedVideoDataUrl,
        sceneryProps,
        extractedTextures,
        cameraPath,
        characterPoses,
        sourceKeyframes: keyframes,
        beats,
        templates: [mainTemplate, skyTemplate],
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to extract procedural Scene Pack from video keyframes.';
      console.error('[/api/agent/video-keyframe-pack] error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SamScene + SamSpeak server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

