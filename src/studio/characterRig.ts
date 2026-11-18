import * as THREE from 'three';
import type { AudioLevels, CharacterRigSpec } from '../types.ts';
import type { StudioMaterialLibrary } from './materials.ts';

export interface BuiltCharacterRig {
  spec: CharacterRigSpec;
  group: THREE.Group;
  update: (elapsed: number, dt: number, audio: AudioLevels) => void;
  dispose: () => void;
}

/**
 * Builds an articulated 9-to-12 part 3D cartoon character actor from a CharacterRigSpec.
 * Features bottom-center grounding at y = 0, varied PBR roughness/metalness across parts,
 * expressive eyes + mouth visor that lip-syncs to SamSpeak audio, pose keyframe interpolation,
 * and an optional floating holographic portrait badge when generated from a reference image.
 */
export function buildProceduralCharacterRig(
  spec: CharacterRigSpec,
  studioMaterials: StudioMaterialLibrary
): BuiltCharacterRig {
  const group = new THREE.Group();
  group.name = `CharacterActor_${spec.name.replace(/\s+/g, '_')}`;

  const geometries: THREE.BufferGeometry[] = [];
  const localMaterials: THREE.Material[] = [];
  const localTextures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    localMaterials.push(m);
    return m;
  };

  const isClay = spec.stylePreset === 'clay-stopmotion';
  const isVinyl = spec.stylePreset === 'vinyl-cyber';
  const isAnime = spec.stylePreset === 'cel-anime';

  const skinMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(spec.palette.skinHex || '#f6c7a8'),
      roughness: isClay ? 0.82 : isVinyl ? 0.22 : 0.48,
      metalness: isVinyl ? 0.15 : 0.04,
      clearcoat: isVinyl ? 0.85 : 0.18,
      clearcoatRoughness: 0.25,
    })
  );

  const primaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(spec.palette.primaryHex || '#2563eb'),
      roughness: isClay ? 0.78 : 0.34,
      metalness: spec.outfit === 'mech-armor' ? 0.78 : 0.22,
      clearcoat: isVinyl || spec.outfit === 'mech-armor' ? 0.7 : 0.1,
    })
  );

  const secondaryMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.palette.secondaryHex || '#f8fafc'),
      roughness: 0.62,
      metalness: 0.15,
    })
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.palette.accentHex || '#f59e0b'),
      emissive: new THREE.Color(spec.palette.accentHex || '#f59e0b'),
      emissiveIntensity: 0.45,
      roughness: 0.22,
      metalness: 0.65,
    })
  );

  const eyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.palette.eyeHex || '#0ea5e9'),
      emissive: new THREE.Color(spec.palette.eyeHex || '#0ea5e9'),
      emissiveIntensity: 0.9,
      roughness: 0.12,
      metalness: 0.1,
    })
  );

  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.palette.hairHex || '#4f46e5'),
      roughness: isAnime ? 0.38 : 0.55,
      metalness: 0.12,
    })
  );

  // 1. Contact shadow + stage plinth disk (flush at y = 0)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(0.62, 0.62));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.Mesh(shadowGeo, studioMaterials.contactShadow);
  shadowMesh.position.y = 0.005;
  group.add(shadowMesh);

  const plinthGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.27, 0.036, 32));
  const plinth = new THREE.Mesh(plinthGeo, studioMaterials.slatePlinth);
  plinth.position.y = 0.018;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  const plinthRimGeo = trackGeo(new THREE.TorusGeometry(0.245, 0.007, 10, 40));
  plinthRimGeo.rotateX(Math.PI / 2);
  const plinthRim = new THREE.Mesh(plinthRimGeo, accentMat);
  plinthRim.position.y = 0.036;
  group.add(plinthRim);

  // Actor root pivoted above plinth
  const actorRoot = new THREE.Group();
  actorRoot.position.y = 0.036;
  const baseScale = THREE.MathUtils.clamp(spec.scaleHeight || 1.0, 0.7, 1.45);
  actorRoot.scale.setScalar(baseScale);
  group.add(actorRoot);

  // 2 & 3. Left & Right Boots / Legs
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.075, 0.15, 0);
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.075, 0.15, 0);

  const bootGeo = trackGeo(new THREE.CapsuleGeometry(0.042, 0.055, 8, 16));
  bootGeo.rotateX(Math.PI / 2);
  const shinGeo = trackGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.14, 16));

  const leftBoot = new THREE.Mesh(bootGeo, secondaryMat);
  leftBoot.position.set(0, -0.11, 0.024);
  leftBoot.castShadow = true;
  const leftShin = new THREE.Mesh(shinGeo, primaryMat);
  leftShin.position.set(0, -0.03, 0);
  leftShin.castShadow = true;
  leftLegGroup.add(leftBoot, leftShin);

  const rightBoot = new THREE.Mesh(bootGeo, secondaryMat);
  rightBoot.position.set(0, -0.11, 0.024);
  rightBoot.castShadow = true;
  const rightShin = new THREE.Mesh(shinGeo, primaryMat);
  rightShin.position.set(0, -0.03, 0);
  rightShin.castShadow = true;
  rightLegGroup.add(rightBoot, rightShin);

  actorRoot.add(leftLegGroup, rightLegGroup);

  // 4. Sculpted Lathe Torso / Outfit Body
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.28, 0);

  const torsoPts =
    spec.outfit === 'robe'
      ? [
          new THREE.Vector2(0.0, -0.11),
          new THREE.Vector2(0.145, -0.11),
          new THREE.Vector2(0.12, 0.02),
          new THREE.Vector2(0.105, 0.13),
          new THREE.Vector2(0.055, 0.16),
          new THREE.Vector2(0.0, 0.16),
        ]
      : [
          new THREE.Vector2(0.0, -0.1),
          new THREE.Vector2(0.105, -0.1),
          new THREE.Vector2(0.125, -0.01),
          new THREE.Vector2(0.132, 0.09),
          new THREE.Vector2(0.095, 0.15),
          new THREE.Vector2(0.045, 0.165),
          new THREE.Vector2(0.0, 0.165),
        ];
  const torsoGeo = trackGeo(new THREE.LatheGeometry(torsoPts, 28));
  const torsoMesh = new THREE.Mesh(torsoGeo, primaryMat);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torsoGroup.add(torsoMesh);

  // Chest emblem / collar detail
  const collarGeo = trackGeo(new THREE.TorusGeometry(0.088, 0.016, 12, 32));
  collarGeo.rotateX(Math.PI / 2);
  const collarMesh = new THREE.Mesh(collarGeo, secondaryMat);
  collarMesh.position.y = 0.135;
  torsoGroup.add(collarMesh);

  const emblemGeo = trackGeo(new THREE.OctahedronGeometry(0.032, 0));
  const emblemMesh = new THREE.Mesh(emblemGeo, accentMat);
  emblemMesh.position.set(0, 0.05, 0.122);
  torsoGroup.add(emblemMesh);

  // 5. Optional Cape / Jacket / Mech Jetpack
  let capeMesh: THREE.Mesh | null = null;
  if (spec.outfit === 'cape' || spec.outfit === 'robe') {
    const capeShape = new THREE.Shape();
    capeShape.moveTo(-0.12, 0.13);
    capeShape.lineTo(0.12, 0.13);
    capeShape.lineTo(0.18, -0.16);
    capeShape.lineTo(-0.18, -0.16);
    capeShape.closePath();
    const capeGeo = trackGeo(
      new THREE.ExtrudeGeometry(capeShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.005,
        bevelSegments: 2,
      })
    );
    capeMesh = new THREE.Mesh(capeGeo, accentMat);
    capeMesh.position.set(0, 0.0, -0.11);
    capeMesh.rotation.x = 0.18;
    capeMesh.castShadow = true;
    torsoGroup.add(capeMesh);
  } else if (spec.outfit === 'mech-armor' || spec.outfit === 'explorer') {
    const packGeo = trackGeo(new THREE.BoxGeometry(0.15, 0.16, 0.075));
    const pack = new THREE.Mesh(packGeo, secondaryMat);
    pack.position.set(0, 0.04, -0.12);
    pack.castShadow = true;
    torsoGroup.add(pack);
  }

  // 6 & 7. Articulated Arms & Hands + Held Character Prop
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.145, 0.11, 0);
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.145, 0.11, 0);

  const armGeo = trackGeo(new THREE.CapsuleGeometry(0.028, 0.11, 8, 14));
  const handGeo = trackGeo(new THREE.SphereGeometry(0.036, 16, 14));

  const leftSleeve = new THREE.Mesh(armGeo, primaryMat);
  leftSleeve.position.y = -0.055;
  leftSleeve.castShadow = true;
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.y = -0.13;
  leftArmGroup.add(leftSleeve, leftHand);
  leftArmGroup.rotation.z = 0.25;

  const rightSleeve = new THREE.Mesh(armGeo, primaryMat);
  rightSleeve.position.y = -0.055;
  rightSleeve.castShadow = true;
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.y = -0.13;
  rightArmGroup.add(rightSleeve, rightHand);
  rightArmGroup.rotation.z = -0.32;

  // Held Prop on Right Hand
  const propGroup = new THREE.Group();
  propGroup.position.set(0, -0.14, 0.075);
  if (spec.propItem === 'cosmic-orb') {
    const orbCore = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.038, 1)),
      accentMat
    );
    const orbShell = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.062, 24, 18)),
      studioMaterials.glassDome
    );
    orbShell.renderOrder = 3;
    propGroup.add(orbCore, orbShell);
  } else if (spec.propItem === 'star-wand' || spec.propItem === 'microphone') {
    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.008, 0.01, 0.22, 12)),
      studioMaterials.secondaryMetal
    );
    shaft.position.y = 0.08;
    const tip = new THREE.Mesh(
      trackGeo(
        spec.propItem === 'star-wand'
          ? new THREE.OctahedronGeometry(0.045, 0)
          : new THREE.CapsuleGeometry(0.024, 0.03, 8, 14)
      ),
      accentMat
    );
    tip.position.y = 0.2;
    propGroup.add(shaft, tip);
  } else if (spec.propItem === 'lantern') {
    const lanternCage = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.038, 0.032, 0.09, 6)),
      accentMat
    );
    propGroup.add(lanternCage);
  } else if (spec.propItem === 'hoverboard') {
    const board = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.42, 0.022, 0.16)),
      accentMat
    );
    board.position.set(0, 0.012, 0);
    actorRoot.add(board);
  }
  rightArmGroup.add(propGroup);
  torsoGroup.add(leftArmGroup, rightArmGroup);

  // 8. Expressive Cartoon Head + Eyes + Lip-Sync Mouth + Headgear
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.295, 0);

  const headRadius = spec.headShape === 'chibi' ? 0.165 : spec.headShape === 'heroic' ? 0.135 : 0.148;
  const headGeo =
    spec.headShape === 'robotic'
      ? trackGeo(new THREE.BoxGeometry(headRadius * 1.75, headRadius * 1.45, headRadius * 1.55))
      : trackGeo(new THREE.SphereGeometry(headRadius, 32, 24));
  if (spec.headShape !== 'robotic') {
    headGeo.scale(1.06, 0.96, 1.0);
  }
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // Expressive Eyes with specular catchlights
  const eyeZ = spec.headShape === 'robotic' ? headRadius * 0.79 : headRadius * 0.92;
  const eyeX = headRadius * 0.42;
  const eyeGeo = trackGeo(new THREE.SphereGeometry(0.026, 18, 14));
  eyeGeo.scale(0.9, 1.2, 0.45);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-eyeX, 0.015, eyeZ);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(eyeX, 0.015, eyeZ);

  const pupilGeo = trackGeo(new THREE.SphereGeometry(0.009, 10, 10));
  const pupilMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const leftCatch = new THREE.Mesh(pupilGeo, pupilMat);
  leftCatch.position.set(-eyeX + 0.007, 0.025, eyeZ + 0.01);
  const rightCatch = new THREE.Mesh(pupilGeo, pupilMat);
  rightCatch.position.set(eyeX + 0.007, 0.025, eyeZ + 0.01);

  // Audio-reactive Mouth / Smile Visor
  const mouthGeo = trackGeo(new THREE.CapsuleGeometry(0.012, 0.036, 8, 12));
  mouthGeo.rotateZ(Math.PI / 2);
  const mouthMesh = new THREE.Mesh(mouthGeo, accentMat);
  mouthMesh.position.set(0, -0.042, eyeZ * 0.96);

  headGroup.add(leftEye, rightEye, leftCatch, rightCatch, mouthMesh);

  // Hair / Sculpted Crest
  const hairCapGeo = trackGeo(
    new THREE.SphereGeometry(headRadius * 1.04, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55)
  );
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.rotation.x = -0.22;
  hairCap.position.y = 0.01;
  headGroup.add(hairCap);

  // 9. Headgear (Cat Ears, Crown, Wizard Hat, Astronaut Helmet, Antennae, Horns)
  if (spec.headgear === 'cat-ears' || spec.headgear === 'horns') {
    const earGeo = trackGeo(new THREE.ConeGeometry(0.048, 0.11, 12));
    const earL = new THREE.Mesh(earGeo, spec.headgear === 'horns' ? accentMat : hairMat);
    earL.position.set(-headRadius * 0.65, headRadius * 0.85, 0);
    earL.rotation.z = 0.35;
    const earR = new THREE.Mesh(earGeo, spec.headgear === 'horns' ? accentMat : hairMat);
    earR.position.set(headRadius * 0.65, headRadius * 0.85, 0);
    earR.rotation.z = -0.35;
    headGroup.add(earL, earR);
  } else if (spec.headgear === 'crown') {
    const crownRing = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.085, 0.072, 0.055, 7)),
      studioMaterials.heroMetal
    );
    crownRing.position.y = headRadius * 0.95;
    headGroup.add(crownRing);
  } else if (spec.headgear === 'wizard-hat') {
    const brim = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.014, 28)),
      primaryMat
    );
    brim.position.y = headRadius * 0.78;
    const cone = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.13, 0.28, 24)),
      primaryMat
    );
    cone.position.y = headRadius * 0.78 + 0.14;
    cone.rotation.z = -0.15;
    headGroup.add(brim, cone);
  } else if (spec.headgear === 'astronaut-helmet') {
    const helmetGeo = trackGeo(new THREE.SphereGeometry(headRadius * 1.24, 32, 24));
    const helmet = new THREE.Mesh(helmetGeo, studioMaterials.glassDome);
    helmet.renderOrder = 4;
    const collarRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(headRadius * 0.95, 0.018, 12, 36)),
      studioMaterials.secondaryMetal
    );
    collarRing.rotation.x = Math.PI / 2;
    collarRing.position.y = -headRadius * 0.72;
    headGroup.add(helmet, collarRing);
  } else if (spec.headgear === 'antennae' || spec.headgear === 'crest') {
    const antGeo = trackGeo(new THREE.CylinderGeometry(0.006, 0.008, 0.12, 10));
    const tipGeo = trackGeo(new THREE.SphereGeometry(0.022, 14, 12));
    for (const side of [-1, 1]) {
      const ant = new THREE.Mesh(antGeo, studioMaterials.secondaryMetal);
      ant.position.set(side * 0.075, headRadius * 0.95, 0);
      ant.rotation.z = -side * 0.28;
      const tip = new THREE.Mesh(tipGeo, accentMat);
      tip.position.set(side * 0.095, headRadius * 0.95 + 0.06, 0);
      headGroup.add(ant, tip);
    }
  }

  torsoGroup.add(headGroup);
  actorRoot.add(torsoGroup);

  // 10. Optional Floating Cinematic Portrait Card beside the 3D character if portraitDataUrl is present
  let portraitBadge: THREE.Group | null = null;
  if (spec.portraitDataUrl) {
    portraitBadge = new THREE.Group();
    portraitBadge.position.set(-0.34, 0.48, -0.08);
    portraitBadge.rotation.y = 0.28;

    const frameGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.34, 0.016));
    const frameMesh = new THREE.Mesh(frameGeo, studioMaterials.heroMetal);
    portraitBadge.add(frameMesh);

    const imgEl = new Image();
    imgEl.src = spec.portraitDataUrl;
    const tex = new THREE.Texture(imgEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    imgEl.onload = () => {
      tex.needsUpdate = true;
    };
    if (imgEl.complete) tex.needsUpdate = true;
    localTextures.push(tex);

    const artMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.25,
        metalness: 0.05,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.28,
      })
    );
    const artGeo = trackGeo(new THREE.PlaneGeometry(0.25, 0.31));
    const artMesh = new THREE.Mesh(artGeo, artMat);
    artMesh.position.z = 0.01;
    portraitBadge.add(artMesh);
    actorRoot.add(portraitBadge);
  }

  const poses = spec.poseKeyframes && spec.poseKeyframes.length > 0 ? spec.poseKeyframes : null;

  const update = (elapsed: number, _dt: number, audio: AudioLevels) => {
    const style = spec.animationStyle;
    const speed = style === 'dance-groove' ? 3.8 : style === 'bouncy-cartoon' ? 2.8 : 1.7;

    // Sample pose keyframe schedule if extracted from video keyframes
    let poseHeadTiltRad = 0;
    let poseArmRaise = 0;
    let poseBounceScale = 1;
    let posePropSpin = 1;
    if (poses && poses.length > 0) {
      const cycleDur = Math.max(4, poses[poses.length - 1].timestampSec + 1.5);
      const tLoop = elapsed % cycleDur;
      let activePose = poses[0];
      let nextPose = poses[(0 + 1) % poses.length];
      for (let i = 0; i < poses.length; i++) {
        if (tLoop >= poses[i].timestampSec) {
          activePose = poses[i];
          nextPose = poses[(i + 1) % poses.length];
        }
      }
      const span = Math.max(0.5, nextPose.timestampSec - activePose.timestampSec || 1.5);
      const alpha = THREE.MathUtils.clamp((tLoop - activePose.timestampSec) / span, 0, 1);
      const smoothAlpha = alpha * alpha * (3 - 2 * alpha);
      poseHeadTiltRad =
        THREE.MathUtils.lerp(activePose.headTiltDeg, nextPose.headTiltDeg, smoothAlpha) *
        (Math.PI / 180);
      poseArmRaise = THREE.MathUtils.lerp(activePose.armRaise, nextPose.armRaise, smoothAlpha);
      poseBounceScale = THREE.MathUtils.lerp(
        activePose.bounceAmplitude,
        nextPose.bounceAmplitude,
        smoothAlpha
      );
      posePropSpin = THREE.MathUtils.lerp(
        activePose.propSpinSpeed,
        nextPose.propSpinSpeed,
        smoothAlpha
      );
    }

    const bounce =
      style === 'floating-cosmic'
        ? 0.05 + Math.sin(elapsed * 1.8) * 0.045
        : Math.abs(Math.sin(elapsed * speed)) * (0.032 * poseBounceScale + audio.low * 0.045);

    torsoGroup.position.y = 0.28 + bounce;
    torsoGroup.rotation.y = Math.sin(elapsed * 1.1) * 0.16;

    // Squash & stretch on cartoon bounce
    const stretch = 1 + Math.sin(elapsed * speed * 2) * 0.035 + audio.mid * 0.05;
    torsoGroup.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));

    // Head nod & SamSpeak lip-sync
    headGroup.rotation.y = Math.sin(elapsed * 1.4) * 0.22;
    headGroup.rotation.z = Math.cos(elapsed * 1.1) * 0.08 + poseHeadTiltRad;
    headGroup.rotation.x = -audio.mid * 0.18 + Math.sin(elapsed * 2.1) * 0.05;

    const mouthOpen = 1 + audio.overall * 3.2 + (audio.isPlaying ? Math.abs(Math.sin(elapsed * 14)) * 0.8 : 0);
    mouthMesh.scale.set(1 + audio.mid * 0.4, mouthOpen, 1);

    // Arm swing & wave
    const wave =
      style === 'talk-gesture' || audio.isPlaying
        ? Math.sin(elapsed * 5.2) * 0.38
        : Math.sin(elapsed * speed) * 0.22;
    leftArmGroup.rotation.x = wave - poseArmRaise * 0.45;
    rightArmGroup.rotation.x = -wave * 1.15 - 0.35 - poseArmRaise * 0.65;

    // Leg alternating step
    leftLegGroup.rotation.x = -Math.sin(elapsed * speed) * 0.18;
    rightLegGroup.rotation.x = Math.sin(elapsed * speed) * 0.18;

    if (capeMesh) {
      capeMesh.rotation.x = 0.22 + Math.sin(elapsed * 3.2) * 0.1 + audio.low * 0.2;
    }

    propGroup.rotation.y = elapsed * 1.6 * posePropSpin;

    if (portraitBadge) {
      portraitBadge.position.y = 0.48 + Math.sin(elapsed * 2.0) * 0.025;
    }
  };

  return {
    spec,
    group,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      localMaterials.forEach((m) => m.dispose());
      localTextures.forEach((t) => t.dispose());
    },
  };
}
