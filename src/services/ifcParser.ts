import * as THREE from 'three';
import type { BimSummary } from '../types.ts';

interface IfcEntity {
  id: number;
  type: string;
  rawArgs: string;
}

function splitTopLevelArgs(input: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && input[i - 1] !== '\\') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    args.push(current.trim());
  }
  return args;
}

function parseRef(token?: string): number | null {
  if (!token) return null;
  const match = token.trim().match(/^#(\d+)$/);
  return match ? Number(match[1]) : null;
}

function parseRefList(token?: string): number[] {
  if (!token) return [];
  const matches = token.matchAll(/#(\d+)/g);
  const out: number[] = [];
  for (const m of matches) {
    out.push(Number(m[1]));
  }
  return out;
}

function parseString(token?: string): string {
  if (!token) return '';
  const trimmed = token.trim();
  if (trimmed === '$' || trimmed === '*') return '';
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseNumber(token?: string, fallback = 0): number {
  if (!token) return fallback;
  const n = Number(token.trim());
  return Number.isFinite(n) ? n : fallback;
}

function parseTupleNumbers(token?: string): number[] {
  if (!token) return [];
  const inner = token.trim().replace(/^\(/, '').replace(/\)$/, '');
  return inner
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

const ARCHITECTURAL_CLASSES = new Set([
  'IFCWALL',
  'IFCWALLSTANDARDCASE',
  'IFCWALLELEMENTEDCASE',
  'IFCSLAB',
  'IFCCOLUMN',
  'IFCBEAM',
  'IFCDOOR',
  'IFCWINDOW',
  'IFCROOF',
  'IFCSTAIR',
  'IFCFURNISHINGELEMENT',
  'IFCMEMBER',
  'IFCPLATE',
  'IFCRAILING',
  'IFCCOVERING',
  'IFCBUILDINGELEMENTPROXY',
]);

const CLASS_STYLE: Record<string, { color: number; roughness: number; metalness: number; opacity?: number }> = {
  IFCWALL: { color: 0xd7d2c8, roughness: 0.82, metalness: 0.04 },
  IFCWALLSTANDARDCASE: { color: 0xd7d2c8, roughness: 0.82, metalness: 0.04 },
  IFCWALLELEMENTEDCASE: { color: 0xd7d2c8, roughness: 0.82, metalness: 0.04 },
  IFCSLAB: { color: 0x8f96a3, roughness: 0.78, metalness: 0.08 },
  IFCCOLUMN: { color: 0x4b5568, roughness: 0.45, metalness: 0.55 },
  IFCBEAM: { color: 0x3b4454, roughness: 0.42, metalness: 0.62 },
  IFCDOOR: { color: 0x7c5338, roughness: 0.58, metalness: 0.08 },
  IFCWINDOW: { color: 0x82c7f5, roughness: 0.12, metalness: 0.1, opacity: 0.48 },
  IFCROOF: { color: 0x566070, roughness: 0.72, metalness: 0.15 },
  IFCSTAIR: { color: 0xb0a79b, roughness: 0.75, metalness: 0.08 },
  IFCFURNISHINGELEMENT: { color: 0xa6805c, roughness: 0.62, metalness: 0.08 },
  IFCMEMBER: { color: 0x526074, roughness: 0.4, metalness: 0.6 },
  IFCPLATE: { color: 0xaab6c7, roughness: 0.35, metalness: 0.65 },
  IFCRAILING: { color: 0x9aa6b8, roughness: 0.3, metalness: 0.75 },
  IFCCOVERING: { color: 0xc8c0b4, roughness: 0.8, metalness: 0.05 },
  IFCBUILDINGELEMENTPROXY: { color: 0x7d8ea6, roughness: 0.6, metalness: 0.25 },
};

/**
 * Pure TypeScript ISO-10303-21 STEP/IFC architectural BIM parser.
 * Builds a Three.js Group with real architectural solids, material coding by IFC class,
 * and returns BIM metadata (project, building, storeys, element counts, real-world dimensions).
 */
export function parseIfcBimFile(
  ifcText: string,
  filename: string
): { group: THREE.Group; summary: BimSummary } {
  const schemaMatch = ifcText.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  const schema = schemaMatch?.[1] || 'IFC4';

  const entities = new Map<number, IfcEntity>();
  const dataSectionIdx = ifcText.indexOf('DATA;');
  const body = dataSectionIdx >= 0 ? ifcText.slice(dataSectionIdx + 5) : ifcText;
  const statements = body.split(/;\s*(?:\r?\n|$)/);

  for (const rawStmt of statements) {
    const stmt = rawStmt.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!stmt.startsWith('#')) continue;
    const eqIdx = stmt.indexOf('=');
    if (eqIdx === -1) continue;
    const id = Number(stmt.slice(1, eqIdx).trim());
    if (!Number.isFinite(id)) continue;
    const rhs = stmt.slice(eqIdx + 1).trim();
    const parenIdx = rhs.indexOf('(');
    if (parenIdx === -1) continue;
    const type = rhs.slice(0, parenIdx).trim().toUpperCase();
    const lastParen = rhs.lastIndexOf(')');
    const rawArgs = lastParen > parenIdx ? rhs.slice(parenIdx + 1, lastParen) : '';
    entities.set(id, { id, type, rawArgs });
  }

  if (entities.size === 0 && !/ISO-10303-21/i.test(ifcText)) {
    throw new Error(
      `Invalid IFC BIM file (${filename}): missing ISO-10303-21 STEP/IFC entities.`
    );
  }

  // Detect millimeter vs meter unit scale
  let unitScale = 1.0;
  if (/IFCSIUNIT\s*\([^)]*\.MILLI\.[^)]*\.METRE\./i.test(ifcText)) {
    unitScale = 0.001;
  } else if (/IFCSIUNIT\s*\([^)]*\.CENTI\.[^)]*\.METRE\./i.test(ifcText)) {
    unitScale = 0.01;
  }

  let projectName = filename.replace(/\.ifc$/i, '');
  let buildingName = 'BIM Structure';
  const storeys: Array<{ name: string; elevation: number }> = [];
  const elementCounts: Record<string, number> = {};

  for (const ent of entities.values()) {
    if (ent.type === 'IFCPROJECT') {
      const args = splitTopLevelArgs(ent.rawArgs);
      const n = parseString(args[2]);
      if (n) projectName = n;
    } else if (ent.type === 'IFCBUILDING') {
      const args = splitTopLevelArgs(ent.rawArgs);
      const n = parseString(args[2]);
      if (n) buildingName = n;
    } else if (ent.type === 'IFCBUILDINGSTOREY') {
      const args = splitTopLevelArgs(ent.rawArgs);
      const name = parseString(args[2]) || `Level ${storeys.length + 1}`;
      const elev = parseNumber(args[9], 0) * unitScale;
      storeys.push({ name, elevation: Number(elev.toFixed(2)) });
    }
  }
  storeys.sort((a, b) => a.elevation - b.elevation);

  const getCartesianPoint = (refId: number | null): THREE.Vector3 => {
    if (!refId) return new THREE.Vector3();
    const ent = entities.get(refId);
    if (!ent || ent.type !== 'IFCCARTESIANPOINT') return new THREE.Vector3();
    const nums = parseTupleNumbers(ent.rawArgs);
    return new THREE.Vector3(
      (nums[0] || 0) * unitScale,
      (nums[1] || 0) * unitScale,
      (nums[2] || 0) * unitScale
    );
  };

  const getDirection = (refId: number | null, fallback: THREE.Vector3): THREE.Vector3 => {
    if (!refId) return fallback.clone();
    const ent = entities.get(refId);
    if (!ent || ent.type !== 'IFCDIRECTION') return fallback.clone();
    const nums = parseTupleNumbers(ent.rawArgs);
    const v = new THREE.Vector3(nums[0] || 0, nums[1] || 0, nums[2] || 0);
    return v.lengthSq() > 0 ? v.normalize() : fallback.clone();
  };

  const getAxisPlacementMatrix = (refId: number | null): THREE.Matrix4 => {
    const m = new THREE.Matrix4();
    if (!refId) return m;
    const ent = entities.get(refId);
    if (!ent) return m;
    const args = splitTopLevelArgs(ent.rawArgs);
    if (ent.type === 'IFCAXIS2PLACEMENT3D') {
      const origin = getCartesianPoint(parseRef(args[0]));
      const zAxis = getDirection(parseRef(args[1]), new THREE.Vector3(0, 0, 1));
      let xAxis = getDirection(parseRef(args[2]), new THREE.Vector3(1, 0, 0));
      // Gram-Schmidt orthonormalization
      xAxis.addScaledVector(zAxis, -xAxis.dot(zAxis));
      if (xAxis.lengthSq() < 1e-6) {
        xAxis =
          Math.abs(zAxis.z) < 0.9
            ? new THREE.Vector3(0, 0, 1).cross(zAxis).normalize()
            : new THREE.Vector3(1, 0, 0).cross(zAxis).normalize();
      } else {
        xAxis.normalize();
      }
      const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis);
      m.setPosition(origin);
    } else if (ent.type === 'IFCAXIS2PLACEMENT2D') {
      const origin = getCartesianPoint(parseRef(args[0]));
      const dir = getDirection(parseRef(args[1]), new THREE.Vector3(1, 0, 0));
      const xAxis = new THREE.Vector3(dir.x, dir.y, 0).normalize();
      const yAxis = new THREE.Vector3(-xAxis.y, xAxis.x, 0);
      m.makeBasis(xAxis, yAxis, new THREE.Vector3(0, 0, 1));
      m.setPosition(origin.x, origin.y, 0);
    }
    return m;
  };

  const placementCache = new Map<number, THREE.Matrix4>();
  const getLocalPlacementMatrix = (refId: number | null, depth = 0): THREE.Matrix4 => {
    if (!refId || depth > 24) return new THREE.Matrix4();
    const cached = placementCache.get(refId);
    if (cached) return cached.clone();
    const ent = entities.get(refId);
    if (!ent || ent.type !== 'IFCLOCALPLACEMENT') return new THREE.Matrix4();
    const args = splitTopLevelArgs(ent.rawArgs);
    const parentMat = getLocalPlacementMatrix(parseRef(args[0]), depth + 1);
    const relMat = getAxisPlacementMatrix(parseRef(args[1]));
    const worldMat = new THREE.Matrix4().multiplyMatrices(parentMat, relMat);
    placementCache.set(refId, worldMat);
    return worldMat.clone();
  };

  // Shared class PBR materials
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const getMaterialForClass = (ifcClass: string): THREE.MeshStandardMaterial => {
    let m = matCache.get(ifcClass);
    if (m) return m;
    const style = CLASS_STYLE[ifcClass] || CLASS_STYLE.IFCBUILDINGELEMENTPROXY;
    m = new THREE.MeshStandardMaterial({
      color: style.color,
      roughness: style.roughness,
      metalness: style.metalness,
      transparent: Boolean(style.opacity && style.opacity < 1),
      opacity: style.opacity ?? 1,
    });
    matCache.set(ifcClass, m);
    return m;
  };

  // Root Z-up -> Y-up architectural conversion group
  const ifcSpaceGroup = new THREE.Group();
  ifcSpaceGroup.rotation.x = -Math.PI / 2;

  const extractProfileShape = (profileId: number | null): {
    kind: 'rect' | 'circle' | 'poly';
    w?: number;
    h?: number;
    r?: number;
    pts?: THREE.Vector2[];
    offsetMatrix?: THREE.Matrix4;
  } | null => {
    if (!profileId) return null;
    const prof = entities.get(profileId);
    if (!prof) return null;
    const args = splitTopLevelArgs(prof.rawArgs);
    if (prof.type === 'IFCRECTANGLEPROFILEDEF') {
      const offsetMatrix = getAxisPlacementMatrix(parseRef(args[2]));
      const xDim = parseNumber(args[3], 0.2) * unitScale;
      const yDim = parseNumber(args[4], 0.2) * unitScale;
      return { kind: 'rect', w: Math.max(0.02, xDim), h: Math.max(0.02, yDim), offsetMatrix };
    }
    if (prof.type === 'IFCCIRCLEPROFILEDEF') {
      const offsetMatrix = getAxisPlacementMatrix(parseRef(args[2]));
      const r = parseNumber(args[3], 0.15) * unitScale;
      return { kind: 'circle', r: Math.max(0.02, r), offsetMatrix };
    }
    if (prof.type === 'IFCARBITRARYCLOSEDPROFILEDEF') {
      const curveId = parseRef(args[2]);
      const curveEnt = curveId ? entities.get(curveId) : undefined;
      if (curveEnt && curveEnt.type === 'IFCPOLYLINE') {
        const ptIds = parseRefList(splitTopLevelArgs(curveEnt.rawArgs)[0]);
        const pts = ptIds.map((pid) => {
          const p = getCartesianPoint(pid);
          return new THREE.Vector2(p.x, p.y);
        });
        if (pts.length >= 3) {
          return { kind: 'poly', pts };
        }
      }
    }
    return null;
  };

  let meshCount = 0;

  for (const ent of entities.values()) {
    if (!ARCHITECTURAL_CLASSES.has(ent.type)) continue;
    elementCounts[ent.type] = (elementCounts[ent.type] || 0) + 1;

    const args = splitTopLevelArgs(ent.rawArgs);
    const elemName = parseString(args[2]) || ent.type.replace(/^IFC/, '');
    const placementMatrix = getLocalPlacementMatrix(parseRef(args[5]));
    const productShapeId = parseRef(args[6]);
    const productShape = productShapeId ? entities.get(productShapeId) : undefined;
    const material = getMaterialForClass(ent.type);

    let builtAny = false;

    if (productShape && productShape.type === 'IFCPRODUCTDEFINITIONSHAPE') {
      const repIds = parseRefList(splitTopLevelArgs(productShape.rawArgs)[2]);
      for (const repId of repIds) {
        const rep = entities.get(repId);
        if (!rep || rep.type !== 'IFCSHAPEREPRESENTATION') continue;
        const repArgs = splitTopLevelArgs(rep.rawArgs);
        const itemIds = parseRefList(repArgs[3]);
        for (const itemId of itemIds) {
          const item = entities.get(itemId);
          if (!item) continue;

          if (item.type === 'IFCEXTRUDEDAREASOLID') {
            const solidArgs = splitTopLevelArgs(item.rawArgs);
            const profile = extractProfileShape(parseRef(solidArgs[0]));
            const solidPosMat = getAxisPlacementMatrix(parseRef(solidArgs[1]));
            const depth = Math.max(0.02, parseNumber(solidArgs[3], 1.0) * unitScale);

            let geo: THREE.BufferGeometry | null = null;
            if (profile?.kind === 'rect') {
              geo = new THREE.BoxGeometry(profile.w, profile.h, depth);
              geo.translate(0, 0, depth / 2);
              if (profile.offsetMatrix) geo.applyMatrix4(profile.offsetMatrix);
            } else if (profile?.kind === 'circle') {
              geo = new THREE.CylinderGeometry(profile.r, profile.r, depth, 18);
              geo.rotateX(Math.PI / 2);
              geo.translate(0, 0, depth / 2);
              if (profile.offsetMatrix) geo.applyMatrix4(profile.offsetMatrix);
            } else if (profile?.kind === 'poly' && profile.pts) {
              const shape = new THREE.Shape(profile.pts);
              geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
            }

            if (geo) {
              const mesh = new THREE.Mesh(geo, material);
              mesh.name = elemName;
              const combined = new THREE.Matrix4().multiplyMatrices(placementMatrix, solidPosMat);
              mesh.applyMatrix4(combined);
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              ifcSpaceGroup.add(mesh);
              builtAny = true;
              meshCount++;
            }
          } else if (item.type === 'IFCBOUNDINGBOX') {
            const boxArgs = splitTopLevelArgs(item.rawArgs);
            const corner = getCartesianPoint(parseRef(boxArgs[0]));
            const dx = Math.max(0.04, parseNumber(boxArgs[1], 0.5) * unitScale);
            const dy = Math.max(0.04, parseNumber(boxArgs[2], 0.5) * unitScale);
            const dz = Math.max(0.04, parseNumber(boxArgs[3], 0.5) * unitScale);
            const geo = new THREE.BoxGeometry(dx, dy, dz);
            geo.translate(corner.x + dx / 2, corner.y + dy / 2, corner.z + dz / 2);
            const mesh = new THREE.Mesh(geo, material);
            mesh.name = elemName;
            mesh.applyMatrix4(placementMatrix);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            ifcSpaceGroup.add(mesh);
            builtAny = true;
            meshCount++;
          }
        }
      }
    }

    // Fallback semantic proxy geometry when IFC file omits solid representation (structural schema preview)
    if (!builtAny && meshCount < 350) {
      const isSlab = ent.type === 'IFCSLAB' || ent.type === 'IFCROOF';
      const isCol = ent.type === 'IFCCOLUMN';
      const geo = isSlab
        ? new THREE.BoxGeometry(2.4, 2.4, 0.22)
        : isCol
          ? new THREE.CylinderGeometry(0.16, 0.16, 2.8, 12)
          : new THREE.BoxGeometry(1.8, 0.24, 2.5);
      if (isCol) geo.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = elemName;
      mesh.applyMatrix4(placementMatrix);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      ifcSpaceGroup.add(mesh);
      meshCount++;
    }
  }

  // If the IFC had headers/storeys only and zero element meshes, synthesize a clean storey massing diagram
  if (meshCount === 0) {
    const numLevels = Math.max(1, storeys.length);
    for (let i = 0; i < numLevels; i++) {
      const slabGeo = new THREE.BoxGeometry(4.2, 3.0, 0.18);
      const slab = new THREE.Mesh(slabGeo, getMaterialForClass('IFCSLAB'));
      slab.position.set(0, 0, i * 1.4);
      slab.castShadow = true;
      slab.receiveShadow = true;
      ifcSpaceGroup.add(slab);
      meshCount++;
    }
  }

  const wrapper = new THREE.Group();
  wrapper.name = `BIM_${projectName}`;
  wrapper.add(ifcSpaceGroup);
  wrapper.updateMatrixWorld(true);

  const rawBox = new THREE.Box3().setFromObject(wrapper);
  const rawSize = rawBox.getSize(new THREE.Vector3());

  // Normalize BIM scale onto the studio pedestal/floor footprint (~1.05m max horizontal span)
  const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
  const targetMaxDim = 1.05;
  const normScale = targetMaxDim / maxDim;
  wrapper.scale.setScalar(normScale);
  wrapper.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(wrapper);
  const center = scaledBox.getCenter(new THREE.Vector3());
  wrapper.position.set(-center.x, -scaledBox.min.y, -center.z);
  wrapper.updateMatrixWorld(true);

  const totalElements = Object.values(elementCounts).reduce((a, b) => a + b, 0);

  return {
    group: wrapper,
    summary: {
      schema,
      projectName,
      buildingName,
      storeys,
      elementCounts,
      totalElements,
      boundingBoxMeters: [
        Number(rawSize.x.toFixed(2)),
        Number(rawSize.y.toFixed(2)),
        Number(rawSize.z.toFixed(2)),
      ],
    },
  };
}
