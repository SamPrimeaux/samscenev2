import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

interface GlbMaterialSpec {
  name: string;
  baseColorFactor: [number, number, number, number];
  metallicFactor: number;
  roughnessFactor: number;
  emissiveFactor?: [number, number, number];
}

interface GlbMeshPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: GlbMaterialSpec;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Pure Node glTF 2.0 binary (.glb) serializer for Three.js BufferGeometries + PBR materials.
 */
function buildGlbBinary(sceneName: string, parts: GlbMeshPart[]): Buffer {
  const materials: GlbMaterialSpec[] = [];
  const materialIndexMap = new Map<string, number>();

  const bufferChunks: Buffer[] = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];

  let byteOffset = 0;

  const appendAlignedBuffer = (data: Uint8Array): { offset: number; length: number } => {
    const pad = (4 - (data.byteLength % 4)) % 4;
    const aligned = Buffer.alloc(data.byteLength + pad);
    aligned.set(data, 0);
    const offset = byteOffset;
    bufferChunks.push(aligned);
    byteOffset += aligned.byteLength;
    return { offset, length: data.byteLength };
  };

  for (const part of parts) {
    let matIdx = materialIndexMap.get(part.material.name);
    if (matIdx === undefined) {
      matIdx = materials.length;
      materialIndexMap.set(part.material.name, matIdx);
      materials.push(part.material);
    }

    const geo = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    if (!geo.attributes.normal) {
      geo.computeVertexNormals();
    }

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const normAttr = geo.attributes.normal as THREE.BufferAttribute;
    const count = posAttr.count;

    const posArray = new Float32Array(count * 3);
    const normArray = new Float32Array(count * 3);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      posArray[i * 3] = x;
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = z;
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;

      normArray[i * 3] = normAttr.getX(i);
      normArray[i * 3 + 1] = normAttr.getY(i);
      normArray[i * 3 + 2] = normAttr.getZ(i);
    }

    const posBytes = new Uint8Array(posArray.buffer, posArray.byteOffset, posArray.byteLength);
    const normBytes = new Uint8Array(normArray.buffer, normArray.byteOffset, normArray.byteLength);

    const posSlice = appendAlignedBuffer(posBytes);
    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: posSlice.offset,
      byteLength: posSlice.length,
      target: 34962,
    });
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      componentType: 5126,
      count,
      type: 'VEC3',
      min,
      max,
    });

    const normSlice = appendAlignedBuffer(normBytes);
    const normViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normSlice.offset,
      byteLength: normSlice.length,
      target: 34962,
    });
    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      componentType: 5126,
      count,
      type: 'VEC3',
    });

    const meshIdx = meshes.length;
    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: {
            POSITION: posAccIdx,
            NORMAL: normAccIdx,
          },
          material: matIdx,
          mode: 4,
        },
      ],
    });

    const node: Record<string, unknown> = {
      name: part.name,
      mesh: meshIdx,
    };
    if (part.position) node.translation = part.position;
    if (part.rotation) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2])
      );
      node.rotation = [q.x, q.y, q.z, q.w];
    }
    if (part.scale) node.scale = part.scale;
    nodes.push(node);
    geo.dispose();
  }

  const rootNodeIdx = nodes.length;
  nodes.push({
    name: sceneName,
    children: parts.map((_, i) => i),
  });

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'PrimeTech-SamScene-GLB-Builder/2.0',
    },
    scene: 0,
    scenes: [{ name: sceneName, nodes: [rootNodeIdx] }],
    nodes,
    meshes,
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor,
        roughnessFactor: m.roughnessFactor,
      },
      ...(m.emissiveFactor ? { emissiveFactor: m.emissiveFactor } : {}),
      doubleSided: false,
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonRaw = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonChunk = Buffer.alloc(jsonRaw.byteLength + jsonPad, 0x20);
  jsonRaw.copy(jsonChunk, 0);

  const binChunk = Buffer.concat(bufferChunks);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const out = Buffer.alloc(totalLength);

  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);

  out.writeUInt32LE(jsonChunk.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);

  const binHeaderOffset = 20 + jsonChunk.byteLength;
  out.writeUInt32LE(binChunk.byteLength, binHeaderOffset);
  out.writeUInt32LE(0x004e4942, binHeaderOffset + 4);
  binChunk.copy(out, binHeaderOffset + 8);

  return out;
}

function polyShape(pts: Array<[number, number]>, scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
  for (let i = 1; i < pts.length; i++) {
    s.lineTo(pts[i][0] * scale, pts[i][1] * scale);
  }
  s.closePath();
  return s;
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w * 0.5;
  const hh = h * 0.5;
  const rad = Math.min(r, hw * 0.95, hh * 0.95);
  s.moveTo(-hw + rad, -hh);
  s.lineTo(hw - rad, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + rad);
  s.lineTo(hw, hh - rad);
  s.quadraticCurveTo(hw, hh, hw - rad, hh);
  s.lineTo(-hw + rad, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - rad);
  s.lineTo(-hw, -hh + rad);
  s.quadraticCurveTo(-hw, -hh, -hw + rad, -hh);
  return s;
}

function roundedCornerPoly(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): THREE.Shape {
  const s = new THREE.Shape();
  const rad = Math.min(r, w * 0.48, h * 0.48);
  s.moveTo(x + rad, y);
  s.lineTo(x + w - rad, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rad);
  s.lineTo(x + w, y + h - rad);
  s.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  s.lineTo(x + rad, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rad);
  s.lineTo(x, y + rad);
  s.quadraticCurveTo(x, y, x + rad, y);
  return s;
}

/**
 * Pixel-exact 5-facet PrimeTech geometric P monogram extracted from image_bcd90a2d.png (520x612).
 * Total normalized height = 1.0 (-0.498 to +0.497), width = 0.848 (-0.425 to +0.423).
 */
export function createExactPrimeTech5Facets(scale = 1): THREE.Shape[] {
  return [
    // 1. Top Crown Trapezoid
    polyShape(
      [
        [-0.1961, 0.2729],
        [0.1879, 0.2729],
        [0.1324, 0.4967],
        [-0.0327, 0.4967],
      ],
      scale
    ),
    // 2. Upper-Right Faceted Wing
    polyShape(
      [
        [0.1797, 0.4951],
        [0.2941, 0.1373],
        [0.2647, 0.0605],
        [0.4232, 0.0605],
        [0.4232, 0.2696],
      ],
      scale
    ),
    // 3. Lower Counter Rhomboid Bar
    polyShape(
      [
        [-0.134, -0.2173],
        [0.0882, -0.2173],
        [0.3922, 0.0065],
        [0.0163, 0.0065],
      ],
      scale
    ),
    // 4. Upper-Left Angled Vertical Slab
    polyShape(
      [
        [-0.4248, -0.232],
        [-0.1977, 0.1373],
        [-0.1977, 0.1993],
        [-0.4248, 0.268],
      ],
      scale
    ),
    // 5. Lower-Left Tapered Heel Triangle
    polyShape(
      [
        [-0.1879, 0.0376],
        [-0.4134, -0.3203],
        [-0.1879, -0.4984],
      ],
      scale
    ),
  ];
}

/**
 * Wide-stance architectural geometric sans glyph shapes matching Reference 1 & 2 PRIMETECH wordmark.
 */
function createPrimeTechWordmarkGlyphShapes(letterHeight: number): Array<{
  char: string;
  shapes: THREE.Shape[];
  advance: number;
}> {
  const h = letterHeight;
  const w = h * 1.24; // wide extended stance
  const st = h * 0.19; // refined crisp stroke
  const gap = h * 0.26;
  const rOut = h * 0.22;
  const rIn = h * 0.08;

  const makeRectPath = (x: number, y: number, rw: number, rh: number): THREE.Path => {
    const p = new THREE.Path();
    p.moveTo(x, y);
    p.lineTo(x + rw, y);
    p.lineTo(x + rw, y + rh);
    p.lineTo(x, y + rh);
    p.closePath();
    return p;
  };

  const makePShape = (): THREE.Shape => {
    const s = new THREE.Shape();
    const bowlBottom = h * 0.4;
    s.moveTo(0, 0);
    s.lineTo(st, 0);
    s.lineTo(st, bowlBottom);
    s.lineTo(w - rOut, bowlBottom);
    s.quadraticCurveTo(w, bowlBottom, w, bowlBottom + rOut);
    s.lineTo(w, h - rOut);
    s.quadraticCurveTo(w, h, w - rOut, h);
    s.lineTo(0, h);
    s.closePath();

    // Inner counter hole (clockwise winding)
    const hole = new THREE.Path();
    const hx0 = st;
    const hx1 = w - st;
    const hy0 = bowlBottom + st;
    const hy1 = h - st;
    hole.moveTo(hx0, hy0);
    hole.lineTo(hx0, hy1);
    hole.lineTo(hx1 - rIn, hy1);
    hole.quadraticCurveTo(hx1, hy1, hx1, hy1 - rIn);
    hole.lineTo(hx1, hy0 + rIn);
    hole.quadraticCurveTo(hx1, hy0, hx1 - rIn, hy0);
    hole.closePath();
    s.holes.push(hole);
    return s;
  };

  const makeRShape = (): THREE.Shape => {
    const s = new THREE.Shape();
    const bowlBottom = h * 0.41;
    s.moveTo(0, 0);
    s.lineTo(st, 0);
    s.lineTo(st, bowlBottom);
    s.lineTo(w * 0.56, bowlBottom);
    s.lineTo(w - st * 1.15, 0);
    s.lineTo(w, 0);
    s.lineTo(w * 0.75, bowlBottom + st * 0.18);
    s.lineTo(w - rOut * 0.7, bowlBottom + st * 0.25);
    s.quadraticCurveTo(w, bowlBottom + st * 0.35, w, bowlBottom + rOut);
    s.lineTo(w, h - rOut);
    s.quadraticCurveTo(w, h, w - rOut, h);
    s.lineTo(0, h);
    s.closePath();

    const hole = new THREE.Path();
    const hx0 = st;
    const hx1 = w - st;
    const hy0 = bowlBottom + st;
    const hy1 = h - st;
    hole.moveTo(hx0, hy0);
    hole.lineTo(hx0, hy1);
    hole.lineTo(hx1 - rIn, hy1);
    hole.quadraticCurveTo(hx1, hy1, hx1, hy1 - rIn);
    hole.lineTo(hx1, hy0 + rIn);
    hole.quadraticCurveTo(hx1, hy0, hx1 - rIn, hy0);
    hole.closePath();
    s.holes.push(hole);
    return s;
  };

  const makeIShape = (): THREE.Shape => roundedCornerPoly(0, 0, st, h, st * 0.08);

  const makeMShape = (): THREE.Shape => {
    const mw = h * 1.38;
    const midX = mw * 0.5;
    const valleyY = h * 0.24;
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(st, 0);
    s.lineTo(st, h - st * 0.92);
    s.lineTo(midX - st * 0.38, valleyY);
    s.lineTo(midX + st * 0.38, valleyY);
    s.lineTo(mw - st, h - st * 0.92);
    s.lineTo(mw - st, 0);
    s.lineTo(mw, 0);
    s.lineTo(mw, h);
    s.lineTo(mw - st * 1.28, h);
    s.lineTo(midX, valleyY + st * 1.15);
    s.lineTo(st * 1.28, h);
    s.lineTo(0, h);
    s.closePath();
    return s;
  };

  const makeEShape = (): THREE.Shape => {
    const s = new THREE.Shape();
    const midY0 = h * 0.5 - st * 0.5;
    const midY1 = h * 0.5 + st * 0.5;
    s.moveTo(rIn, 0);
    s.lineTo(w, 0);
    s.lineTo(w, st);
    s.lineTo(st, st);
    s.lineTo(st, midY0);
    s.lineTo(w * 0.86, midY0);
    s.lineTo(w * 0.86, midY1);
    s.lineTo(st, midY1);
    s.lineTo(st, h - st);
    s.lineTo(w, h - st);
    s.lineTo(w, h);
    s.lineTo(rIn, h);
    s.quadraticCurveTo(0, h, 0, h - rIn);
    s.lineTo(0, rIn);
    s.quadraticCurveTo(0, 0, rIn, 0);
    s.closePath();
    return s;
  };

  const makeTShape = (): THREE.Shape => {
    const tw = w * 1.04;
    const mid = tw * 0.5;
    const s = new THREE.Shape();
    s.moveTo(mid - st * 0.5, 0);
    s.lineTo(mid + st * 0.5, 0);
    s.lineTo(mid + st * 0.5, h - st);
    s.lineTo(tw, h - st);
    s.lineTo(tw, h);
    s.lineTo(0, h);
    s.lineTo(0, h - st);
    s.lineTo(mid - st * 0.5, h - st);
    s.closePath();
    return s;
  };

  const makeCShape = (): THREE.Shape => {
    const s = new THREE.Shape();
    const rOuter = h * 0.34;
    const rInner = Math.max(0.001, rOuter - st);
    const gapY0 = h * 0.26;
    const gapY1 = h - gapY0;
    s.moveTo(rOuter, 0);
    s.lineTo(w - rOuter * 0.45, 0);
    s.quadraticCurveTo(w, 0, w, gapY0 * 0.65);
    s.lineTo(w, gapY0);
    s.lineTo(w - st, gapY0);
    s.lineTo(w - st, st + rInner * 0.25);
    s.quadraticCurveTo(w - st, st, w - st - rInner * 0.4, st);
    s.lineTo(st + rInner, st);
    s.quadraticCurveTo(st, st, st, st + rInner);
    s.lineTo(st, h - st - rInner);
    s.quadraticCurveTo(st, h - st, st + rInner, h - st);
    s.lineTo(w - st - rInner * 0.4, h - st);
    s.quadraticCurveTo(w - st, h - st, w - st, h - st - rInner * 0.25);
    s.lineTo(w - st, gapY1);
    s.lineTo(w, gapY1);
    s.lineTo(w, h - gapY0 * 0.65);
    s.quadraticCurveTo(w, h, w - rOuter * 0.45, h);
    s.lineTo(rOuter, h);
    s.quadraticCurveTo(0, h, 0, h - rOuter);
    s.lineTo(0, rOuter);
    s.quadraticCurveTo(0, 0, rOuter, 0);
    s.closePath();
    return s;
  };

  const makeHShape = (): THREE.Shape => {
    const hw = w;
    const s = new THREE.Shape();
    const barY0 = h * 0.5 - st * 0.5;
    const barY1 = h * 0.5 + st * 0.5;
    s.moveTo(0, 0);
    s.lineTo(st, 0);
    s.lineTo(st, barY0);
    s.lineTo(hw - st, barY0);
    s.lineTo(hw - st, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, h);
    s.lineTo(hw - st, h);
    s.lineTo(hw - st, barY1);
    s.lineTo(st, barY1);
    s.lineTo(st, h);
    s.lineTo(0, h);
    s.closePath();
    return s;
  };

  void makeRectPath;

  return [
    { char: 'P', shapes: [makePShape()], advance: w + gap },
    { char: 'R', shapes: [makeRShape()], advance: w + gap },
    { char: 'I', shapes: [makeIShape()], advance: st + gap },
    { char: 'M', shapes: [makeMShape()], advance: h * 1.38 + gap },
    { char: 'E', shapes: [makeEShape()], advance: w + gap },
    { char: 'T', shapes: [makeTShape()], advance: w * 1.04 + gap * 0.85 },
    { char: 'E2', shapes: [makeEShape()], advance: w + gap },
    { char: 'C', shapes: [makeCShape()], advance: w + gap },
    { char: 'H', shapes: [makeHShape()], advance: w },
  ];
}

// --- Calibrated Neutral Monochrome & Obsidian Architectural Materials (Zero Purple Wash) ---
const MAT_BRUSHED_SILVER: GlbMaterialSpec = {
  name: 'PrimeTech_BrushedAluminum',
  baseColorFactor: [0.92, 0.94, 0.97, 1.0],
  metallicFactor: 0.92,
  roughnessFactor: 0.21,
};

const MAT_SATIN_SILVER: GlbMaterialSpec = {
  name: 'PrimeTech_SatinSilver',
  baseColorFactor: [0.85, 0.88, 0.92, 1.0],
  metallicFactor: 0.9,
  roughnessFactor: 0.25,
};

const MAT_CHROME_BEVEL: GlbMaterialSpec = {
  name: 'PrimeTech_ChromeBevel',
  baseColorFactor: [0.95, 0.97, 0.99, 1.0],
  metallicFactor: 0.95,
  roughnessFactor: 0.16,
};

const MAT_SEAM_WHITE: GlbMaterialSpec = {
  name: 'PrimeTech_WhiteSeam',
  baseColorFactor: [0.98, 0.99, 1.0, 1.0],
  metallicFactor: 0.1,
  roughnessFactor: 0.12,
  emissiveFactor: [0.92, 0.96, 1.0],
};

const MAT_DIVIDER_METALLIC: GlbMaterialSpec = {
  name: 'PrimeTech_DividerHairline',
  baseColorFactor: [0.82, 0.85, 0.9, 1.0],
  metallicFactor: 0.88,
  roughnessFactor: 0.2,
};

const MAT_OBSIDIAN_PLATE: GlbMaterialSpec = {
  name: 'PrimeTech_ObsidianPlate',
  baseColorFactor: [0.032, 0.038, 0.048, 1.0],
  metallicFactor: 0.74,
  roughnessFactor: 0.34,
};

const MAT_OBSIDIAN_WALL: GlbMaterialSpec = {
  name: 'PrimeTech_ObsidianMatteWall',
  baseColorFactor: [0.022, 0.026, 0.034, 1.0],
  metallicFactor: 0.36,
  roughnessFactor: 0.56,
};

const MAT_OBSIDIAN_DEEP: GlbMaterialSpec = {
  name: 'PrimeTech_ObsidianDeep',
  baseColorFactor: [0.014, 0.017, 0.024, 1.0],
  metallicFactor: 0.45,
  roughnessFactor: 0.36,
};

const MAT_CERAMIC_WHITE: GlbMaterialSpec = {
  name: 'PrimeTech_CeramicWhite',
  baseColorFactor: [0.94, 0.955, 0.975, 1.0],
  metallicFactor: 0.06,
  roughnessFactor: 0.24,
};

// --- 1. Build primetech-p-icon.glb (Exact 5-Facet Brushed Silver Emblem) ---
function createPIconGlb(): Buffer {
  const shapes = createExactPrimeTech5Facets(0.86);
  const facetNames = [
    'P_TopCrown',
    'P_UpperRightWing',
    'P_LowerCounterBar',
    'P_UpperLeftSlab',
    'P_LowerLeftHeel',
  ];
  const parts: GlbMeshPart[] = shapes.map((s, idx) => {
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.085,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.012,
      bevelThickness: 0.014,
    });
    geo.translate(0, 0, -0.0425);
    return {
      name: facetNames[idx],
      geometry: geo,
      material: idx % 2 === 0 ? MAT_BRUSHED_SILVER : MAT_SATIN_SILVER,
    };
  });
  return buildGlbBinary('PrimeTech_P_Emblem_5Facet', parts);
}

// --- 2. Build primetech-wordmark.glb ("| PRIMETECH" Sleek Wide-Stance Sans-Serif) ---
function createWordmarkGlb(): Buffer {
  const parts: GlbMeshPart[] = [];
  const letterHeight = 0.24;
  const glyphs = createPrimeTechWordmarkGlyphShapes(letterHeight);
  const totalWidth = glyphs.reduce((acc, g) => acc + g.advance, 0);

  // Subtle vertical metallic hairline divider bar cleanly proportioned to emblem + text
  parts.push({
    name: 'Wordmark_DividerBar',
    geometry: new THREE.BoxGeometry(0.012, 0.64, 0.022),
    material: MAT_DIVIDER_METALLIC,
    position: [-1.42, 0, 0],
  });

  let cursorX = -1.24;
  for (const glyph of glyphs) {
    glyph.shapes.forEach((s, idx) => {
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.042,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.005,
        bevelThickness: 0.005,
      });
      geo.translate(cursorX, -letterHeight * 0.5, -0.021);
      parts.push({
        name: `Wordmark_${glyph.char}_${idx}`,
        geometry: geo,
        material: MAT_BRUSHED_SILVER,
      });
    });
    cursorX += glyph.advance;
  }

  void totalWidth;
  return buildGlbBinary('PrimeTech_Wordmark_Lockup', parts);
}

// --- 3. Build primetech-plinth-tile.glb (Ceramic-White Rounded Monolith with Recessed 5-Facet P) ---
function createPlinthTileGlb(): Buffer {
  const parts: GlbMeshPart[] = [];
  const outerShape = roundedRectShape(1.0, 1.0, 0.22);
  const bezelGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.21,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.032,
    bevelThickness: 0.028,
  });
  bezelGeo.translate(0, 0, -0.105);
  parts.push({
    name: 'Monolith_StainlessBezel',
    geometry: bezelGeo,
    material: MAT_CHROME_BEVEL,
  });

  const faceShape = roundedRectShape(0.955, 0.955, 0.205);
  const holes = createExactPrimeTech5Facets(0.49);
  holes.forEach((h) => faceShape.holes.push(h));
  const faceGeo = new THREE.ExtrudeGeometry(faceShape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });
  const frontGeo = faceGeo.clone().translate(0, 0, 0.088);
  const backGeo = faceGeo.clone().translate(0, 0, -0.133);
  faceGeo.dispose();

  parts.push(
    { name: 'Monolith_FrontCeramic', geometry: frontGeo, material: MAT_CERAMIC_WHITE },
    { name: 'Monolith_RearCeramic', geometry: backGeo, material: MAT_CERAMIC_WHITE }
  );

  // Recessed interior obsidian cavity backing
  const innerCoreShape = roundedRectShape(0.82, 0.82, 0.16);
  const innerCoreGeo = new THREE.ExtrudeGeometry(innerCoreShape, {
    depth: 0.16,
    bevelEnabled: false,
  });
  innerCoreGeo.translate(0, 0, -0.08);
  parts.push({
    name: 'Monolith_RecessedCavityCore',
    geometry: innerCoreGeo,
    material: MAT_OBSIDIAN_DEEP,
  });

  return buildGlbBinary('PrimeTech_Sculptural_Monolith', parts);
}

// --- 4. Build primetech-arch-chamber.glb (Scene One Architectural Chamber matching Reference 1) ---
function createArchChamberGlb(): Buffer {
  const parts: GlbMeshPart[] = [];

  // Deep obsidian matte rear backdrop wall
  parts.push({
    name: 'Arch_BackMonolithWall',
    geometry: new THREE.BoxGeometry(18, 10, 0.3),
    material: MAT_OBSIDIAN_WALL,
    position: [0, 1.6, -3.15],
  });

  // Left outer diagonal stepped bulkhead plate (Reference 1 upper/mid left)
  const leftOuter = polyShape([
    [-9.2, -3.4],
    [-4.35, -3.4],
    [-2.55, 1.1],
    [-3.75, 2.15],
    [-1.75, 2.15],
    [-0.25, 4.4],
    [-9.2, 4.4],
  ]);
  const leftOuterGeo = new THREE.ExtrudeGeometry(leftOuter, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  leftOuterGeo.translate(0, 0.65, -2.18);
  parts.push({
    name: 'Arch_LeftSteppedBulkheadOuter',
    geometry: leftOuterGeo,
    material: MAT_OBSIDIAN_PLATE,
  });

  // Left inner overlapping architectural plate for double-stepped chamfer depth
  const leftInner = polyShape([
    [-9.2, 1.15],
    [-3.85, 1.15],
    [-2.15, 2.65],
    [-1.1, 2.65],
    [0.25, 4.5],
    [-9.2, 4.5],
  ]);
  const leftInnerGeo = new THREE.ExtrudeGeometry(leftInner, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  leftInnerGeo.translate(0, 0.72, -2.55);
  parts.push({
    name: 'Arch_LeftSteppedBulkheadInner',
    geometry: leftInnerGeo,
    material: MAT_OBSIDIAN_PLATE,
  });

  // Upper-right cantilevered obsidian wing with sharp horizontal knee edge (Reference 1 top-right)
  const rightWing = polyShape([
    [1.0, 4.5],
    [9.2, 4.5],
    [9.2, -0.35],
    [6.1, 1.85],
    [2.65, 1.85],
    [1.6, 2.95],
  ]);
  const rightWingGeo = new THREE.ExtrudeGeometry(rightWing, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  rightWingGeo.translate(0, 0.85, -2.18);
  parts.push({
    name: 'Arch_RightOverhangWing',
    geometry: rightWingGeo,
    material: MAT_OBSIDIAN_PLATE,
  });

  // Lower-left chamfered foreground sill shelf (Reference 1 lower-left bevel)
  const lowerSill = polyShape([
    [-9.2, -3.5],
    [0.45, -3.5],
    [-1.15, -0.82],
    [-9.2, -0.82],
  ]);
  const lowerSillGeo = new THREE.ExtrudeGeometry(lowerSill, {
    depth: 0.48,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.022,
    bevelThickness: 0.022,
  });
  lowerSillGeo.translate(0, 1.25, -1.78);
  parts.push({
    name: 'Arch_LowerLeftSill',
    geometry: lowerSillGeo,
    material: MAT_OBSIDIAN_PLATE,
  });

  // Razor-sharp cool-white chamfer edge highlights positioned along visible creases
  parts.push(
    {
      name: 'Seam_UpperRightKneeHorizontal',
      geometry: new THREE.BoxGeometry(1.75, 0.015, 0.024),
      material: MAT_SEAM_WHITE,
      position: [3.48, 2.7, -1.73],
    },
    {
      name: 'Seam_UpperRightDiagonal',
      geometry: new THREE.BoxGeometry(2.15, 0.014, 0.022),
      material: MAT_SEAM_WHITE,
      position: [1.92, 3.42, -1.73],
      rotation: [0, 0, -0.82],
    },
    {
      name: 'Seam_LeftDiagonalBevel',
      geometry: new THREE.BoxGeometry(3.2, 0.014, 0.022),
      material: MAT_SEAM_WHITE,
      position: [-3.2, 1.85, -1.74],
      rotation: [0, 0, 0.82],
    },
    {
      name: 'Seam_LowerSillTopEdge',
      geometry: new THREE.BoxGeometry(4.5, 0.014, 0.024),
      material: MAT_SEAM_WHITE,
      position: [-3.4, 0.43, -1.27],
    }
  );

  return buildGlbBinary('PrimeTech_Arch_Chamber', parts);
}

// --- 5. Build primetech-sculptural-stage.glb (Scene Two Stage matching Reference 2) ---
function createSculpturalStageGlb(): Buffer {
  const parts: GlbMeshPart[] = [];

  // Dark matte gallery floor
  parts.push({
    name: 'Stage2_GalleryFloor',
    geometry: new THREE.BoxGeometry(16, 0.1, 14),
    material: MAT_OBSIDIAN_DEEP,
    position: [0, -0.05, -2.5],
  });

  // Left-rear anodized dark studio backdrop wall
  parts.push({
    name: 'Stage2_LeftGalleryWall',
    geometry: new THREE.BoxGeometry(11, 7.5, 0.32),
    material: MAT_OBSIDIAN_WALL,
    position: [-1.4, 2.75, -3.55],
    rotation: [0, 0.14, 0],
  });

  // Sweeping diagonal-curved dark metallic canopy fin overlapping the back wall (top-left to right)
  const canopyShape = polyShape([
    [-7.5, 0.25],
    [-2.1, 0.88],
    [0.2, 2.25],
    [1.75, 4.25],
    [-7.5, 4.25],
  ]);
  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
    depth: 0.28,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  });
  canopyGeo.translate(0, 1.3, -3.05);
  parts.push({
    name: 'Stage2_CurvedCanopyWing',
    geometry: canopyGeo,
    material: MAT_OBSIDIAN_PLATE,
    rotation: [0, 0.12, 0],
  });

  // Glowing cool-white diagonal rim seam along canopy lower bend (matching Reference 2)
  const seamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-4.2, 1.72, -2.65),
    new THREE.Vector3(-1.35, 2.15, -2.75),
    new THREE.Vector3(0.45, 2.9, -2.85),
    new THREE.Vector3(1.85, 4.85, -2.9),
  ]);
  parts.push({
    name: 'Stage2_CanopyGlowSeam',
    geometry: new THREE.TubeGeometry(seamCurve, 44, 0.011, 8, false),
    material: MAT_SEAM_WHITE,
  });

  // Sweeping right curved studio cyclorama fin behind monolith
  const rightArcCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.25, 0.1, -3.35),
    new THREE.Vector3(1.65, 1.85, -3.15),
    new THREE.Vector3(3.4, 3.15, -2.35),
    new THREE.Vector3(5.2, 3.65, -1.05),
  ]);
  parts.push({
    name: 'Stage2_RightSweptArcSeam',
    geometry: new THREE.TubeGeometry(rightArcCurve, 36, 0.009, 8, false),
    material: MAT_SEAM_WHITE,
  });

  const rightBackCyl = new THREE.CylinderGeometry(3.8, 3.8, 6.4, 48, 1, true, Math.PI * 0.9, Math.PI * 0.65);
  parts.push({
    name: 'Stage2_RightCurvedWall',
    geometry: rightArcCurve ? rightBackCyl : rightBackCyl,
    material: MAT_OBSIDIAN_PLATE,
    position: [2.4, 2.6, -1.6],
  });

  // Left Wall Signature Lockup: [5-facet P] | PRIMETECH™
  const wallFacets = createExactPrimeTech5Facets(0.42);
  wallFacets.forEach((s, idx) => {
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.032,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.005,
      bevelThickness: 0.005,
    });
    parts.push({
      name: `Stage2_WallP_${idx}`,
      geometry: geo,
      material: MAT_BRUSHED_SILVER,
      position: [-1.78, 1.48, -3.14],
      rotation: [0, 0.14, 0],
    });
  });

  parts.push({
    name: 'Stage2_WallDivider',
    geometry: new THREE.BoxGeometry(0.008, 0.36, 0.014),
    material: MAT_DIVIDER_METALLIC,
    position: [-1.52, 1.48, -3.18],
    rotation: [0, 0.14, 0],
  });

  const wallGlyphs = createPrimeTechWordmarkGlyphShapes(0.115);
  let wx = -1.43;
  for (const glyph of wallGlyphs) {
    glyph.shapes.forEach((s, idx) => {
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.022,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.0025,
        bevelThickness: 0.0025,
      });
      geo.translate(0, -0.0575, 0);
      parts.push({
        name: `Stage2_WallWord_${glyph.char}_${idx}`,
        geometry: geo,
        material: MAT_BRUSHED_SILVER,
        position: [wx * Math.cos(0.14), 1.48, -3.19 - wx * Math.sin(0.14)],
        rotation: [0, 0.14, 0],
      });
    });
    wx += glyph.advance;
  }

  // Tiny "TM" bars next to H on wall lockup
  const tmX = wx + 0.018;
  const tmWorldX = tmX * Math.cos(0.14);
  const tmWorldZ = -3.19 - tmX * Math.sin(0.14);
  parts.push(
    {
      name: 'Stage2_WallTM_T_Top',
      geometry: new THREE.BoxGeometry(0.024, 0.005, 0.012),
      material: MAT_BRUSHED_SILVER,
      position: [tmWorldX, 1.545, tmWorldZ],
      rotation: [0, 0.14, 0],
    },
    {
      name: 'Stage2_WallTM_T_Stem',
      geometry: new THREE.BoxGeometry(0.005, 0.024, 0.012),
      material: MAT_BRUSHED_SILVER,
      position: [tmWorldX, 1.535, tmWorldZ],
      rotation: [0, 0.14, 0],
    },
    {
      name: 'Stage2_WallTM_M',
      geometry: new THREE.BoxGeometry(0.028, 0.024, 0.012),
      material: MAT_BRUSHED_SILVER,
      position: [tmWorldX + 0.032, 1.535, tmWorldZ - 0.004],
      rotation: [0, 0.14, 0],
    }
  );

  // Lower-left rounded dark foreground platform (Reference 2 bottom-left)
  const foreShape = roundedRectShape(2.4, 1.65, 0.24);
  const foreGeo = new THREE.ExtrudeGeometry(foreShape, {
    depth: 0.42,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  foreGeo.rotateX(-Math.PI / 2);
  foreGeo.translate(0, 0.035, 0);
  parts.push({
    name: 'Stage2_LowerLeftDeck',
    geometry: foreGeo,
    material: MAT_OBSIDIAN_PLATE,
    position: [-1.18, 0.0, -0.55],
    rotation: [0, 0.22, 0],
  });

  // Glowing rim along upper perimeter of lower-left foreground deck
  const foreRimPts = foreShape.getPoints(36).map((p) => new THREE.Vector3(p.x, 0.455, -p.y));
  foreRimPts.push(foreRimPts[0].clone());
  const foreRimCurve = new THREE.CatmullRomCurve3(foreRimPts, true);
  parts.push({
    name: 'Stage2_LowerLeftDeckRim',
    geometry: new THREE.TubeGeometry(foreRimCurve, 64, 0.0075, 8, true),
    material: MAT_SEAM_WHITE,
    position: [-1.18, 0.0, -0.55],
    rotation: [0, 0.22, 0],
  });

  // Right-foreground Rounded Obsidian Pedestal supporting the Hero Ceramic Monolith FLUSH
  // Pedestal top surface is at y = 0.72
  const pedW = 1.66;
  const pedD = 1.48;
  const pedShape = roundedRectShape(pedW, pedD, 0.18);
  const pedGeo = new THREE.ExtrudeGeometry(pedShape, {
    depth: 0.66,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  pedGeo.rotateX(-Math.PI / 2);
  pedGeo.translate(0, 0.03, 0); // bottom at y = 0, top at y = 0.72
  parts.push({
    name: 'Stage2_HeroPedestal',
    geometry: pedGeo,
    material: MAT_OBSIDIAN_PLATE,
    position: [0.68, 0.0, -1.42],
    rotation: [0, -0.24, 0],
  });

  const pedRimPts = pedShape.getPoints(36).map((p) => new THREE.Vector3(p.x, 0.715, -p.y));
  pedRimPts.push(pedRimPts[0].clone());
  const pedRimCurve = new THREE.CatmullRomCurve3(pedRimPts, true);
  parts.push({
    name: 'Stage2_HeroPedestalRimSeam',
    geometry: new THREE.TubeGeometry(pedRimCurve, 64, 0.008, 8, true),
    material: MAT_SEAM_WHITE,
    position: [0.68, 0.0, -1.42],
    rotation: [0, -0.24, 0],
  });

  return buildGlbBinary('PrimeTech_Sculptural_Stage', parts);
}

const outDir = path.resolve(process.cwd(), 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });

const files: Array<{ filename: string; data: Buffer }> = [
  { filename: 'primetech-p-icon.glb', data: createPIconGlb() },
  { filename: 'primetech-wordmark.glb', data: createWordmarkGlb() },
  { filename: 'primetech-plinth-tile.glb', data: createPlinthTileGlb() },
  { filename: 'primetech-hero-chamber.glb', data: createArchChamberGlb() },
  { filename: 'primetech-sculptural-stage.glb', data: createSculpturalStageGlb() },
];

for (const f of files) {
  const dest = path.join(outDir, f.filename);
  fs.writeFileSync(dest, f.data);
  console.log(`Generated ${dest} (${(f.data.byteLength / 1024).toFixed(1)} KB)`);
}
