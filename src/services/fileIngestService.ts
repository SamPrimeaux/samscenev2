import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type {
  DroppedImageAsset,
  ExtractedVideoKeyframe,
  ModelAssetStats,
  MovieBeat,
  StudioMediaAsset,
  TranscriptCue,
} from '../types.ts';
import type { AudioEngine } from './audioEngine.ts';
import { parseIfcBimFile } from './ifcParser.ts';

const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

let sharedDracoLoader: DRACOLoader | null = null;
function getDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_DECODER_URL);
  }
  return sharedDracoLoader;
}

function getFileExt(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function collectModelStats(root: THREE.Object3D, format: string): ModelAssetStats {
  let meshCount = 0;
  let vertexCount = 0;
  const materials = new Set<THREE.Material>();

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const posAttr = child.geometry?.getAttribute?.('position');
      if (posAttr) {
        vertexCount += posAttr.count;
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => materials.add(m));
      } else if (child.material) {
        materials.add(child.material);
      }
    }
  });

  return {
    format: format.toUpperCase(),
    meshCount,
    materialCount: materials.size,
    vertexCount,
  };
}

/**
 * Normalizes an arbitrary imported 3D Group onto y = 0 at studio tabletop/stage scale (~0.92m max dim)
 * and enables PBR shadow casting/receiving across all child meshes.
 */
export function normalizeImportedModel(
  root: THREE.Object3D,
  targetSize = 0.92
): THREE.Group {
  const container = new THREE.Group();
  container.add(root);
  container.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  container.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(container);
  if (box.isEmpty()) {
    throw new Error('Model contains no renderable 3D geometry.');
  }
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const scale = targetSize / maxDim;
  container.scale.setScalar(scale);
  container.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(container);
  const center = scaledBox.getCenter(new THREE.Vector3());
  container.position.set(-center.x, -scaledBox.min.y, -center.z);
  container.updateMatrixWorld(true);

  const wrapper = new THREE.Group();
  wrapper.add(container);
  return wrapper;
}

export async function processImageFile(file: File): Promise<DroppedImageAsset> {
  const dataUrlRaw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode dropped image.'));
    el.src = dataUrlRaw;
  });

  const maxSide = 1024;
  let targetW = img.naturalWidth || 800;
  let targetH = img.naturalHeight || 600;
  if (targetW > maxSide || targetH > maxSide) {
    const scale = maxSide / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id: uid('img'),
      name: file.name,
      mimeType: file.type || 'image/jpeg',
      dataUrl: dataUrlRaw,
      width: targetW,
      height: targetH,
    };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const outUrl = canvas.toDataURL(outMime, 0.86);

  return {
    id: uid('img'),
    name: file.name || 'Backdrop',
    mimeType: outMime,
    dataUrl: outUrl,
    width: targetW,
    height: targetH,
  };
}

function parseTimestampSec(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(parts[0]) || 0;
}

export function parseTranscriptContent(
  rawText: string,
  filename: string
): { cues: TranscriptCue[]; fullScript: string } {
  const ext = getFileExt(filename);
  const cues: TranscriptCue[] = [];

  if (ext === 'json') {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && 'text' in item) {
            const obj = item as {
              start?: number;
              end?: number;
              startSec?: number;
              endSec?: number;
              speaker?: string;
              text: string;
            };
            const s = Number(obj.startSec ?? obj.start ?? cues.length * 4);
            const e = Number(obj.endSec ?? obj.end ?? s + 4);
            cues.push({
              startSec: s,
              endSec: Math.max(s + 1, e),
              speaker: obj.speaker ? String(obj.speaker) : undefined,
              text: String(obj.text).trim(),
            });
          }
        }
      }
    } catch {
      // Fall through to plain line parser
    }
  }

  if (cues.length === 0 && (ext === 'srt' || ext === 'vtt' || /-->/.test(rawText))) {
    const blocks = rawText
      .replace(/^WEBVTT[^\n]*\n*/i, '')
      .trim()
      .split(/\r?\n\s*\r?\n/);
    for (const block of blocks) {
      const lines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const timeIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeIdx === -1) continue;
      const [startStr, endStr] = lines[timeIdx].split('-->');
      const startSec = parseTimestampSec(startStr);
      const endSec = parseTimestampSec(endStr.split(/\s+/)[0]);
      const caption = lines
        .slice(timeIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (!caption) continue;
      const speakerMatch = caption.match(/^([A-Za-z0-9 _-]{1,20}):\s+(.+)$/);
      cues.push({
        startSec,
        endSec: Math.max(startSec + 1, endSec),
        speaker: speakerMatch ? speakerMatch[1] : undefined,
        text: speakerMatch ? speakerMatch[2] : caption,
      });
    }
  }

  if (cues.length === 0) {
    const lines = rawText
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    let cursor = 0;
    for (const line of lines) {
      const cleanLine = line.replace(/^[-*#>\s]+/, '').trim();
      if (!cleanLine) continue;
      const speakerMatch = cleanLine.match(/^([A-Za-z0-9 _-]{1,20}):\s+(.+)$/);
      const wordCount = cleanLine.split(/\s+/).length;
      const dur = Math.max(2.5, Number((wordCount / 2.6).toFixed(1)));
      cues.push({
        startSec: cursor,
        endSec: cursor + dur,
        speaker: speakerMatch ? speakerMatch[1] : undefined,
        text: speakerMatch ? speakerMatch[2] : cleanLine,
      });
      cursor += dur;
    }
  }

  const fullScript = cues
    .map((c) => (c.speaker ? `${c.speaker}: ${c.text}` : c.text))
    .join('\n');

  return { cues, fullScript };
}

export function transcriptCuesToBeats(
  cues: TranscriptCue[],
  fallbackMood: MovieBeat['mood'] = 'studio'
): MovieBeat[] {
  const shots: MovieBeat['cameraShot'][] = [
    'establishing',
    'hero',
    'closeup',
    'lowAngle',
    'overhead',
  ];
  const transitions: MovieBeat['transitionType'][] = [
    'glide',
    'dolly',
    'orbit',
    'crane',
  ];
  // Group very short adjacent cues into 3-6 rich studio beats
  const grouped: TranscriptCue[] = [];
  for (const cue of cues) {
    const prev = grouped[grouped.length - 1];
    if (prev && grouped.length >= 1 && prev.text.length < 70 && !cue.speaker && grouped.length > cues.length / 6) {
      prev.text = `${prev.text} ${cue.text}`;
      prev.endSec = cue.endSec;
    } else {
      grouped.push({ ...cue });
    }
  }

  const slice = grouped.slice(0, 8);
  return slice.map((cue, idx) => {
    const hasSpeaker = Boolean(cue.speaker);
    const scriptText = hasSpeaker ? `${cue.speaker}: ${cue.text}` : cue.text;
    return {
      id: `beat-${Date.now()}-${idx}`,
      title: `${String(idx + 1).padStart(2, '0')} • ${cue.speaker || 'Transcript Beat'}`,
      script: scriptText,
      ttsMode: 'single',
      voiceName: idx % 2 === 0 ? 'Kore' : 'Charon',
      voiceStyle: 'Warm, articulate documentary narrator',
      cameraShot: shots[idx % shots.length],
      transitionType: transitions[idx % transitions.length],
      mood: fallbackMood,
      explodeAmount: idx % 3 === 1 ? 0.35 : 0,
      durationSec: Math.max(2, Math.round(cue.endSec - cue.startSec)),
    };
  });
}

async function parseThreeModelFile(
  file: File
): Promise<{
  root: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  const ext = getFileExt(file.name);
  const buffer = await file.arrayBuffer();

  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(getDracoLoader());
    const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
      (resolve, reject) => {
        loader.parse(
          buffer,
          '',
          (res) =>
            resolve({
              scene: res.scene,
              animations: res.animations || [],
            }),
          (err) => reject(err instanceof Error ? err : new Error('Failed to parse GLTF/GLB.'))
        );
      }
    );
    return {
      root: normalizeImportedModel(gltf.scene),
      animations: gltf.animations,
    };
  }

  if (ext === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const obj = new OBJLoader().parse(text);
    return { root: normalizeImportedModel(obj), animations: [] };
  }

  if (ext === 'stl') {
    const geo = new STLLoader().parse(buffer);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc5cdd8,
      roughness: 0.34,
      metalness: 0.68,
    });
    const mesh = new THREE.Mesh(geo, mat);
    return { root: normalizeImportedModel(mesh), animations: [] };
  }

  if (ext === 'ply') {
    const geo = new PLYLoader().parse(buffer);
    geo.computeVertexNormals();
    const hasColors = Boolean(geo.attributes.color);
    const mat = new THREE.MeshStandardMaterial({
      color: hasColors ? 0xffffff : 0xbcc6d4,
      vertexColors: hasColors,
      roughness: 0.45,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    return { root: normalizeImportedModel(mesh), animations: [] };
  }

  if (ext === 'fbx') {
    const fbx = new FBXLoader().parse(buffer, '');
    return {
      root: normalizeImportedModel(fbx),
      animations: (fbx as THREE.Group & { animations?: THREE.AnimationClip[] }).animations || [],
    };
  }

  if (ext === 'dae') {
    const text = new TextDecoder().decode(buffer);
    const collada = new ColladaLoader().parse(text, '');
    if (!collada?.scene) {
      throw new Error('Failed to parse Collada (.dae) model.');
    }
    return {
      root: normalizeImportedModel(collada.scene),
      animations: [],
    };
  }

  throw new Error(`Unsupported 3D model format: .${ext}`);
}

/**
 * Samples evenly spaced keyframes from a video URL using an offscreen HTML5 <video> and <canvas>,
 * returning compact JPEG data URLs, timestamps, and dominant hex color swatches for Gemini keyframe analysis.
 */
export async function extractVideoKeyframes(
  videoUrl: string,
  frameCount = 5
): Promise<{
  width: number;
  height: number;
  durationSec: number;
  keyframes: ExtractedVideoKeyframe[];
}> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    let settled = false;
    const finish = (result: {
      width: number;
      height: number;
      durationSec: number;
      keyframes: ExtractedVideoKeyframe[];
    }) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeAttribute('src');
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => {
      finish({ width: 1280, height: 720, durationSec: 0, keyframes: [] });
    }, 8500);

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      finish({ width: 1280, height: 720, durationSec: 0, keyframes: [] });
    };

    video.onloadedmetadata = async () => {
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const durationSec =
        Number.isFinite(video.duration) && video.duration > 0
          ? Number(video.duration.toFixed(2))
          : 4;

      const maxSide = 512;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const targetW = Math.max(160, Math.round(width * scale));
      const targetH = Math.max(90, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        window.clearTimeout(timeoutId);
        finish({ width, height, durationSec, keyframes: [] });
        return;
      }

      const count = Math.max(2, Math.min(6, frameCount));
      const keyframes: ExtractedVideoKeyframe[] = [];

      const seekTo = (t: number) =>
        new Promise<void>((res) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            res();
          };
          video.addEventListener('seeked', onSeeked, { once: true });
          try {
            video.currentTime = Math.min(Math.max(0.05, t), Math.max(0.05, durationSec - 0.08));
          } catch {
            video.removeEventListener('seeked', onSeeked);
            res();
          }
        });

      for (let i = 0; i < count; i++) {
        const ratio = count === 1 ? 0.25 : i / (count - 1);
        const timestampSec = Number((0.08 + ratio * Math.max(0.2, durationSec - 0.16)).toFixed(2));
        await seekTo(timestampSec);

        try {
          ctx.drawImage(video, 0, 0, targetW, targetH);
          const sample = ctx.getImageData(0, 0, targetW, targetH).data;
          let rSum = 0;
          let gSum = 0;
          let bSum = 0;
          let samples = 0;
          const step = 16 * 4;
          for (let p = 0; p < sample.length; p += step) {
            rSum += sample[p];
            gSum += sample[p + 1];
            bSum += sample[p + 2];
            samples++;
          }
          const r = samples > 0 ? Math.round(rSum / samples) : 48;
          const g = samples > 0 ? Math.round(gSum / samples) : 96;
          const b = samples > 0 ? Math.round(bSum / samples) : 168;
          const dominantHex = `#${[r, g, b]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('')}`;

          const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
          keyframes.push({
            index: i,
            timestampSec,
            dataUrl,
            dominantHex,
          });
        } catch {
          // Ignore canvas taint if any
        }
      }

      window.clearTimeout(timeoutId);
      finish({ width, height, durationSec, keyframes });
    };
  });
}

export async function ingestStudioFile(
  file: File,
  audioEngine: AudioEngine,
  onStage?: (stage: string) => void
): Promise<StudioMediaAsset> {
  const ext = getFileExt(file.name);
  const mime = file.type || '';

  // 1. 3D Models (GLB / glTF + OBJ / STL / PLY / FBX / DAE)
  if (['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', 'dae'].includes(ext)) {
    onStage?.(
      ext === 'glb' || ext === 'gltf'
        ? `Parsing ${ext.toUpperCase()} scene & Draco geometry...`
        : `Parsing ${ext.toUpperCase()} 3D geometry...`
    );
    const { root, animations } = await parseThreeModelFile(file);
    onStage?.('Normalizing scale & studio materials...');
    const stats = collectModelStats(root, ext);
    return {
      id: uid('mdl'),
      category: 'model',
      name: file.name,
      mimeType: mime || `model/${ext}`,
      sizeBytes: file.size,
      createdAt: Date.now(),
      modelStats: stats,
      animationClipNames: animations.map((a, idx) => a.name || `Clip ${idx + 1}`),
      runtimeModelRoot: root,
      runtimeAnimations: animations,
    };
  }

  // 2. BIM Architectural IFC
  if (ext === 'ifc') {
    onStage?.('Reading IFC BIM schema & storeys...');
    const text = await file.text();
    onStage?.('Constructing 3D architectural BIM solids...');
    const { group, summary } = parseIfcBimFile(text, file.name);
    return {
      id: uid('bim'),
      category: 'bim',
      name: file.name,
      mimeType: 'application/x-step',
      sizeBytes: file.size,
      createdAt: Date.now(),
      bimSummary: summary,
      modelStats: collectModelStats(group, 'ifc'),
      runtimeModelRoot: group,
    };
  }

  // 3. Videos (with automatic keyframe extraction for Gemini scene pack synthesis)
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) {
    const objectUrl = URL.createObjectURL(file);
    onStage?.('Sampling video keyframes & dominant color palette...');
    const extracted = await extractVideoKeyframes(objectUrl, 5);

    return {
      id: uid('vid'),
      category: 'video',
      name: file.name,
      mimeType: mime || `video/${ext}`,
      sizeBytes: file.size,
      createdAt: Date.now(),
      objectUrl,
      dataUrl: extracted.keyframes[0]?.dataUrl,
      width: extracted.width,
      height: extracted.height,
      durationSec: extracted.durationSec,
      extractedKeyframes: extracted.keyframes,
    };
  }

  // 4. Audio files
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'opus', 'aac'].includes(ext)) {
    const buffer = await file.arrayBuffer();
    const objectUrl = URL.createObjectURL(file);
    let durationSec = 0;
    let peaks: number[] = [];
    try {
      const analyzed = await audioEngine.analyzeAudioBuffer(buffer, 44);
      durationSec = analyzed.durationSec;
      peaks = analyzed.peaks;
    } catch {
      peaks = Array.from({ length: 32 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.7)));
    }
    return {
      id: uid('aud'),
      category: 'audio',
      name: file.name,
      mimeType: mime || `audio/${ext}`,
      sizeBytes: file.size,
      createdAt: Date.now(),
      objectUrl,
      durationSec,
      waveformPeaks: peaks,
      runtimeFileBuffer: buffer,
    };
  }

  // 5. Images
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    const imgAsset = await processImageFile(file);
    return {
      id: imgAsset.id,
      category: 'image',
      name: imgAsset.name,
      mimeType: imgAsset.mimeType,
      sizeBytes: file.size,
      createdAt: Date.now(),
      dataUrl: imgAsset.dataUrl,
      width: imgAsset.width,
      height: imgAsset.height,
    };
  }

  // 6. Transcripts
  if (['srt', 'vtt', 'txt', 'md', 'json'].includes(ext) || mime.startsWith('text/')) {
    const raw = await file.text();
    const { cues, fullScript } = parseTranscriptContent(raw, file.name);
    return {
      id: uid('tr'),
      category: 'transcript',
      name: file.name,
      mimeType: mime || 'text/plain',
      sizeBytes: file.size,
      createdAt: Date.now(),
      transcriptText: fullScript || raw.trim(),
      transcriptCues: cues,
    };
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
