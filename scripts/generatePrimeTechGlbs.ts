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
 * Guarantees valid GLB v2 headers, 4-byte chunk alignment, accessors with exact min/max,
 * and standard metallic-roughness PBR materials loadable directly by Three.js GLTFLoader.
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
      generator: 'PrimeTech-SamScene-GLB-Builder/1.0',
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

  // Header
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4); // version 2
  out.writeUInt32LE(totalLength, 8);

  // JSON chunk
  out.writeUInt32LE(jsonChunk.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonChunk.copy(out, 20);

  // BIN chunk
  const binHeaderOffset = 20 + jsonChunk.byteLength;
  out.writeUInt32LE(binChunk.byteLength, binHeaderOffset);
  out.writeUInt32LE(0x004e4942, binHeaderOffset + 4); // 'BIN\0'
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
  const rad = Math.min(r, hw, hh);
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

function createPrimeTechFacetShapes(scale: number): THREE.Shape[] {
  return [
    polyShape(
      [
        [-0.56, 0.44],
        [-0.24, 0.88],
        [0.24, 0.88],
        [0.06, 0.44],
      ],
      scale
    ),
    polyShape(
      [
        [0.32, 0.84],
        [0.68, 0.34],
        [0.44, -0.08],
        [0.14, 0.36],
      ],
      scale
    ),
    polyShape(
      [
        [-0.08, -0.02],
        [0.54, -0.02],
        [0.32, -0.34],
        [-0.24, -0.34],
      ],
      scale
    ),
    polyShape(
      [
        [-0.6, 0.36],
        [-0.26, 0.36],
        [-0.28, -0.84],
        [-0.6, -0.44],
      ],
      scale
    ),
  ];
}

const MAT_BRUSHED_SILVER: GlbMaterialSpec = {
  name: 'PrimeTech_BrushedAluminum',
  baseColorFactor: [0.91, 0.94, 0.98, 1.0],
  metallicFactor: 0.93,
  roughnessFactor: 0.19,
};

const MAT_CHROME_HIGHLIGHT: GlbMaterialSpec = {
  name: 'PrimeTech_ChromeHighlight',
  baseColorFactor: [0.97, 0.99, 1.0, 1.0],
  metallicFactor: 0.96,
  roughnessFactor: 0.14,
  emissiveFactor: [0.12, 0.16, 0.22],
};

const MAT_SEAM_EMISSIVE: GlbMaterialSpec = {
  name: 'PrimeTech_IceSeam',
  baseColorFactor: [0.94, 0.97, 1.0, 1.0],
  metallicFactor: 0.15,
  roughnessFactor: 0.15,
  emissiveFactor: [0.82, 0.92, 1.0],
};

const MAT_OBSIDIAN_ARMOR: GlbMaterialSpec = {
  name: 'PrimeTech_ObsidianArmor',
  baseColorFactor: [0.06, 0.075, 0.1, 1.0],
  metallicFactor: 0.82,
  roughnessFactor: 0.28,
};

const MAT_CERAMIC_WHITE: GlbMaterialSpec = {
  name: 'PrimeTech_CeramicWhite',
  baseColorFactor: [0.95, 0.965, 0.985, 1.0],
  metallicFactor: 0.08,
  roughnessFactor: 0.22,
};

// --- 1. Build primetech-p-icon.glb ---
function createPIconGlb(): Buffer {
  const shapes = createPrimeTechFacetShapes(0.5);
  const facetNames = ['P_TopWedge', 'P_ShoulderWing', 'P_CounterBar', 'P_LeftSpine'];
  const parts: GlbMeshPart[] = shapes.map((s, idx) => {
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.12,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.016,
      bevelThickness: 0.016,
    });
    geo.translate(0, 0, -0.06);
    return {
      name: facetNames[idx],
      geometry: geo,
      material: idx % 2 === 0 ? MAT_BRUSHED_SILVER : MAT_CHROME_HIGHLIGHT,
    };
  });
  return buildGlbBinary('PrimeTech_P_Emblem', parts);
}

// --- 2. Build primetech-wordmark.glb ("| PRIMETECH" wide-stance geometric CAD typography) ---
function createWordmarkGlb(): Buffer {
  const parts: GlbMeshPart[] = [];

  // Thin luminous vertical divider bar
  const divGeo = new THREE.BoxGeometry(0.018, 0.68, 0.036);
  parts.push({
    name: 'DividerBar',
    geometry: divGeo,
    material: MAT_SEAM_EMISSIVE,
    position: [-1.45, 0.0, 0.0],
  });

  // Wide geometric tech glyph helper
  const h = 0.34;
  const w = 0.29;
  const st = 0.062;
  const gap = 0.345;
  const rect = (x: number, y: number, rw: number, rh: number): THREE.Shape =>
    polyShape([
      [x, y],
      [x + rw, y],
      [x + rw, y + rh],
      [x, y + rh],
    ]);

  // Sculpted stylized futuristic wide-stance letters P R I M E T E C H
  const letters: Array<{ char: string; shapes: THREE.Shape[]; width?: number }> = [
    {
      char: 'P',
      shapes: [
        rect(0, 0, st, h),
        rect(0, h - st, w * 0.88, st),
        rect(0, h * 0.44, w * 0.88, st),
        rect(w * 0.88 - st, h * 0.44, st, h * 0.56),
      ],
    },
    {
      char: 'R',
      shapes: [
        rect(0, 0, st, h),
        rect(0, h - st, w * 0.88, st),
        rect(0, h * 0.44, w * 0.88, st),
        rect(w * 0.88 - st, h * 0.44, st, h * 0.56),
        polyShape([
          [w * 0.52, h * 0.46],
          [w * 0.52 + st, h * 0.46],
          [w * 0.92, 0],
          [w * 0.92 - st * 1.1, 0],
        ]),
      ],
    },
    {
      char: 'I',
      width: 0.14,
      shapes: [rect(0.03, 0, st, h)],
    },
    {
      char: 'M',
      width: 0.35,
      shapes: [
        rect(0, 0, st, h),
        rect(0.35 - st, 0, st, h),
        polyShape([
          [0, h],
          [st * 1.1, h],
          [0.175 + st * 0.45, h * 0.22],
          [0.175 - st * 0.45, h * 0.22],
        ]),
        polyShape([
          [0.35 - st * 1.1, h],
          [0.35, h],
          [0.175 + st * 0.45, h * 0.22],
          [0.175 - st * 0.45, h * 0.22],
        ]),
      ],
    },
    {
      char: 'E',
      shapes: [
        rect(0, 0, st, h),
        rect(0, h - st, w, st),
        rect(0, h * 0.45, w * 0.84, st),
        rect(0, 0, w, st),
      ],
    },
    {
      char: 'T',
      shapes: [rect(0, h - st, w, st), rect(w * 0.5 - st * 0.5, 0, st, h)],
    },
    {
      char: 'E2',
      shapes: [
        rect(0, 0, st, h),
        rect(0, h - st, w, st),
        rect(0, h * 0.45, w * 0.84, st),
        rect(0, 0, w, st),
      ],
    },
    {
      char: 'C',
      shapes: [
        rect(0, 0, st, h),
        rect(0, h - st, w, st),
        rect(0, 0, w, st),
      ],
    },
    {
      char: 'H',
      shapes: [
        rect(0, 0, st, h),
        rect(w - st, 0, st, h),
        rect(0, h * 0.45, w, st),
      ],
    },
  ];

  let cursorX = -1.24;
  for (const letter of letters) {
    letter.shapes.forEach((s, idx) => {
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.055,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.008,
        bevelThickness: 0.008,
      });
      geo.translate(cursorX, -h * 0.5, -0.0275);
      parts.push({
        name: `Letter_${letter.char}_${idx}`,
        geometry: geo,
        material: MAT_BRUSHED_SILVER,
      });
    });
    cursorX += letter.width ? letter.width + 0.075 : gap;
  }

  return buildGlbBinary('PrimeTech_Wordmark', parts);
}

// --- 3. Build primetech-plinth-tile.glb ---
function createPlinthTileGlb(): Buffer {
  const parts: GlbMeshPart[] = [];
  const outerShape = roundedRectShape(1.0, 1.0, 0.22);
  const bezelGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  bezelGeo.translate(0, 0, -0.12);
  parts.push({
    name: 'StainlessBezelShell',
    geometry: bezelGeo,
    material: MAT_BRUSHED_SILVER,
  });

  const faceShape = roundedRectShape(0.94, 0.94, 0.2);
  const holes = createPrimeTechFacetShapes(0.34);
  holes.forEach((h) => faceShape.holes.push(h));
  const faceGeo = new THREE.ExtrudeGeometry(faceShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });
  const frontGeo = faceGeo.clone().translate(0, 0, 0.095);
  const backGeo = faceGeo.clone().translate(0, 0, -0.155);
  faceGeo.dispose();

  parts.push(
    { name: 'FrontCeramicPlate', geometry: frontGeo, material: MAT_CERAMIC_WHITE },
    { name: 'RearCeramicPlate', geometry: backGeo, material: MAT_CERAMIC_WHITE }
  );

  holes.forEach((h, idx) => {
    const coreGeo = new THREE.ExtrudeGeometry(h, { depth: 0.22, bevelEnabled: false });
    coreGeo.translate(0, 0, -0.11);
    parts.push({
      name: `RecessedObsidianCore_${idx}`,
      geometry: coreGeo,
      material: MAT_OBSIDIAN_ARMOR,
    });
  });

  return buildGlbBinary('PrimeTech_Emblem_Tile', parts);
}

// --- 4. Build primetech-hero-chamber.glb ---
function createHeroChamberGlb(): Buffer {
  const parts: GlbMeshPart[] = [];

  // Back deep obsidian armor monolith
  parts.push({
    name: 'Chamber_BackWall',
    geometry: new THREE.BoxGeometry(14, 7.5, 0.4),
    material: MAT_OBSIDIAN_ARMOR,
    position: [0, 2.5, -5.2],
  });

  // Left stepped angular bulkhead baffle + glowing edge strip
  const leftPlate = polyShape([
    [-7.5, -2.5],
    [-3.6, -2.5],
    [-2.4, 0.4],
    [-4.2, 2.2],
    [-2.0, 2.2],
    [-0.9, 3.8],
    [-7.5, 3.8],
  ]);
  const leftGeo = new THREE.ExtrudeGeometry(leftPlate, {
    depth: 0.55,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  leftGeo.translate(0, 2.0, -3.2);
  parts.push({
    name: 'Bulkhead_LeftArmor',
    geometry: leftGeo,
    material: MAT_OBSIDIAN_ARMOR,
  });

  // Upper-right cantilevered obsidian wing
  const rightPlate = polyShape([
    [1.1, 4.0],
    [7.5, 4.0],
    [7.5, 0.1],
    [5.8, 1.7],
    [3.1, 1.7],
    [2.1, 2.8],
  ]);
  const rightGeo = new THREE.ExtrudeGeometry(rightPlate, {
    depth: 0.5,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  rightGeo.translate(0, 1.8, -3.1);
  parts.push({
    name: 'Bulkhead_RightOverhang',
    geometry: rightGeo,
    material: MAT_OBSIDIAN_ARMOR,
  });

  // Lower-left chamfered sill shelf
  const sillPlate = polyShape([
    [-7.5, -2.2],
    [0.6, -2.2],
    [-1.1, -0.35],
    [-7.5, -0.35],
  ]);
  const sillGeo = new THREE.ExtrudeGeometry(sillPlate, {
    depth: 0.6,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  sillGeo.translate(0, 1.1, -2.6);
  parts.push({
    name: 'Bulkhead_LowerLeftSill',
    geometry: sillGeo,
    material: MAT_OBSIDIAN_ARMOR,
  });

  // Illuminated white seam beams
  parts.push(
    {
      name: 'Seam_UpperRightKnee',
      geometry: new THREE.BoxGeometry(2.6, 0.045, 0.06),
      material: MAT_SEAM_EMISSIVE,
      position: [4.35, 3.5, -2.55],
    },
    {
      name: 'Seam_LowerSillHorizon',
      geometry: new THREE.BoxGeometry(5.6, 0.045, 0.06),
      material: MAT_SEAM_EMISSIVE,
      position: [-3.9, 0.76, -1.96],
    }
  );

  return buildGlbBinary('PrimeTech_Hero_Chamber', parts);
}

const outDir = path.resolve(process.cwd(), 'public', 'models');
fs.mkdirSync(outDir, { recursive: true });

const files: Array<{ filename: string; data: Buffer }> = [
  { filename: 'primetech-p-icon.glb', data: createPIconGlb() },
  { filename: 'primetech-wordmark.glb', data: createWordmarkGlb() },
  { filename: 'primetech-plinth-tile.glb', data: createPlinthTileGlb() },
  { filename: 'primetech-hero-chamber.glb', data: createHeroChamberGlb() },
];

for (const f of files) {
  const dest = path.join(outDir, f.filename);
  fs.writeFileSync(dest, f.data);
  console.log(`Generated ${dest} (${(f.data.byteLength / 1024).toFixed(1)} KB)`);
}
