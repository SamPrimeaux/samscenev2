import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export interface SceneExportResult {
  filename: string;
  byteLength: number;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Captures the current frame of any VideoTexture as an offscreen canvas ImageData-backed CanvasTexture
 * so GLTFExporter can serialize scenes containing dropped 3D videos cleanly.
 */
function snapshotVideoTexture(tex: THREE.VideoTexture): THREE.CanvasTexture | null {
  const video = tex.image as HTMLVideoElement | undefined;
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1024, video.videoWidth);
  canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const out = new THREE.CanvasTexture(canvas);
  out.colorSpace = tex.colorSpace;
  return out;
}

/**
 * Exports one or more Three.js Object3D roots as a binary GLB (with GLTF JSON fallback),
 * safely filtering transient VideoTextures for serialization.
 */
export async function exportSceneAsGlb(
  objects: THREE.Object3D | THREE.Object3D[],
  filenameBase: string
): Promise<SceneExportResult> {
  const exporter = new GLTFExporter();
  const safeBase =
    filenameBase
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'samscene-export';

  const roots = Array.isArray(objects) ? objects : [objects];
  const swappedTextures: Array<{
    material: THREE.MeshStandardMaterial;
    originalMap: THREE.Texture | null;
    originalEmissiveMap: THREE.Texture | null;
    tempTex: THREE.CanvasTexture | null;
  }> = [];

  for (const root of roots) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial && m.map instanceof THREE.VideoTexture) {
          const tempTex = snapshotVideoTexture(m.map);
          swappedTextures.push({
            material: m,
            originalMap: m.map,
            originalEmissiveMap: m.emissiveMap,
            tempTex,
          });
          m.map = tempTex;
          if (m.emissiveMap instanceof THREE.VideoTexture) {
            m.emissiveMap = tempTex;
          }
          m.needsUpdate = true;
        }
      }
    });
  }

  try {
    const result = await exporter.parseAsync(objects, {
      binary: true,
      onlyVisible: true,
      embedImages: true,
    });

    if (result instanceof ArrayBuffer) {
      const filename = `${safeBase}.glb`;
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      triggerBlobDownload(blob, filename);
      return { filename, byteLength: result.byteLength };
    }

    const json = JSON.stringify(result, null, 2);
    const filename = `${safeBase}.gltf`;
    const blob = new Blob([json], { type: 'model/gltf+json' });
    triggerBlobDownload(blob, filename);
    return { filename, byteLength: blob.size };
  } finally {
    for (const swap of swappedTextures) {
      swap.material.map = swap.originalMap;
      swap.material.emissiveMap = swap.originalEmissiveMap;
      swap.material.needsUpdate = true;
      swap.tempTex?.dispose();
    }
  }
}
