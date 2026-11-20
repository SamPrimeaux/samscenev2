import type {
  AtmosphereMoodId,
  CameraShotId,
  CharacterStudioResult,
  CharacterStylePresetId,
  ComposeResponse,
  DroppedImageAsset,
  ExtractedVideoKeyframe,
  MovieBeat,
  PrimeTechEcosystemSnapshot,
  ScenePackResult,
  StudioSubjectId,
  StudioTemplateRecord,
  TransitionType,
  TtsMode,
  TtsRequest,
  TtsResponse,
  VoiceName,
} from '../types.ts';
import { SUBJECT_MAP } from '../constants.ts';

const VALID_VOICES = new Set<VoiceName>([
  'Kore',
  'Puck',
  'Charon',
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
const VALID_SHOTS = new Set<CameraShotId>([
  'establishing',
  'hero',
  'closeup',
  'lowAngle',
  'overhead',
  'leftProp',
  'rightProp',
]);
const VALID_TRANSITIONS = new Set<TransitionType>([
  'glide',
  'dolly',
  'orbit',
  'crane',
  'cut',
]);
const VALID_MOODS = new Set<AtmosphereMoodId>([
  'studio',
  'sunset',
  'twilight',
  'noir',
  'dawn',
]);

export async function synthesizeSpeech(payload: TtsRequest): Promise<TtsResponse> {
  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as Partial<TtsResponse> & { error?: string };
  if (!response.ok || !data.audioBase64) {
    throw new Error(data.error || `TTS request failed (${response.status})`);
  }

  return {
    audioBase64: data.audioBase64,
    mimeType: data.mimeType || 'audio/wav',
    model: data.model || 'gemini-3.8-flash-tts',
  };
}

export async function assistScript(params: {
  subjectId: StudioSubjectId;
  mode: TtsMode;
  topic?: string;
}): Promise<string> {
  const subject = SUBJECT_MAP[params.subjectId];
  const response = await fetch('/api/script-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subjectTitle: subject.label,
      subjectDescription: subject.description,
      mode: params.mode,
      topic: params.topic,
    }),
  });

  const data = (await response.json()) as { script?: string; error?: string };
  if (!response.ok || !data.script) {
    throw new Error(data.error || `Script assist failed (${response.status})`);
  }
  return data.script;
}

export async function composeWithMiniAgentSam(params: {
  prompt: string;
  subjectId: StudioSubjectId;
  mood: AtmosphereMoodId;
  images: DroppedImageAsset[];
}): Promise<ComposeResponse> {
  const subject = SUBJECT_MAP[params.subjectId];
  const response = await fetch('/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      subjectLabel: subject.label,
      mood: params.mood,
      images: params.images.slice(0, 4).map((img) => ({
        name: img.name,
        mimeType: img.mimeType,
        data: img.dataUrl,
      })),
    }),
  });

  const raw = (await response.json()) as {
    movieTitle?: string;
    beats?: Array<Record<string, unknown>>;
    error?: string;
  };
  if (!response.ok || !Array.isArray(raw.beats)) {
    throw new Error(raw.error || `miniAgentSam failed (${response.status})`);
  }

  const beats: MovieBeat[] = raw.beats.map((b, idx) => {
    const voiceRaw = String(b.voiceName || 'Kore') as VoiceName;
    const shotRaw = String(b.cameraShot || 'establishing') as CameraShotId;
    const transRaw = String(b.transitionType || 'glide') as TransitionType;
    const moodRaw = String(b.mood || params.mood) as AtmosphereMoodId;
    const ttsMode: TtsMode = b.ttsMode === 'dual' ? 'dual' : 'single';
    const explodeNum = Number(b.explodeAmount);

    return {
      id: `sam-beat-${Date.now()}-${idx}`,
      title: String(b.title || `Scene ${idx + 1}`),
      script: String(b.script || 'Explore the spatial studio.'),
      ttsMode,
      voiceName: VALID_VOICES.has(voiceRaw) ? voiceRaw : 'Kore',
      voiceStyle: String(b.voiceStyle || 'Warm cinematic narrator'),
      cameraShot: VALID_SHOTS.has(shotRaw) ? shotRaw : 'establishing',
      transitionType: VALID_TRANSITIONS.has(transRaw) ? transRaw : 'glide',
      mood: VALID_MOODS.has(moodRaw) ? moodRaw : params.mood,
      explodeAmount: Number.isFinite(explodeNum)
        ? Math.max(0, Math.min(1, explodeNum))
        : 0,
      skyProgression:
        typeof b.skyProgression === 'number'
          ? Math.max(0, Math.min(1, b.skyProgression))
          : undefined,
    };
  });

  return {
    movieTitle: raw.movieTitle || 'miniAgentSam Story',
    beats,
  };
}

export async function fetchStudioTemplates(filters?: {
  category?: string;
  resource_kind?: string;
  q?: string;
}): Promise<StudioTemplateRecord[]> {
  const query = new URLSearchParams();
  if (filters?.category) query.set('category', filters.category);
  if (filters?.resource_kind) query.set('resource_kind', filters.resource_kind);
  if (filters?.q) query.set('q', filters.q);
  const qs = query.toString();
  const response = await fetch(`/api/templates${qs ? `?${qs}` : ''}`);
  const data = (await response.json()) as {
    templates?: StudioTemplateRecord[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || `Failed to load studio_templates (${response.status})`);
  }
  return Array.isArray(data.templates) ? data.templates : [];
}

export async function createStudioTemplate(
  payload: Record<string, unknown>
): Promise<StudioTemplateRecord> {
  const response = await fetch('/api/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as {
    template?: StudioTemplateRecord;
    error?: string;
  };
  if (!response.ok || !data.template) {
    throw new Error(data.error || `Failed to create template (${response.status})`);
  }
  return data.template;
}

export async function deleteStudioTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Failed to delete template (${response.status})`);
  }
}

export async function exportStudioTemplatesSql(): Promise<string> {
  const response = await fetch('/api/templates/export.sql');
  if (!response.ok) {
    throw new Error(`Failed to export studio_templates SQL (${response.status})`);
  }
  return response.text();
}

export async function generateCharacterFromMedia(params: {
  prompt: string;
  stylePreset: CharacterStylePresetId;
  referenceImages: Array<{ mimeType: string; data: string; name?: string }>;
  generatePortrait: boolean;
  generateAnimationVideo: boolean;
}): Promise<CharacterStudioResult> {
  const response = await fetch('/api/agent/character-studio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as CharacterStudioResult & { error?: string };
  if (!response.ok || !data.character) {
    throw new Error(data.error || `Character Studio failed (${response.status})`);
  }
  return data;
}

export async function generateScenePackFromVideoKeyframes(params: {
  prompt: string;
  videoName: string;
  keyframes: ExtractedVideoKeyframe[];
  generateCoverArt: boolean;
  generateAnimationVideo: boolean;
}): Promise<ScenePackResult> {
  const response = await fetch('/api/agent/video-keyframe-pack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as ScenePackResult & { error?: string };
  if (!response.ok || !data.packSlug) {
    throw new Error(
      data.error || `Video keyframe scene pack extraction failed (${response.status})`
    );
  }
  return data;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface LumberLookupSpec {
  nominal: string;
  actualThicknessIn: number;
  actualWidthIn: number;
  actualThicknessMm: number;
  actualWidthMm: number;
  source: string;
}

export async function fetchPrimeTechEcosystem(): Promise<PrimeTechEcosystemSnapshot> {
  const response = await fetch('/api/primetech/ecosystem');
  const data = (await response.json()) as Partial<PrimeTechEcosystemSnapshot> & { error?: string };
  if (!response.ok || !Array.isArray(data.tools)) {
    throw new Error(data.error || `Failed to load PrimeTech ecosystem (${response.status})`);
  }
  return data as PrimeTechEcosystemSnapshot;
}

export async function lookupArchLumber(nominal?: string): Promise<LumberLookupSpec[]> {
  const qs = nominal ? `?nominal=${encodeURIComponent(nominal)}` : '';
  const response = await fetch(`/api/primetech/arch-lookup${qs}`);
  const data = (await response.json()) as { specs?: LumberLookupSpec[]; error?: string };
  if (!response.ok || !Array.isArray(data.specs)) {
    throw new Error(data.error || `Lumber lookup failed (${response.status})`);
  }
  return data.specs;
}

export function downloadWavBase64(base64: string, filename: string): void {
  const bytes = base64ToUint8Array(base64);
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


