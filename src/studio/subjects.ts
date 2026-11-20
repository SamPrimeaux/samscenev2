import * as THREE from 'three';
import type {
  AudioLevels,
  ExplodablePart,
  StudioSubjectId,
  StudioSubjectInstance,
} from '../types.ts';
import type { StudioMaterialLibrary } from './materials.ts';

function registerPart(
  list: ExplodablePart[],
  object: THREE.Object3D,
  explodeOffset: THREE.Vector3
): void {
  list.push({
    object,
    basePosition: object.position.clone(),
    explodeOffset,
  });
}

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = cast;
      child.receiveShadow = receive;
    }
  });
}

function computeSafeTangents(geometry: THREE.BufferGeometry): void {
  if (
    geometry.index &&
    geometry.attributes.position &&
    geometry.attributes.normal &&
    geometry.attributes.uv
  ) {
    geometry.computeTangents();
  }
}

export function createStudioSubject(
  id: StudioSubjectId,
  materials: StudioMaterialLibrary
): StudioSubjectInstance {
  switch (id) {
    case 'primetech-cadmesh':
      return buildPrimeTechCadMesh(materials);
    case 'primetech-plinth':
      return buildPrimeTechPlinth(materials);
    case 'astrolabe':
      return buildAstrolabe(materials);
    case 'pavilion':
      return buildPavilion(materials);
    case 'vox':
      return buildVoxCompanion(materials);
    case 'terrarium':
      return buildTerrarium(materials);
  }
}

function buildAstrolabe(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'AstrolabeSculpture';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Lathe-turned obsidian pedestal base (y=0 flush)
  const baseProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.145, 0.0),
    new THREE.Vector2(0.135, 0.025),
    new THREE.Vector2(0.095, 0.045),
    new THREE.Vector2(0.08, 0.08),
    new THREE.Vector2(0.055, 0.095),
    new THREE.Vector2(0.0, 0.095),
  ];
  const baseGeo = track(new THREE.LatheGeometry(baseProfile, 40));
  computeSafeTangents(baseGeo);
  const baseMesh = new THREE.Mesh(baseGeo, materials.slatePlinth);
  root.add(baseMesh);
  registerPart(explodableParts, baseMesh, new THREE.Vector3(0, -0.05, 0));

  // 2. Brushed metal collar flange
  const collarGeo = track(new THREE.CylinderGeometry(0.068, 0.082, 0.024, 36));
  const collarMesh = new THREE.Mesh(collarGeo, materials.heroMetal);
  collarMesh.position.set(0, 0.105, 0);
  root.add(collarMesh);
  registerPart(explodableParts, collarMesh, new THREE.Vector3(0, -0.02, 0));

  // 3. Curved support cradle arm (TubeGeometry)
  const cradleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 0.34, 0),
    new THREE.Vector3(-0.18, 0.17, 0),
    new THREE.Vector3(0, 0.11, 0),
    new THREE.Vector3(0.18, 0.17, 0),
    new THREE.Vector3(0.22, 0.34, 0),
  ]);
  const cradleGeo = track(new THREE.TubeGeometry(cradleCurve, 40, 0.012, 12, false));
  const cradleMesh = new THREE.Mesh(cradleGeo, materials.secondaryMetal);
  root.add(cradleMesh);
  registerPart(explodableParts, cradleMesh, new THREE.Vector3(0, -0.04, -0.08));

  // 4. Outer hero gimbal ring
  const outerRingGeo = track(new THREE.TorusGeometry(0.205, 0.013, 20, 72));
  const outerRing = new THREE.Mesh(outerRingGeo, materials.heroMetal);
  outerRing.position.set(0, 0.34, 0);
  root.add(outerRing);
  registerPart(explodableParts, outerRing, new THREE.Vector3(-0.1, 0.06, 0));

  // 5. Mid titanium gimbal ring
  const midRingGeo = track(new THREE.TorusGeometry(0.158, 0.01, 18, 64));
  const midRing = new THREE.Mesh(midRingGeo, materials.secondaryMetal);
  midRing.position.set(0, 0.34, 0);
  midRing.rotation.set(Math.PI * 0.25, 0.3, 0);
  root.add(midRing);
  registerPart(explodableParts, midRing, new THREE.Vector3(0.1, 0.08, 0));

  // 6. Inner emissive harmonic halo ring
  const innerRingGeo = track(new THREE.TorusGeometry(0.112, 0.006, 16, 56));
  const innerRing = new THREE.Mesh(innerRingGeo, materials.emissiveAccent);
  innerRing.position.set(0, 0.34, 0);
  innerRing.rotation.set(-Math.PI * 0.3, 0.5, 0);
  root.add(innerRing);
  registerPart(explodableParts, innerRing, new THREE.Vector3(0, 0.12, 0.08));

  // 7. Optical glass central orb + glowing core filament
  const coreGroup = new THREE.Group();
  coreGroup.position.set(0, 0.34, 0);
  const coreOrbGeo = track(new THREE.SphereGeometry(0.064, 36, 28));
  const coreOrb = new THREE.Mesh(coreOrbGeo, materials.opticalGlass);
  coreOrb.renderOrder = 2;
  const coreSeedGeo = track(new THREE.OctahedronGeometry(0.026, 0));
  const coreSeed = new THREE.Mesh(coreSeedGeo, materials.emissiveAccent);
  coreGroup.add(coreSeed, coreOrb);
  root.add(coreGroup);
  registerPart(explodableParts, coreGroup, new THREE.Vector3(0, 0.18, 0));

  // 8-11. Four orbiting harmonic resonator chimes
  const chimeGeo = track(new THREE.CapsuleGeometry(0.011, 0.036, 8, 16));
  const chimes: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const chime = new THREE.Mesh(chimeGeo, materials.heroMetal);
    chime.position.set(Math.cos(angle) * 0.24, 0.34, Math.sin(angle) * 0.24);
    root.add(chime);
    chimes.push(chime);
    registerPart(
      explodableParts,
      chime,
      new THREE.Vector3(Math.cos(angle) * 0.14, 0.12, Math.sin(angle) * 0.14)
    );
  }

  enableShadows(root, true, true);
  coreOrb.castShadow = false;

  return {
    id: 'astrolabe',
    root,
    explodableParts,
    primaryMetalMeshes: [collarMesh, outerRing, ...chimes],
    accentMeshes: [cradleMesh, midRing],
    emissiveMeshes: [innerRing, coreSeed],
    updateAnimation: (elapsed, delta, audio) => {
      const boost = 1 + audio.overall * 2.6;
      outerRing.rotation.y += delta * 0.45 * boost;
      outerRing.rotation.x = Math.sin(elapsed * 0.7) * 0.32;

      midRing.rotation.x += delta * 0.72 * boost;
      midRing.rotation.z += delta * 0.35 * boost;

      innerRing.rotation.y -= delta * 1.1 * boost;
      innerRing.rotation.z += delta * 0.65;

      coreSeed.rotation.y += delta * 1.4;
      coreSeed.rotation.x += delta * 0.8;
      const pulse = 1 + audio.low * 0.45;
      coreSeed.scale.setScalar(pulse);
      materials.emissiveAccent.emissiveIntensity = 1.1 + audio.overall * 2.2;

      for (let i = 0; i < chimes.length; i++) {
        const a = elapsed * 0.65 + (i * Math.PI) / 2;
        const r = 0.24 + audio.mid * 0.03;
        chimes[i].position.x = Math.cos(a) * r;
        chimes[i].position.z = Math.sin(a) * r;
        chimes[i].rotation.z = Math.sin(elapsed * 2 + i) * (0.12 + audio.high * 0.35);
      }
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
    },
  };
}

function buildPavilion(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'CantileverPavilion';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Stepped travertine lower terrace (y=0 flush)
  const lowerShape = new THREE.Shape();
  lowerShape.moveTo(-0.23, -0.17);
  lowerShape.lineTo(0.23, -0.17);
  lowerShape.lineTo(0.23, 0.17);
  lowerShape.lineTo(-0.23, 0.17);
  lowerShape.closePath();
  const lowerGeo = track(
    new THREE.ExtrudeGeometry(lowerShape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 3,
    })
  );
  lowerGeo.rotateX(-Math.PI / 2);
  lowerGeo.translate(0, 0.006, 0);
  const lowerTerrace = new THREE.Mesh(lowerGeo, materials.travertine);
  root.add(lowerTerrace);
  registerPart(explodableParts, lowerTerrace, new THREE.Vector3(0, -0.05, 0));

  // 2. Upper slate reflecting pool deck
  const deckGeo = track(new THREE.BoxGeometry(0.36, 0.022, 0.26));
  const deckMesh = new THREE.Mesh(deckGeo, materials.slatePlinth);
  deckMesh.position.set(-0.02, 0.048, 0);
  root.add(deckMesh);
  registerPart(explodableParts, deckMesh, new THREE.Vector3(0, 0.02, 0));

  // 3. Structural steel pilotis columns (4-column subassembly)
  const colsGroup = new THREE.Group();
  const colGeo = track(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 16));
  const colCoords = [
    [-0.14, -0.09],
    [0.1, -0.09],
    [-0.14, 0.09],
    [0.1, 0.09],
  ];
  for (const [cx, cz] of colCoords) {
    const col = new THREE.Mesh(colGeo, materials.heroMetal);
    col.position.set(cx, 0.15, cz);
    colsGroup.add(col);
  }
  root.add(colsGroup);
  registerPart(explodableParts, colsGroup, new THREE.Vector3(-0.08, 0.08, 0));

  // 4. Optical glass curtain volume
  const glassWallGeo = track(new THREE.BoxGeometry(0.22, 0.16, 0.17));
  const glassWall = new THREE.Mesh(glassWallGeo, materials.opticalGlass);
  glassWall.position.set(-0.02, 0.14, 0);
  glassWall.renderOrder = 2;
  root.add(glassWall);
  registerPart(explodableParts, glassWall, new THREE.Vector3(0, 0.12, 0.08));

  // 5. Interior sculptural hearth prism (emissive + audio reactive)
  const hearthGeo = track(new THREE.CylinderGeometry(0.036, 0.044, 0.11, 6));
  const hearth = new THREE.Mesh(hearthGeo, materials.emissiveAccent);
  hearth.position.set(-0.02, 0.115, 0);
  root.add(hearth);
  registerPart(explodableParts, hearth, new THREE.Vector3(0, 0.16, 0));

  // 6. Cantilevered walnut roof canopy (ExtrudeGeometry with bevels)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.21, -0.15);
  roofShape.lineTo(0.27, -0.15);
  roofShape.lineTo(0.27, 0.15);
  roofShape.lineTo(-0.21, 0.15);
  roofShape.closePath();
  const roofGeo = track(
    new THREE.ExtrudeGeometry(roofShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 3,
    })
  );
  roofGeo.rotateX(-Math.PI / 2);
  const roofMesh = new THREE.Mesh(roofGeo, materials.walnutWood);
  roofMesh.position.set(0.02, 0.24, 0);
  root.add(roofMesh);
  registerPart(explodableParts, roofMesh, new THREE.Vector3(0.06, 0.24, 0));

  // 7. Brushed metallic roof fascia trim
  const trimGeo = track(new THREE.BoxGeometry(0.49, 0.012, 0.31));
  const trimMesh = new THREE.Mesh(trimGeo, materials.heroMetal);
  trimMesh.position.set(0.05, 0.274, 0);
  root.add(trimMesh);
  registerPart(explodableParts, trimMesh, new THREE.Vector3(0.06, 0.31, 0));

  // 8. Rooftop kinetic skylight louver fins
  const louverGroup = new THREE.Group();
  louverGroup.position.set(0.02, 0.295, 0);
  const finGeo = track(new THREE.BoxGeometry(0.016, 0.024, 0.22));
  const fins: THREE.Mesh[] = [];
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(finGeo, materials.secondaryMetal);
    fin.position.set(i * 0.045, 0, 0);
    louverGroup.add(fin);
    fins.push(fin);
  }
  root.add(louverGroup);
  registerPart(explodableParts, louverGroup, new THREE.Vector3(0.06, 0.38, 0));

  enableShadows(root, true, true);
  glassWall.castShadow = false;

  return {
    id: 'pavilion',
    root,
    explodableParts,
    primaryMetalMeshes: [trimMesh, ...colsGroup.children as THREE.Mesh[]],
    accentMeshes: fins,
    emissiveMeshes: [hearth],
    updateAnimation: (elapsed, _delta, audio) => {
      const tilt = Math.sin(elapsed * 0.8) * 0.25 + audio.mid * 0.45;
      for (const fin of fins) {
        fin.rotation.z = tilt;
      }
      hearth.scale.y = 1 + audio.low * 0.38;
      materials.emissiveAccent.emissiveIntensity = 1.0 + audio.overall * 2.1;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
    },
  };
}

function buildVoxCompanion(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'VoxStudioCompanion';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Chamfered chassis base
  const chassisGeo = track(new THREE.CylinderGeometry(0.11, 0.145, 0.12, 8));
  const chassis = new THREE.Mesh(chassisGeo, materials.slatePlinth);
  chassis.position.set(0, 0.06, 0);
  root.add(chassis);
  registerPart(explodableParts, chassis, new THREE.Vector3(0, -0.05, 0));

  // 2. Chest resonator plate (brushed hero metal)
  const chestGeo = track(new THREE.CylinderGeometry(0.095, 0.115, 0.11, 24));
  const chest = new THREE.Mesh(chestGeo, materials.heroMetal);
  chest.position.set(0, 0.175, 0);
  root.add(chest);
  registerPart(explodableParts, chest, new THREE.Vector3(0, 0.02, 0));

  // 3. Chest glowing core badge
  const badgeGeo = track(new THREE.TorusGeometry(0.036, 0.008, 12, 32));
  const badge = new THREE.Mesh(badgeGeo, materials.emissiveAccent);
  badge.position.set(0, 0.18, 0.098);
  root.add(badge);
  registerPart(explodableParts, badge, new THREE.Vector3(0, 0.02, 0.14));

  // 4 & 5. Articulated shoulder pods (left + right)
  const podGeo = track(new THREE.CapsuleGeometry(0.032, 0.075, 8, 16));
  const leftPod = new THREE.Mesh(podGeo, materials.secondaryMetal);
  leftPod.position.set(-0.145, 0.19, 0);
  leftPod.rotation.z = 0.22;
  const rightPod = new THREE.Mesh(podGeo, materials.secondaryMetal);
  rightPod.position.set(0.145, 0.19, 0);
  rightPod.rotation.z = -0.22;
  root.add(leftPod, rightPod);
  registerPart(explodableParts, leftPod, new THREE.Vector3(-0.14, 0.06, 0));
  registerPart(explodableParts, rightPod, new THREE.Vector3(0.14, 0.06, 0));

  // 6. Lathe-turned articulated neck collar
  const neckPts = [
    new THREE.Vector2(0.04, 0),
    new THREE.Vector2(0.055, 0.015),
    new THREE.Vector2(0.032, 0.035),
    new THREE.Vector2(0.048, 0.055),
    new THREE.Vector2(0, 0.055),
  ];
  const neckGeo = track(new THREE.LatheGeometry(neckPts, 24));
  const neck = new THREE.Mesh(neckGeo, materials.secondaryMetal);
  neck.position.set(0, 0.23, 0);
  root.add(neck);
  registerPart(explodableParts, neck, new THREE.Vector3(0, 0.1, 0));

  // 7. Articulated Head Assembly (shell + optical visor + waveform eyes + boom antennae)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.34, 0);

  const headShape = new THREE.Shape();
  headShape.moveTo(-0.085, -0.05);
  headShape.lineTo(0.085, -0.05);
  headShape.lineTo(0.1, 0.03);
  headShape.lineTo(0.07, 0.065);
  headShape.lineTo(-0.07, 0.065);
  headShape.lineTo(-0.1, 0.03);
  headShape.closePath();

  const headShellGeo = track(
    new THREE.ExtrudeGeometry(headShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 4,
    })
  );
  headShellGeo.center();
  const headShell = new THREE.Mesh(headShellGeo, materials.heroMetal);
  headGroup.add(headShell);

  const visorGeo = track(new THREE.BoxGeometry(0.17, 0.062, 0.022));
  const visor = new THREE.Mesh(visorGeo, materials.slatePlinth);
  visor.position.set(0, 0.005, 0.066);
  headGroup.add(visor);

  // Audio-reactive visor bars (5 segments)
  const barGeo = track(new THREE.BoxGeometry(0.018, 0.032, 0.012));
  const visorBars: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(barGeo, materials.emissiveAccent);
    bar.position.set((i - 2) * 0.028, 0.005, 0.078);
    headGroup.add(bar);
    visorBars.push(bar);
  }

  // Dual curved boom antennae
  const leftAntCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.095, 0.02, 0),
    new THREE.Vector3(-0.135, 0.09, 0.01),
    new THREE.Vector3(-0.09, 0.14, 0.05),
  ]);
  const rightAntCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.095, 0.02, 0),
    new THREE.Vector3(0.135, 0.09, 0.01),
    new THREE.Vector3(0.09, 0.14, 0.05),
  ]);
  const leftAntGeo = track(new THREE.TubeGeometry(leftAntCurve, 20, 0.005, 8, false));
  const rightAntGeo = track(new THREE.TubeGeometry(rightAntCurve, 20, 0.005, 8, false));
  const leftAnt = new THREE.Mesh(leftAntGeo, materials.secondaryMetal);
  const rightAnt = new THREE.Mesh(rightAntGeo, materials.secondaryMetal);
  headGroup.add(leftAnt, rightAnt);

  root.add(headGroup);
  registerPart(explodableParts, headGroup, new THREE.Vector3(0, 0.2, 0));

  enableShadows(root, true, true);

  return {
    id: 'vox',
    root,
    explodableParts,
    primaryMetalMeshes: [chest, headShell],
    accentMeshes: [leftPod, rightPod, neck, leftAnt, rightAnt],
    emissiveMeshes: [badge, ...visorBars],
    updateAnimation: (elapsed, _delta, audio) => {
      headGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.22;
      headGroup.rotation.x = Math.sin(elapsed * 1.4) * 0.06 - audio.mid * 0.14;
      leftPod.rotation.z = 0.22 + Math.sin(elapsed * 1.6) * 0.06 + audio.low * 0.18;
      rightPod.rotation.z = -0.22 - Math.sin(elapsed * 1.6) * 0.06 - audio.low * 0.18;

      for (let i = 0; i < visorBars.length; i++) {
        const weight = i === 2 ? audio.mid : i === 1 || i === 3 ? audio.low : audio.high;
        const idle = 0.35 + Math.sin(elapsed * 4 + i * 0.8) * 0.15;
        visorBars[i].scale.y = idle + weight * 1.5;
      }
      materials.emissiveAccent.emissiveIntensity = 1.2 + audio.overall * 2.2;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
    },
  };
}

function buildTerrarium(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'AetherTerrarium';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };

  // 1. Lathe copper-style vessel dish (y=0 flush)
  const vesselPts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.15, 0),
    new THREE.Vector2(0.195, 0.03),
    new THREE.Vector2(0.21, 0.075),
    new THREE.Vector2(0.19, 0.085),
    new THREE.Vector2(0.17, 0.065),
    new THREE.Vector2(0, 0.055),
  ];
  const vesselGeo = track(new THREE.LatheGeometry(vesselPts, 44));
  computeSafeTangents(vesselGeo);
  const vessel = new THREE.Mesh(vesselGeo, materials.heroMetal);
  root.add(vessel);
  registerPart(explodableParts, vessel, new THREE.Vector3(0, -0.05, 0));

  // 2. Mossy soil mound
  const mossGeo = track(new THREE.CylinderGeometry(0.175, 0.185, 0.04, 32));
  const moss = new THREE.Mesh(mossGeo, materials.moss);
  moss.position.set(0, 0.07, 0);
  root.add(moss);
  registerPart(explodableParts, moss, new THREE.Vector3(0, 0.01, 0));

  // 3. Sculpted bonsai trunk + branches (TubeGeometry)
  const bonsaiGroup = new THREE.Group();
  bonsaiGroup.position.set(0, 0.085, 0);

  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.02, 0.06, 0.01),
    new THREE.Vector3(0.03, 0.12, -0.01),
    new THREE.Vector3(0.01, 0.18, 0.015),
  ]);
  const trunkGeo = track(new THREE.TubeGeometry(trunkCurve, 24, 0.016, 10, false));
  const trunk = new THREE.Mesh(trunkGeo, materials.walnutWood);

  const branchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.015, 0.1, 0),
    new THREE.Vector3(-0.05, 0.135, 0.025),
    new THREE.Vector3(-0.08, 0.155, 0.03),
  ]);
  const branchGeo = track(new THREE.TubeGeometry(branchCurve, 16, 0.008, 8, false));
  const branch = new THREE.Mesh(branchGeo, materials.walnutWood);
  bonsaiGroup.add(trunk, branch);
  root.add(bonsaiGroup);
  registerPart(explodableParts, bonsaiGroup, new THREE.Vector3(0, 0.08, 0));

  // 4-6. Layered foliage canopy pads
  const canopyGroup = new THREE.Group();
  canopyGroup.position.set(0, 0.085, 0);
  const padGeo1 = track(new THREE.IcosahedronGeometry(0.056, 2));
  padGeo1.scale(1.3, 0.65, 1.15);
  const pad1 = new THREE.Mesh(padGeo1, materials.foliage);
  pad1.position.set(0.015, 0.195, 0.015);

  const padGeo2 = track(new THREE.IcosahedronGeometry(0.044, 2));
  padGeo2.scale(1.25, 0.6, 1.1);
  const pad2 = new THREE.Mesh(padGeo2, materials.foliage);
  pad2.position.set(-0.082, 0.165, 0.03);

  const pad3 = new THREE.Mesh(padGeo2, materials.foliage);
  pad3.position.set(0.07, 0.155, -0.035);
  canopyGroup.add(pad1, pad2, pad3);
  root.add(canopyGroup);
  registerPart(explodableParts, canopyGroup, new THREE.Vector3(0, 0.16, 0));

  // 7. InstancedMesh bioluminescent spores (>20 instances)
  const sporeCount = 26;
  const sporeGeo = track(new THREE.OctahedronGeometry(0.0055, 0));
  const spores = new THREE.InstancedMesh(
    sporeGeo,
    materials.emissiveAccent,
    sporeCount
  );
  const sporeSeeds: Array<{ angle: number; radius: number; y: number; speed: number }> = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < sporeCount; i++) {
    const angle = (i / sporeCount) * Math.PI * 2;
    const radius = 0.05 + (i % 5) * 0.025;
    const y = 0.12 + ((i * 0.037) % 0.22);
    sporeSeeds.push({ angle, radius, y, speed: 0.4 + (i % 4) * 0.18 });
    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dummy.updateMatrix();
    spores.setMatrixAt(i, dummy.matrix);
  }
  spores.instanceMatrix.needsUpdate = true;
  spores.computeBoundingSphere();
  spores.frustumCulled = false;
  root.add(spores);
  registerPart(explodableParts, spores, new THREE.Vector3(0, 0.2, 0));

  // 8. Optical glass dome (depthWrite: false, explicit renderOrder)
  const domeGeo = track(
    new THREE.SphereGeometry(0.195, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.54)
  );
  const dome = new THREE.Mesh(domeGeo, materials.glassDome);
  dome.position.set(0, 0.08, 0);
  dome.scale.set(1, 1.55, 1);
  dome.renderOrder = 4;
  root.add(dome);
  registerPart(explodableParts, dome, new THREE.Vector3(0, 0.3, 0));

  // 9. Top brass finial knob on glass dome
  const finialGeo = track(new THREE.SphereGeometry(0.018, 20, 16));
  const finial = new THREE.Mesh(finialGeo, materials.heroMetal);
  finial.position.set(0, 0.388, 0);
  root.add(finial);
  registerPart(explodableParts, finial, new THREE.Vector3(0, 0.4, 0));

  enableShadows(root, true, true);
  dome.castShadow = false;

  return {
    id: 'terrarium',
    root,
    explodableParts,
    primaryMetalMeshes: [vessel, finial],
    accentMeshes: [],
    emissiveMeshes: [],
    updateAnimation: (elapsed, _delta, audio) => {
      const puff = 1 + audio.overall * 0.65;
      for (let i = 0; i < sporeCount; i++) {
        const s = sporeSeeds[i];
        const a = s.angle + elapsed * s.speed;
        const r = s.radius * (1 + audio.mid * 0.2);
        const y = s.y + Math.sin(elapsed * 1.8 + i) * 0.02 + audio.low * 0.04;
        dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        dummy.scale.setScalar(puff);
        dummy.rotation.y = elapsed + i;
        dummy.updateMatrix();
        spores.setMatrixAt(i, dummy.matrix);
      }
      spores.instanceMatrix.needsUpdate = true;
      materials.emissiveAccent.emissiveIntensity = 1.1 + audio.overall * 2.4;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
    },
  };
}

/**
 * Generates the exact 5 faceted polygon shapes forming PrimeTech's signature geometric "P" emblem,
 * matching the interlocking CAD bevel segments in image_bcd90a2d.png and both hero visuals.
 */
function createPrimeTechFacetShapes(scale = 0.085): THREE.Shape[] {
  const poly = (pts: Array<[number, number]>): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0] * scale, pts[0][1] * scale);
    for (let i = 1; i < pts.length; i++) {
      s.lineTo(pts[i][0] * scale, pts[i][1] * scale);
    }
    s.closePath();
    return s;
  };

  // Normalized coordinates (total height = 1.0) scaled by caller factor
  const topCrown = poly([
    [-0.1961, 0.2729],
    [0.1879, 0.2729],
    [0.1324, 0.4967],
    [-0.0327, 0.4967],
  ]);

  const upperRightWing = poly([
    [0.1797, 0.4951],
    [0.2941, 0.1373],
    [0.2647, 0.0605],
    [0.4232, 0.0605],
    [0.4232, 0.2696],
  ]);

  const lowerCounterBar = poly([
    [-0.134, -0.2173],
    [0.0882, -0.2173],
    [0.3922, 0.0065],
    [0.0163, 0.0065],
  ]);

  const upperLeftSlab = poly([
    [-0.4248, -0.232],
    [-0.1977, 0.1373],
    [-0.1977, 0.1993],
    [-0.4248, 0.268],
  ]);

  const lowerLeftHeel = poly([
    [-0.1879, 0.0376],
    [-0.4134, -0.3203],
    [-0.1879, -0.4984],
  ]);

  return [topCrown, upperRightWing, lowerCounterBar, upperLeftSlab, lowerLeftHeel];
}

function createRoundedRectShape(width: number, height: number, radius: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.min(radius, hw, hh);
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

/**
 * Scene 1 — PrimeTech CadMesh Terrain Monolith
 * Machined obsidian CAD bulkhead armor plates, crisp white/ice-cyan backlit seams,
 * sculpted metallic PrimeTech faceted P emblem + divider bar, and an animated 3D wireframe terrain point-cloud.
 */
function buildPrimeTechCadMesh(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'PrimeTechCadMesh';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const obsidianMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x11141b,
      metalness: 0.72,
      roughness: 0.28,
    })
  );
  const brushedSilverMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe6ecf4,
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.35,
      clearcoatRoughness: 0.15,
    })
  );
  const seamGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f9ff,
      emissive: 0xdaf0ff,
      emissiveIntensity: 1.85,
      roughness: 0.15,
      metalness: 0.1,
    })
  );

  // 1. Chamfered obsidian datum base plate (flush at y = 0)
  const datumShape = createRoundedRectShape(0.46, 0.32, 0.024);
  const datumGeo = trackGeo(
    new THREE.ExtrudeGeometry(datumShape, {
      depth: 0.022,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    })
  );
  datumGeo.rotateX(-Math.PI / 2);
  datumGeo.translate(0, 0.006, 0);
  const datumBase = new THREE.Mesh(datumGeo, obsidianMat);
  root.add(datumBase);
  registerPart(explodableParts, datumBase, new THREE.Vector3(0, -0.06, 0));

  // 2. Angular obsidian backplate baffle (mirrors the stepped diagonal bulkhead framing)
  const baffleShape = new THREE.Shape();
  baffleShape.moveTo(-0.22, 0.0);
  baffleShape.lineTo(0.22, 0.0);
  baffleShape.lineTo(0.22, 0.25);
  baffleShape.lineTo(0.08, 0.32);
  baffleShape.lineTo(-0.14, 0.32);
  baffleShape.lineTo(-0.22, 0.2);
  baffleShape.closePath();

  const baffleGeo = trackGeo(
    new THREE.ExtrudeGeometry(baffleShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.004,
      bevelThickness: 0.004,
    })
  );
  const backBaffle = new THREE.Mesh(baffleGeo, obsidianMat);
  backBaffle.position.set(0, 0.032, -0.078);
  root.add(backBaffle);
  registerPart(explodableParts, backBaffle, new THREE.Vector3(0, 0.04, -0.16));

  // 3. Left & Right stepped armor wing plates (exploded forward & outward)
  const leftWingShape = new THREE.Shape();
  leftWingShape.moveTo(0, 0);
  leftWingShape.lineTo(0.095, 0);
  leftWingShape.lineTo(0.042, 0.145);
  leftWingShape.lineTo(0.082, 0.265);
  leftWingShape.lineTo(0, 0.265);
  leftWingShape.closePath();
  const leftWingGeo = trackGeo(
    new THREE.ExtrudeGeometry(leftWingShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.003,
      bevelThickness: 0.003,
    })
  );
  const leftWing = new THREE.Mesh(leftWingGeo, obsidianMat);
  leftWing.position.set(-0.225, 0.042, -0.045);
  leftWing.rotation.y = 0.16;
  root.add(leftWing);
  registerPart(explodableParts, leftWing, new THREE.Vector3(-0.15, 0.03, 0.06));

  const rightCornerShape = new THREE.Shape();
  rightCornerShape.moveTo(0, 0);
  rightCornerShape.lineTo(0.11, 0);
  rightCornerShape.lineTo(0.11, 0.13);
  rightCornerShape.lineTo(0.04, 0.13);
  rightCornerShape.closePath();
  const rightCornerGeo = trackGeo(
    new THREE.ExtrudeGeometry(rightCornerShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.003,
      bevelThickness: 0.003,
    })
  );
  const rightHood = new THREE.Mesh(rightCornerGeo, obsidianMat);
  rightHood.position.set(0.105, 0.21, -0.042);
  rightHood.rotation.y = -0.14;
  root.add(rightHood);
  registerPart(explodableParts, rightHood, new THREE.Vector3(0.14, 0.09, 0.05));

  // 4. Crisp luminous CAD seam rails along bulkhead bevels
  const seamCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.205, 0.048, -0.03),
    new THREE.Vector3(-0.145, 0.18, -0.038),
    new THREE.Vector3(-0.105, 0.305, -0.048),
    new THREE.Vector3(0.085, 0.305, -0.048),
    new THREE.Vector3(0.195, 0.21, -0.038),
  ]);
  const seamTubeGeo = trackGeo(new THREE.TubeGeometry(seamCurve, 36, 0.0026, 8, false));
  const seamRail = new THREE.Mesh(seamTubeGeo, seamGlowMat);
  root.add(seamRail);
  registerPart(explodableParts, seamRail, new THREE.Vector3(0, 0.08, -0.08));

  const baseSeamGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.0035, 0.0035));
  const baseSeam = new THREE.Mesh(baseSeamGeo, seamGlowMat);
  baseSeam.position.set(0, 0.034, 0.146);
  root.add(baseSeam);
  registerPart(explodableParts, baseSeam, new THREE.Vector3(0, 0.01, 0.08));

  // 5. Sculpted PrimeTech 5-facet metallic P emblem + vertical divider bar
  const emblemGroup = new THREE.Group();
  emblemGroup.position.set(-0.045, 0.215, -0.04);
  const facetShapes = createPrimeTechFacetShapes(0.142);
  const emblemMeshes: THREE.Mesh[] = [];
  for (const s of facetShapes) {
    const fGeo = trackGeo(
      new THREE.ExtrudeGeometry(s, {
        depth: 0.018,
        bevelEnabled: true,
        bevelSegments: 2,
        bevelSize: 0.0022,
        bevelThickness: 0.0022,
      })
    );
    const m = new THREE.Mesh(fGeo, brushedSilverMat);
    emblemGroup.add(m);
    emblemMeshes.push(m);
  }
  const dividerGeo = trackGeo(new THREE.BoxGeometry(0.0032, 0.132, 0.006));
  const dividerBar = new THREE.Mesh(dividerGeo, seamGlowMat);
  dividerBar.position.set(0.082, 0.0, 0.006);
  emblemGroup.add(dividerBar);

  // Sculpted extruded 3D "P R I M E T E C H" stencil wordmark beside the divider
  const createStencilRect = (x: number, y: number, w: number, h: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(x, y);
    s.lineTo(x + w, y);
    s.lineTo(x + w, y + h);
    s.lineTo(x, y + h);
    s.closePath();
    return s;
  };
  const lettersGroup = new THREE.Group();
  lettersGroup.position.set(0.094, -0.011, 0.002);
  const lh = 0.022;
  const lw = 0.016;
  const st = 0.0038;
  const gap = 0.0205;
  const glyphs: Array<{ shapes: THREE.Shape[] }> = [
    // P
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(0, lh * 0.48, lw, st),
        createStencilRect(lw - st, lh * 0.48, st, lh * 0.52),
      ],
    },
    // R
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(0, lh * 0.48, lw, st),
        createStencilRect(lw - st, lh * 0.48, st, lh * 0.52),
        createStencilRect(lw - st * 1.15, 0, st, lh * 0.48),
      ],
    },
    // I
    {
      shapes: [createStencilRect(lw * 0.35, 0, st, lh)],
    },
    // M
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(lw - st, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(lw * 0.5 - st * 0.5, lh * 0.3, st, lh * 0.7),
      ],
    },
    // E
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(0, lh * 0.48, lw * 0.85, st),
        createStencilRect(0, 0, lw, st),
      ],
    },
    // T
    {
      shapes: [
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(lw * 0.5 - st * 0.5, 0, st, lh),
      ],
    },
    // E
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(0, lh * 0.48, lw * 0.85, st),
        createStencilRect(0, 0, lw, st),
      ],
    },
    // C
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(0, lh - st, lw, st),
        createStencilRect(0, 0, lw, st),
      ],
    },
    // H
    {
      shapes: [
        createStencilRect(0, 0, st, lh),
        createStencilRect(lw - st, 0, st, lh),
        createStencilRect(0, lh * 0.48, lw, st),
      ],
    },
  ];
  const wordmarkMeshes: THREE.Mesh[] = [];
  glyphs.forEach((g, idx) => {
    const gx = idx * gap;
    for (const s of g.shapes) {
      const gGeo = trackGeo(
        new THREE.ExtrudeGeometry(s, {
          depth: 0.008,
          bevelEnabled: true,
          bevelSegments: 1,
          bevelSize: 0.0008,
          bevelThickness: 0.0008,
        })
      );
      const gm = new THREE.Mesh(gGeo, brushedSilverMat);
      gm.position.x = gx;
      lettersGroup.add(gm);
      wordmarkMeshes.push(gm);
    }
  });
  emblemGroup.add(lettersGroup);

  root.add(emblemGroup);
  registerPart(explodableParts, emblemGroup, new THREE.Vector3(0, 0.14, 0.14));

  // 6. Undulating 3D wireframe terrain heightfield + luminous vertex points
  const terrainCols = 26;
  const terrainRows = 16;
  const terrainW = 0.41;
  const terrainD = 0.21;
  const terrainPlane = trackGeo(
    new THREE.PlaneGeometry(terrainW, terrainD, terrainCols - 1, terrainRows - 1)
  );
  terrainPlane.rotateX(-Math.PI / 2);

  const wireGeo = trackGeo(new THREE.WireframeGeometry(terrainPlane));
  const wireMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.72,
    })
  );
  const wireLines = new THREE.LineSegments(wireGeo, wireMat);

  const ptsGeo = trackGeo(terrainPlane.clone());
  const ptsMat = trackMat(
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.0065,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
    })
  );
  const terrainPts = new THREE.Points(ptsGeo, ptsMat);

  const terrainGroup = new THREE.Group();
  terrainGroup.position.set(0.015, 0.044, 0.042);
  terrainGroup.add(wireLines, terrainPts);
  root.add(terrainGroup);
  registerPart(explodableParts, terrainGroup, new THREE.Vector3(0.04, 0.09, 0.12));

  // Subtle metallic strut pins connecting terrain deck to base
  const pinGeo = trackGeo(new THREE.CylinderGeometry(0.005, 0.006, 0.024, 12));
  const pinPositions: Array<[number, number]> = [
    [-0.17, 0.11],
    [0.17, 0.11],
    [0.17, -0.02],
  ];
  for (const [px, pz] of pinPositions) {
    const pin = new THREE.Mesh(pinGeo, materials.secondaryMetal);
    pin.position.set(px, 0.036, pz);
    root.add(pin);
  }

  enableShadows(root, true, true);

  const updateTerrain = (elapsed: number, audio: AudioLevels) => {
    const ptsAttr = ptsGeo.attributes.position as THREE.BufferAttribute;
    const boost = 1 + audio.overall * 1.4;
    const heightAt = (x: number, z: number): number => {
      const ridge1 =
        Math.sin(x * 16.5 + elapsed * 1.15) * Math.cos(z * 19.0 - elapsed * 0.85) * 0.026;
      const ridge2 = Math.sin((x + z) * 24.0 - elapsed * 1.6) * 0.014;
      const rightPeak = Math.max(0, x + 0.06) * 0.18;
      return Math.max(0.002, (0.02 + ridge1 + ridge2 + rightPeak) * boost);
    };

    for (let i = 0; i < ptsAttr.count; i++) {
      const vx = ptsAttr.getX(i);
      const vz = ptsAttr.getZ(i);
      ptsAttr.setY(i, heightAt(vx, vz));
    }
    ptsAttr.needsUpdate = true;

    const wireAttr = wireGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < wireAttr.count; i++) {
      const vx = wireAttr.getX(i);
      const vz = wireAttr.getZ(i);
      wireAttr.setY(i, heightAt(vx, vz));
    }
    wireAttr.needsUpdate = true;
  };
  updateTerrain(0, { overall: 0, low: 0, mid: 0, high: 0, isPlaying: false });

  return {
    id: 'primetech-cadmesh',
    root,
    explodableParts,
    primaryMetalMeshes: [...emblemMeshes, ...wordmarkMeshes],
    accentMeshes: [datumBase, backBaffle, leftWing, rightHood],
    emissiveMeshes: [seamRail, baseSeam, dividerBar],
    updateAnimation: (elapsed, _delta, audio) => {
      updateTerrain(elapsed, audio);
      seamGlowMat.emissiveIntensity = 1.65 + audio.overall * 2.1;
      emblemGroup.position.y = 0.215 + Math.sin(elapsed * 1.25) * 0.005;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Scene 2 — PrimeTech Emblem Plinth
 * Satin ceramic-white rounded-square monolith tile with recessed obsidian PrimeTech P relief,
 * brushed stainless side bevel trim, perched on a multi-tiered dark titanium CAD plinth
 * with glowing ice-white chamfer seams and sweeping curved architectural back fins.
 */
function buildPrimeTechPlinth(materials: StudioMaterialLibrary): StudioSubjectInstance {
  const root = new THREE.Group();
  root.name = 'PrimeTechEmblemPlinth';
  const explodableParts: ExplodablePart[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const darkTitaniumMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x161a23,
      metalness: 0.82,
      roughness: 0.24,
      clearcoat: 0.35,
      clearcoatRoughness: 0.16,
    })
  );
  const ceramicWhiteMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f7fb,
      metalness: 0.08,
      roughness: 0.22,
      clearcoat: 0.72,
      clearcoatRoughness: 0.12,
    })
  );
  const brushedBezelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdbe4ef,
      metalness: 0.94,
      roughness: 0.16,
    })
  );
  const recessedObsidianMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b0e14,
      metalness: 0.55,
      roughness: 0.32,
    })
  );
  const rimLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xeaf6ff,
      emissive: 0xcbe9ff,
      emissiveIntensity: 1.9,
      roughness: 0.15,
      metalness: 0.1,
    })
  );

  // 1. Lower foreground offset plinth tier (y = 0 flush)
  const lowerShape = createRoundedRectShape(0.36, 0.26, 0.032);
  const lowerGeo = trackGeo(
    new THREE.ExtrudeGeometry(lowerShape, {
      depth: 0.042,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    })
  );
  lowerGeo.rotateX(-Math.PI / 2);
  lowerGeo.translate(0, 0.006, 0);
  const lowerTier = new THREE.Mesh(lowerGeo, darkTitaniumMat);
  lowerTier.position.set(-0.04, 0, 0.04);
  root.add(lowerTier);
  registerPart(explodableParts, lowerTier, new THREE.Vector3(-0.07, -0.06, 0.06));

  // 2. Upper hero pedestal tier on the right-rear
  const upperShape = createRoundedRectShape(0.27, 0.24, 0.032);
  const upperGeo = trackGeo(
    new THREE.ExtrudeGeometry(upperShape, {
      depth: 0.088,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.007,
      bevelThickness: 0.007,
    })
  );
  upperGeo.rotateX(-Math.PI / 2);
  upperGeo.translate(0, 0.007, 0);
  const upperTier = new THREE.Mesh(upperGeo, darkTitaniumMat);
  upperTier.position.set(0.055, 0.0, -0.015);
  root.add(upperTier);
  registerPart(explodableParts, upperTier, new THREE.Vector3(0.04, -0.02, -0.04));

  // 3. Illuminated hairline bevel seams wrapping both tiers
  const upperSeamGeo = trackGeo(new THREE.BoxGeometry(0.246, 0.004, 0.216));
  const upperSeam = new THREE.Mesh(upperSeamGeo, rimLightMat);
  upperSeam.position.set(0.055, 0.098, -0.015);
  root.add(upperSeam);
  registerPart(explodableParts, upperSeam, new THREE.Vector3(0.04, 0.02, -0.04));

  const lowerSeamGeo = trackGeo(new THREE.BoxGeometry(0.336, 0.0035, 0.236));
  const lowerSeam = new THREE.Mesh(lowerSeamGeo, rimLightMat);
  lowerSeam.position.set(-0.04, 0.052, 0.04);
  root.add(lowerSeam);
  registerPart(explodableParts, lowerSeam, new THREE.Vector3(-0.07, -0.03, 0.06));

  // 4. Sweeping curved metallic architectural fin behind the plinth
  const backFinCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 0.02, -0.12),
    new THREE.Vector3(-0.08, 0.22, -0.155),
    new THREE.Vector3(0.14, 0.34, -0.145),
    new THREE.Vector3(0.24, 0.18, -0.09),
  ]);
  const backFinGeo = trackGeo(new THREE.TubeGeometry(backFinCurve, 44, 0.012, 12, false));
  const backFin = new THREE.Mesh(backFinGeo, darkTitaniumMat);
  root.add(backFin);
  registerPart(explodableParts, backFin, new THREE.Vector3(0, 0.09, -0.14));

  const finLightCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.21, 0.05, -0.11),
    new THREE.Vector3(-0.06, 0.245, -0.142),
    new THREE.Vector3(0.14, 0.35, -0.132),
  ]);
  const finLightGeo = trackGeo(new THREE.TubeGeometry(finLightCurve, 36, 0.0024, 8, false));
  const finLight = new THREE.Mesh(finLightGeo, rimLightMat);
  root.add(finLight);
  registerPart(explodableParts, finLight, new THREE.Vector3(0, 0.11, -0.14));

  // 5. Iconic rounded-square ceramic-white monolith tile seated FLUSH on upper pedestal
  const monolithGroup = new THREE.Group();
  monolithGroup.position.set(0.055, 0.213, -0.015);
  monolithGroup.rotation.y = -0.28;

  const tileOuterShape = createRoundedRectShape(0.215, 0.215, 0.046);
  // Brushed stainless side housing
  const bezelGeo = trackGeo(
    new THREE.ExtrudeGeometry(tileOuterShape, {
      depth: 0.048,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    })
  );
  bezelGeo.translate(0, 0, -0.024);
  const bezelShell = new THREE.Mesh(bezelGeo, brushedBezelMat);
  monolithGroup.add(bezelShell);

  // Satin white ceramic front & rear sculpted plates with recessed 5-facet P holes
  const plateWithHoleShape = createRoundedRectShape(0.204, 0.204, 0.042);
  const holeFacets = createPrimeTechFacetShapes(0.115);
  for (const h of holeFacets) {
    plateWithHoleShape.holes.push(h);
  }
  const ceramicPlateGeo = trackGeo(
    new THREE.ExtrudeGeometry(plateWithHoleShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.0028,
      bevelThickness: 0.0028,
    })
  );
  const frontCeramic = new THREE.Mesh(ceramicPlateGeo, ceramicWhiteMat);
  frontCeramic.position.z = 0.019;
  const backCeramic = new THREE.Mesh(ceramicPlateGeo, ceramicWhiteMat);
  backCeramic.position.z = -0.033;
  monolithGroup.add(frontCeramic, backCeramic);

  // Obsidian interior recessed P backing core inside the cutout
  const coreGroup = new THREE.Group();
  for (const f of holeFacets) {
    const cGeo = trackGeo(
      new THREE.ExtrudeGeometry(f, {
        depth: 0.044,
        bevelEnabled: false,
      })
    );
    cGeo.translate(0, 0, -0.022);
    const cMesh = new THREE.Mesh(cGeo, recessedObsidianMat);
    coreGroup.add(cMesh);
  }
  monolithGroup.add(coreGroup);

  root.add(monolithGroup);
  registerPart(explodableParts, monolithGroup, new THREE.Vector3(0, 0.18, 0.04));

  enableShadows(root, true, true);

  return {
    id: 'primetech-plinth',
    root,
    explodableParts,
    primaryMetalMeshes: [bezelShell, frontCeramic, backCeramic],
    accentMeshes: [lowerTier, upperTier, backFin],
    emissiveMeshes: [upperSeam, lowerSeam, finLight],
    updateAnimation: (_elapsed, _delta, audio) => {
      rimLightMat.emissiveIntensity = 1.7 + audio.overall * 1.6;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
    },
  };
}

