import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { EnvironmentLevelId } from '../types.ts';
import type { StudioMaterialLibrary } from './materials.ts';
import type { StudioTextureSet } from './textures.ts';
import { u } from '../base';

const _dummy = new THREE.Object3D();

export type HeroAssetPreviewMode =
  | 'full-hero'
  | 'p-icon'
  | 'wordmark'
  | 'plinth-tile'
  | 'chamber';

export interface BuiltEnvironmentLevel {
  id: EnvironmentLevelId;
  group: THREE.Group;
  update: (elapsed: number, dt: number) => void;
  dispose: () => void;
}

export class EnvironmentLevelManager {
  private materials: StudioMaterialLibrary;
  private textures: StudioTextureSet;
  private parentGroup: THREE.Group;
  private levels = new Map<EnvironmentLevelId, BuiltEnvironmentLevel>();
  private activeId: EnvironmentLevelId = 'studio-stage';
  private hoverX = 0;
  private hoverY = 0;
  private scrollNorm = 0;
  private heroPresentationActive = true;
  private heroAssetMode: HeroAssetPreviewMode = 'full-hero';
  private syncVaultHeroCallback: (() => void) | null = null;
  private gltfLoader = new GLTFLoader();
  private levelReadyMap = new Map<EnvironmentLevelId, boolean>();
  private onLevelReadyCallbacks: Array<(id: EnvironmentLevelId) => void> = [];

  constructor(
    parentGroup: THREE.Group,
    materials: StudioMaterialLibrary,
    textures: StudioTextureSet
  ) {
    this.parentGroup = parentGroup;
    this.materials = materials;
    this.textures = textures;
  }

  public init(): void {
    this.setLevel('studio-stage');
  }

  public getActiveLevelId(): EnvironmentLevelId {
    return this.activeId;
  }

  public onAssetsReady(cb: (id: EnvironmentLevelId) => void): () => void {
    this.onLevelReadyCallbacks.push(cb);
    return () => {
      this.onLevelReadyCallbacks = this.onLevelReadyCallbacks.filter((fn) => fn !== cb);
    };
  }

  public isLevelReady(id: EnvironmentLevelId): boolean {
    const resolved = id === 'primetech-vault' ? 'primetech-arch-identity' : id;
    return this.levelReadyMap.get(resolved) ?? false;
  }

  public preloadLevel(id: EnvironmentLevelId): void {
    const resolved = id === 'primetech-vault' ? 'primetech-arch-identity' : id;
    if (!this.levels.has(resolved)) {
      const built = this.buildLevel(resolved);
      built.group.visible = this.activeId === resolved;
      this.parentGroup.add(built.group);
      this.levels.set(resolved, built);
    }
  }

  public setHeroPresentation(active: boolean, mode?: HeroAssetPreviewMode): void {
    this.heroPresentationActive = active;
    if (mode) {
      this.heroAssetMode = mode;
    }
    this.syncVaultHeroCallback?.();
  }

  public setHeroAssetMode(mode: HeroAssetPreviewMode): void {
    this.heroAssetMode = mode;
    this.syncVaultHeroCallback?.();
  }

  public getHeroAssetMode(): HeroAssetPreviewMode {
    return this.heroAssetMode;
  }

  public setInteractionSignals(nx: number, ny: number, scrollNorm: number): void {
    this.hoverX = THREE.MathUtils.clamp(nx, -1, 1);
    this.hoverY = THREE.MathUtils.clamp(ny, -1, 1);
    this.scrollNorm = THREE.MathUtils.clamp(scrollNorm, 0, 1);
  }

  public setLevel(id: EnvironmentLevelId): void {
    const resolved: EnvironmentLevelId =
      id === 'primetech-vault' ? 'primetech-arch-identity' : id;
    this.activeId = resolved;
    if (!this.levels.has(resolved)) {
      const built = this.buildLevel(resolved);
      built.group.visible = false;
      this.parentGroup.add(built.group);
      this.levels.set(resolved, built);
    }
    for (const [lvlId, built] of this.levels.entries()) {
      built.group.visible = lvlId === resolved;
    }
    this.syncVaultHeroCallback?.();
  }

  public update(elapsed: number, dt: number): void {
    const active = this.levels.get(this.activeId);
    active?.update(elapsed, dt);
  }

  private notifyLevelReady(id: EnvironmentLevelId): void {
    this.levelReadyMap.set(id, true);
    for (const cb of this.onLevelReadyCallbacks) {
      cb(id);
    }
  }

  private buildLevel(id: EnvironmentLevelId): BuiltEnvironmentLevel {
    const group = new THREE.Group();
    group.name = `EnvLevel_${id}`;
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

    let update = (_elapsed: number, _dt: number) => {};

    if (id === 'studio-stage') {
      // Classic illuminated circular cyclorama soundstage + architectural perimeter light pylons
      const outerSkirtGeo = trackGeo(new THREE.RingGeometry(4.55, 8.2, 64));
      outerSkirtGeo.rotateX(-Math.PI / 2);
      const skirtMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0d1017,
          roughness: 0.92,
          metalness: 0.08,
        })
      );
      const outerSkirt = new THREE.Mesh(outerSkirtGeo, skirtMat);
      outerSkirt.position.y = -0.004;
      outerSkirt.receiveShadow = true;
      group.add(outerSkirt);

      const pylonCount = 8;
      const pylonGeo = trackGeo(new THREE.BoxGeometry(0.1, 2.2, 0.14));
      const stripGeo = trackGeo(new THREE.BoxGeometry(0.03, 1.85, 0.02));
      for (let i = 0; i < pylonCount; i++) {
        const angle = (i / pylonCount) * Math.PI * 2 + Math.PI / 8;
        const dist = 4.35;
        const pylon = new THREE.Mesh(pylonGeo, this.materials.slatePlinth);
        pylon.position.set(Math.cos(angle) * dist, 1.1, Math.sin(angle) * dist);
        pylon.rotation.y = -angle + Math.PI / 2;
        pylon.castShadow = true;
        group.add(pylon);

        const strip = new THREE.Mesh(stripGeo, this.materials.emissiveAccent);
        strip.position.set(0, 0, -0.08);
        pylon.add(strip);
      }

      const gantryGeo = trackGeo(new THREE.TorusGeometry(4.35, 0.035, 12, 72));
      gantryGeo.rotateX(Math.PI / 2);
      const gantry = new THREE.Mesh(gantryGeo, this.materials.secondaryMetal);
      gantry.position.y = 2.22;
      group.add(gantry);
    } else if (id === 'architectural-atrium') {
      // Travertine colonnade gallery with reflecting water trench & skylight louvers
      const terraceGeo = trackGeo(new THREE.RingGeometry(1.45, 7.6, 64));
      terraceGeo.rotateX(-Math.PI / 2);
      const terrace = new THREE.Mesh(terraceGeo, this.materials.travertine);
      terrace.position.y = 0.002;
      terrace.receiveShadow = true;
      group.add(terrace);

      const basinGeo = trackGeo(new THREE.RingGeometry(1.24, 1.48, 64));
      basinGeo.rotateX(-Math.PI / 2);
      const basin = new THREE.Mesh(basinGeo, this.materials.oceanWater);
      basin.position.y = 0.006;
      basin.receiveShadow = true;
      group.add(basin);

      const basinRimGeo = trackGeo(new THREE.TorusGeometry(1.48, 0.028, 12, 64));
      basinRimGeo.rotateX(Math.PI / 2);
      const basinRim = new THREE.Mesh(basinRimGeo, this.materials.heroMetal);
      basinRim.position.y = 0.015;
      group.add(basinRim);

      const colRadius = 4.65;
      const colCount = 10;
      const colBaseGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.14, 0.46));
      const colShaftGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.19, 3.2, 20));
      const colCapGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.12, 0.42));
      const ringPlinthGeo = trackGeo(new THREE.TorusGeometry(colRadius, 0.12, 8, 64));
      ringPlinthGeo.rotateX(Math.PI / 2);
      const ringBeam = new THREE.Mesh(ringPlinthGeo, this.materials.travertine);
      ringBeam.position.y = 3.4;
      group.add(ringBeam);

      for (let i = 0; i < colCount; i++) {
        const a = (i / colCount) * Math.PI * 2;
        const px = Math.cos(a) * colRadius;
        const pz = Math.sin(a) * colRadius;
        const colGroup = new THREE.Group();
        colGroup.position.set(px, 0, pz);
        colGroup.rotation.y = -a;

        const base = new THREE.Mesh(colBaseGeo, this.materials.slatePlinth);
        base.position.y = 0.07;
        base.castShadow = true;
        base.receiveShadow = true;

        const shaft = new THREE.Mesh(colShaftGeo, this.materials.travertine);
        shaft.position.y = 1.74;
        shaft.castShadow = true;
        shaft.receiveShadow = true;

        const cap = new THREE.Mesh(colCapGeo, this.materials.travertine);
        cap.position.y = 3.36;

        const uplightGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.03, 0.04));
        const uplight = new THREE.Mesh(uplightGeo, this.materials.warmBeacon);
        uplight.position.set(0, 0.16, -0.22);

        colGroup.add(base, shaft, cap, uplight);
        group.add(colGroup);
      }

      const ribGeo = trackGeo(new THREE.BoxGeometry(9.4, 0.08, 0.14));
      for (let r = -3; r <= 3; r++) {
        const rib = new THREE.Mesh(ribGeo, this.materials.walnutWood);
        rib.position.set(0, 3.65, r * 0.95);
        group.add(rib);
      }

      update = (elapsed) => {
        this.textures.waterRippleBump.offset.x = Math.sin(elapsed * 0.18) * 0.05;
        this.textures.waterRippleBump.offset.y = elapsed * 0.015;
      };
    } else if (id === 'twilight-forest') {
      const terrainGeo = trackGeo(new THREE.CircleGeometry(10.5, 64));
      terrainGeo.rotateX(-Math.PI / 2);
      const terrain = new THREE.Mesh(terrainGeo, this.materials.moss);
      terrain.position.y = -0.008;
      terrain.receiveShadow = true;
      group.add(terrain);

      const slabGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.32, 0.035, 7));
      for (let i = 0; i < 6; i++) {
        const slab = new THREE.Mesh(slabGeo, this.materials.basaltCliff);
        slab.position.set(Math.sin(i * 0.9) * 0.28, 0.014, 1.35 + i * 0.68);
        slab.rotation.y = i * 0.7;
        slab.scale.set(1.1, 1, 0.85);
        slab.receiveShadow = true;
        group.add(slab);
      }

      const treeCount = 28;
      const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.09, 1.15, 8));
      const coneLowerGeo = trackGeo(new THREE.ConeGeometry(0.62, 1.55, 10));
      const coneUpperGeo = trackGeo(new THREE.ConeGeometry(0.42, 1.25, 10));

      const trunks = new THREE.InstancedMesh(trunkGeo, this.materials.walnutWood, treeCount);
      const conesL = new THREE.InstancedMesh(coneLowerGeo, this.materials.foliage, treeCount);
      const conesU = new THREE.InstancedMesh(coneUpperGeo, this.materials.foliage, treeCount);
      trunks.castShadow = true;
      conesL.castShadow = true;
      conesL.receiveShadow = true;
      conesU.castShadow = true;

      for (let i = 0; i < treeCount; i++) {
        const ring = i < 14 ? 0 : 1;
        const baseAngle = ((i % 14) / 14) * Math.PI * 2 + ring * 0.22;
        const angle = baseAngle;
        const radius = ring === 0 ? 4.4 + ((i * 37) % 10) * 0.14 : 6.8 + ((i * 53) % 10) * 0.18;
        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;
        const s = 0.85 + ((i * 19) % 10) * 0.07;

        _dummy.position.set(px, 0.55 * s, pz);
        _dummy.rotation.set(0, angle, 0);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        trunks.setMatrixAt(i, _dummy.matrix);

        _dummy.position.set(px, 1.45 * s, pz);
        _dummy.updateMatrix();
        conesL.setMatrixAt(i, _dummy.matrix);

        _dummy.position.set(px, 2.35 * s, pz);
        _dummy.updateMatrix();
        conesU.setMatrixAt(i, _dummy.matrix);
      }
      trunks.instanceMatrix.needsUpdate = true;
      conesL.instanceMatrix.needsUpdate = true;
      conesU.instanceMatrix.needsUpdate = true;
      group.add(trunks, conesL, conesU);

      const moteCount = 36;
      const moteGeo = trackGeo(new THREE.SphereGeometry(0.022, 8, 8));
      const motes = new THREE.InstancedMesh(moteGeo, this.materials.warmBeacon, moteCount);
      motes.frustumCulled = false;
      const moteSeeds = new Float32Array(moteCount * 3);
      for (let i = 0; i < moteCount; i++) {
        const a = (i / moteCount) * Math.PI * 2;
        const r = 1.8 + (i % 5) * 0.85;
        moteSeeds[i * 3] = Math.cos(a) * r;
        moteSeeds[i * 3 + 1] = 0.45 + (i % 6) * 0.35;
        moteSeeds[i * 3 + 2] = Math.sin(a) * r;
      }
      group.add(motes);

      update = (elapsed) => {
        for (let i = 0; i < moteCount; i++) {
          const bx = moteSeeds[i * 3];
          const by = moteSeeds[i * 3 + 1];
          const bz = moteSeeds[i * 3 + 2];
          _dummy.position.set(
            bx + Math.sin(elapsed * 0.8 + i) * 0.25,
            by + Math.sin(elapsed * 1.3 + i * 1.7) * 0.22,
            bz + Math.cos(elapsed * 0.7 + i * 0.9) * 0.25
          );
          const pulse = 0.65 + 0.35 * Math.sin(elapsed * 2.8 + i * 1.1);
          _dummy.scale.setScalar(pulse);
          _dummy.updateMatrix();
          motes.setMatrixAt(i, _dummy.matrix);
        }
        motes.instanceMatrix.needsUpdate = true;
      };
    } else if (id === 'coastal-observatory') {
      const deckGeo = trackGeo(new THREE.CylinderGeometry(4.45, 4.15, 0.36, 48));
      const deck = new THREE.Mesh(deckGeo, this.materials.basaltCliff);
      deck.position.y = -0.185;
      deck.receiveShadow = true;
      group.add(deck);

      const seaGeo = trackGeo(new THREE.CircleGeometry(28, 64));
      seaGeo.rotateX(-Math.PI / 2);
      const sea = new THREE.Mesh(seaGeo, this.materials.oceanWater);
      sea.position.y = -0.85;
      sea.receiveShadow = true;
      group.add(sea);

      const postGeo = trackGeo(new THREE.CylinderGeometry(0.02, 0.024, 0.85, 10));
      const railGeo = trackGeo(
        new THREE.TorusGeometry(4.36, 0.025, 10, 64, Math.PI * 1.55)
      );
      railGeo.rotateX(Math.PI / 2);
      const rail = new THREE.Mesh(railGeo, this.materials.secondaryMetal);
      rail.position.y = 0.85;
      rail.rotation.z = Math.PI * 0.725;
      group.add(rail);

      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 0.725 + (i / 12) * Math.PI * 1.55;
        const post = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
        post.position.set(Math.cos(a) * 4.36, 0.425, Math.sin(a) * 4.36);
        post.castShadow = true;
        group.add(post);
      }

      const towerBaseGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.85, 2.8, 12));
      const tower = new THREE.Mesh(towerBaseGeo, this.materials.basaltCliff);
      tower.position.set(-5.2, 0.5, -8.5);
      group.add(tower);

      const beaconHead = new THREE.Group();
      beaconHead.position.set(-5.2, 2.05, -8.5);
      const lensGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.22, 0.45));
      const lens = new THREE.Mesh(lensGeo, this.materials.warmBeacon);
      beaconHead.add(lens);
      group.add(beaconHead);

      update = (elapsed, dt) => {
        this.textures.waterRippleBump.offset.x = elapsed * 0.022;
        this.textures.waterRippleBump.offset.y = Math.sin(elapsed * 0.3) * 0.04;
        beaconHead.rotation.y += dt * 0.9;
      };
    } else if (id === 'primetech-arch-identity') {
      // SCENE ONE: PrimeTech Architectural Identity (matches Reference 1 strictly)
      const floorGeo = trackGeo(new THREE.PlaneGeometry(24, 18));
      floorGeo.rotateX(-Math.PI / 2);
      const obsidianFloorMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x050608,
          metalness: 0.65,
          roughness: 0.42,
        })
      );
      const obsidianMountainMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x07090d,
          metalness: 0.68,
          roughness: 0.38,
          flatShading: true,
        })
      );
      const floor = new THREE.Mesh(floorGeo, obsidianFloorMat);
      floor.position.set(0, -0.04, -1.8);
      floor.receiveShadow = true;
      group.add(floor);

      // Strictly neutral cool-silver/white architectural lights (zero purple tint)
      const backWallHalo = new THREE.PointLight(0xfafcff, 5.2, 8.5, 1.8);
      backWallHalo.position.set(-0.2, 1.9, -2.55);
      group.add(backWallHalo);

      const kneeHotspot = new THREE.PointLight(0xffffff, 7.5, 5.2, 1.8);
      kneeHotspot.position.set(2.45, 2.75, -1.35);
      group.add(kneeHotspot);

      const lockupKeyLight = new THREE.DirectionalLight(0xffffff, 2.35);
      lockupKeyLight.position.set(-1.8, 3.6, 2.2);
      lockupKeyLight.castShadow = true;
      lockupKeyLight.shadow.mapSize.set(1024, 1024);
      lockupKeyLight.shadow.bias = -0.0006;
      group.add(lockupKeyLight);

      const mountainRimLight = new THREE.DirectionalLight(0xeef2f7, 1.15);
      mountainRimLight.position.set(2.6, 2.8, -1.2);
      group.add(mountainRimLight);

      const chamberGroup = new THREE.Group();
      const lockupGroup = new THREE.Group();
      const pIconAnchor = new THREE.Group();
      const wordmarkAnchor = new THREE.Group();
      lockupGroup.add(pIconAnchor, wordmarkAnchor);
      group.add(chamberGroup, lockupGroup);

      const glbDisposables: Array<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[] }> = [];
      let loadedCount = 0;
      const onPartLoaded = () => {
        loadedCount++;
        if (loadedCount >= 3) {
          this.notifyLevelReady('primetech-arch-identity');
        }
      };

      const styleLoadedArchGlb = (root: THREE.Object3D): void => {
        const geos: THREE.BufferGeometry[] = [];
        const mats: THREE.Material[] = [];
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.geometry) geos.push(mesh.geometry);
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && 'isMaterial' in m) {
            m.envMapIntensity = 1.2;
            if (m.name === 'PrimeTech_WhiteSeam') {
              m.emissive.setHex(0xf8fbff);
              m.emissiveIntensity = 1.85;
            }
            mats.push(m);
          }
        });
        glbDisposables.push({ geometries: geos, materials: mats });
      };

      this.gltfLoader.load(
        u('/models/primetech-hero-chamber.glb'),
        (gltf) => {
          styleLoadedArchGlb(gltf.scene);
          chamberGroup.add(gltf.scene);
          onPartLoaded();
        },
        undefined,
        () => onPartLoaded()
      );
      this.gltfLoader.load(
        u('/models/primetech-p-icon.glb'),
        (gltf) => {
          styleLoadedArchGlb(gltf.scene);
          pIconAnchor.add(gltf.scene);
          onPartLoaded();
        },
        undefined,
        () => onPartLoaded()
      );
      this.gltfLoader.load(
        u('/models/primetech-wordmark.glb'),
        (gltf) => {
          styleLoadedArchGlb(gltf.scene);
          wordmarkAnchor.add(gltf.scene);
          onPartLoaded();
        },
        undefined,
        () => onPartLoaded()
      );

      // Sweeping dark obsidian faceted wireframe mountain terrain (weighted toward right foreground)
      const tCols = 48;
      const tRows = 26;
      const terrainPlane = trackGeo(
        new THREE.PlaneGeometry(11.6, 6.2, tCols - 1, tRows - 1)
      );
      terrainPlane.rotateX(-Math.PI / 2);

      const terrainSolidGeo = trackGeo(terrainPlane.clone());
      const terrainSolid = new THREE.Mesh(terrainSolidGeo, obsidianMountainMat);
      terrainSolid.position.y = 0;
      terrainSolid.receiveShadow = true;

      const terrainWireGeo = trackGeo(new THREE.WireframeGeometry(terrainPlane));
      const terrainWire = new THREE.LineSegments(
        terrainWireGeo,
        trackMat(
          new THREE.LineBasicMaterial({
            color: 0xd8e0ea,
            transparent: true,
            opacity: 0.36,
          })
        )
      );
      terrainWire.position.y = 0.004;

      const terrainPtsGeo = trackGeo(terrainPlane.clone());
      const terrainPts = new THREE.Points(
        terrainPtsGeo,
        trackMat(
          new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.028,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.82,
          })
        )
      );
      terrainPts.position.y = 0.008;

      const terrainWrapper = new THREE.Group();
      terrainWrapper.position.set(1.15, -0.04, -0.45);
      terrainWrapper.add(terrainSolid, terrainWire, terrainPts);
      group.add(terrainWrapper);

      const syncArchHeroPresentation = () => {
        if (this.activeId !== 'primetech-arch-identity') return;
        const mode = this.heroAssetMode;
        const isHero = this.heroPresentationActive;

        chamberGroup.visible = !isHero || mode === 'full-hero' || mode === 'chamber';
        terrainWrapper.visible = !isHero || mode === 'full-hero' || mode === 'chamber';
        lockupGroup.visible =
          !isHero || mode === 'full-hero' || mode === 'p-icon' || mode === 'wordmark';

        if (!isHero) {
          // Studio edit view: set lockup up cleanly in chamber aperture behind turntable
          lockupGroup.position.set(-0.04, 2.24, -2.55);
          lockupGroup.scale.setScalar(0.84);
          pIconAnchor.visible = true;
          pIconAnchor.position.set(-1.35, 0, 0);
          pIconAnchor.scale.setScalar(0.78);
          wordmarkAnchor.visible = true;
          wordmarkAnchor.position.set(0.55, 0, 0);
          wordmarkAnchor.scale.setScalar(1.0);
          return;
        }

        if (mode === 'p-icon') {
          pIconAnchor.visible = true;
          pIconAnchor.position.set(0, 0, 0);
          pIconAnchor.scale.setScalar(1.45);
          wordmarkAnchor.visible = false;
          lockupGroup.position.set(0, 1.54, -1.45);
          lockupGroup.scale.setScalar(1.0);
        } else if (mode === 'wordmark') {
          pIconAnchor.visible = false;
          wordmarkAnchor.visible = true;
          wordmarkAnchor.position.set(-0.12, 0, 0);
          wordmarkAnchor.scale.setScalar(1.1);
          lockupGroup.position.set(0, 1.54, -1.45);
          lockupGroup.scale.setScalar(1.0);
        } else {
          // Reference 1 centered horizontal lockup inside stepped obsidian bulkhead aperture
          pIconAnchor.visible = mode === 'full-hero';
          pIconAnchor.position.set(-1.35, 0, 0);
          pIconAnchor.scale.setScalar(0.78);
          wordmarkAnchor.visible = mode === 'full-hero';
          wordmarkAnchor.position.set(0.55, 0, 0);
          wordmarkAnchor.scale.setScalar(1.0);
          lockupGroup.position.set(-0.04, 1.84, -1.92);
          lockupGroup.scale.setScalar(1.0);
        }
      };
      this.syncVaultHeroCallback = syncArchHeroPresentation;
      syncArchHeroPresentation();

      const displaceTerrain = (elapsed: number) => {
        const hoverShift = this.hoverX * 0.85;
        const hoverLift = 1 + Math.abs(this.hoverY) * 0.22 + this.scrollNorm * 0.26;
        const heightAt = (x: number, z: number): number => {
          const rightBias = THREE.MathUtils.smoothstep(x, -3.6, 2.8);
          const ridgeA =
            Math.sin(x * 0.62 + elapsed * 0.35 + hoverShift) *
            Math.cos(z * 0.78 - elapsed * 0.28);
          const ridgeB = Math.sin((x * 1.15 - z * 0.85) - elapsed * 0.42) * 0.36;
          const crest = (0.48 + ridgeA * 0.46 + ridgeB) * rightBias;
          return Math.max(0.0, crest * hoverLift);
        };

        const solidAttr = terrainSolidGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < solidAttr.count; i++) {
          solidAttr.setY(i, heightAt(solidAttr.getX(i), solidAttr.getZ(i)));
        }
        solidAttr.needsUpdate = true;
        terrainSolidGeo.computeVertexNormals();

        const ptsAttr = terrainPtsGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < ptsAttr.count; i++) {
          ptsAttr.setY(i, heightAt(ptsAttr.getX(i), ptsAttr.getZ(i)));
        }
        ptsAttr.needsUpdate = true;

        const wireAttr = terrainWireGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < wireAttr.count; i++) {
          wireAttr.setY(i, heightAt(wireAttr.getX(i), wireAttr.getZ(i)));
        }
        wireAttr.needsUpdate = true;
      };
      displaceTerrain(0);

      update = (elapsed) => {
        if (this.heroPresentationActive && this.heroAssetMode === 'p-icon') {
          pIconAnchor.rotation.y = elapsed * 0.45 + this.hoverX * 0.35;
        } else {
          pIconAnchor.rotation.y = this.hoverX * 0.06;
          lockupGroup.rotation.y = this.hoverX * 0.025;
          lockupGroup.rotation.x = -this.hoverY * 0.015;
        }
        displaceTerrain(elapsed);
      };

      return {
        id,
        group,
        update,
        dispose: () => {
          this.syncVaultHeroCallback = null;
          geometries.forEach((g) => g.dispose());
          localMaterials.forEach((m) => m.dispose());
          glbDisposables.forEach((d) => {
            d.geometries.forEach((g) => g.dispose());
            d.materials.forEach((m) => m.dispose());
          });
        },
      };
    } else if (id === 'primetech-sculptural-emblem') {
      // SCENE TWO: PrimeTech Sculptural Emblem (matches Reference 2 strictly)
      const stageRoot = new THREE.Group();
      const monolithAnchor = new THREE.Group();
      // Exact flush seating on top of pedestal (Stage2_HeroPedestal top = 0.72, tile half-height * 1.18 = 0.6278)
      monolithAnchor.position.set(0.68, 1.347, -1.42);
      monolithAnchor.rotation.y = -0.24;
      group.add(stageRoot, monolithAnchor);

      // Soft contact AO shadow sitting directly between monolith base and pedestal deck
      const contactShadowCanvas = document.createElement('canvas');
      contactShadowCanvas.width = 128;
      contactShadowCanvas.height = 128;
      const csCtx = contactShadowCanvas.getContext('2d');
      if (csCtx) {
        const grad = csCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.32)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        csCtx.fillStyle = grad;
        csCtx.fillRect(0, 0, 128, 128);
      }
      const contactTex = new THREE.CanvasTexture(contactShadowCanvas);
      const contactPlane = new THREE.Mesh(
        trackGeo(new THREE.PlaneGeometry(1.42, 0.68)),
        trackMat(
          new THREE.MeshBasicMaterial({
            map: contactTex,
            transparent: true,
            depthWrite: false,
            opacity: 0.9,
          })
        )
      );
      contactPlane.rotation.x = -Math.PI / 2;
      contactPlane.rotation.z = 0.24;
      contactPlane.position.set(0.68, 0.722, -1.42);
      group.add(contactPlane);

      // Neutral crisp gallery lighting sculpting brushed silver bevel & satin white ceramic
      const heroSideRim = new THREE.DirectionalLight(0xffffff, 2.75);
      heroSideRim.position.set(2.8, 2.6, 1.2);
      heroSideRim.castShadow = true;
      group.add(heroSideRim);

      const ceramicFrontSoft = new THREE.DirectionalLight(0xf4f7fb, 1.55);
      ceramicFrontSoft.position.set(-0.9, 2.2, 2.8);
      group.add(ceramicFrontSoft);

      const wallGrazingLight = new THREE.PointLight(0xf8fafc, 6.2, 7.8, 1.6);
      wallGrazingLight.position.set(-1.35, 1.92, -2.15);
      group.add(wallGrazingLight);

      const glbDisposables: Array<{ geometries: THREE.BufferGeometry[]; materials: THREE.Material[] }> = [];
      let loadedCount = 0;
      const onPartLoaded = () => {
        loadedCount++;
        if (loadedCount >= 2) {
          this.notifyLevelReady('primetech-sculptural-emblem');
        }
      };

      const styleLoadedStageGlb = (root: THREE.Object3D): void => {
        const geos: THREE.BufferGeometry[] = [];
        const mats: THREE.Material[] = [];
        root.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (mesh.geometry) geos.push(mesh.geometry);
          const m = mesh.material as THREE.MeshStandardMaterial;
          if (m && 'isMaterial' in m) {
            m.envMapIntensity = 1.25;
            if (m.name === 'PrimeTech_WhiteSeam') {
              m.emissive.setHex(0xf8fbff);
              m.emissiveIntensity = 1.95;
            }
            mats.push(m);
          }
        });
        glbDisposables.push({ geometries: geos, materials: mats });
      };

      this.gltfLoader.load(
        u('/models/primetech-sculptural-stage.glb'),
        (gltf) => {
          styleLoadedStageGlb(gltf.scene);
          stageRoot.add(gltf.scene);
          onPartLoaded();
        },
        undefined,
        () => onPartLoaded()
      );
      this.gltfLoader.load(
        u('/models/primetech-plinth-tile.glb'),
        (gltf) => {
          styleLoadedStageGlb(gltf.scene);
          gltf.scene.scale.setScalar(1.18);
          monolithAnchor.add(gltf.scene);
          onPartLoaded();
        },
        undefined,
        () => onPartLoaded()
      );

      update = (_elapsed) => {
        // Subtle parallax yaw response on hover ONLY (monolith remains 100% flush on pedestal Y)
        monolithAnchor.rotation.y = -0.24 + this.hoverX * 0.04;
      };

      return {
        id,
        group,
        update,
        dispose: () => {
          contactTex.dispose();
          geometries.forEach((g) => g.dispose());
          localMaterials.forEach((m) => m.dispose());
          glbDisposables.forEach((d) => {
            d.geometries.forEach((g) => g.dispose());
            d.materials.forEach((m) => m.dispose());
          });
        },
      };
    } else if (id === 'iamscene-circuit') {
      // IAMScene Hover & Scroll Circuit World (inspired by Circuit Hover, Retrofuturistic Loop & Scroll-Controlled Circuit)
      const boardGeo = trackGeo(new THREE.RingGeometry(1.18, 11.5, 64));
      boardGeo.rotateX(-Math.PI / 2);
      const boardMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x090d14,
          metalness: 0.8,
          roughness: 0.28,
        })
      );
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.position.y = -0.002;
      board.receiveShadow = true;
      group.add(board);

      const traceMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0ea5e9,
          emissiveIntensity: 1.5,
          roughness: 0.2,
          metalness: 0.3,
        })
      );
      const warmTraceMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 1.25,
          roughness: 0.24,
          metalness: 0.5,
        })
      );

      // Concentric circuit datum bus rings around stage
      const ringRadii = [2.1, 3.25, 4.45, 5.8];
      const traceRings: THREE.Mesh[] = [];
      for (let i = 0; i < ringRadii.length; i++) {
        const rGeo = trackGeo(new THREE.TorusGeometry(ringRadii[i], 0.015, 8, 84));
        rGeo.rotateX(Math.PI / 2);
        const rMesh = new THREE.Mesh(rGeo, i % 2 === 0 ? traceMat : warmTraceMat);
        rMesh.position.y = 0.008;
        group.add(rMesh);
        traceRings.push(rMesh);
      }

      // Radial orthogonally routed PCB trace rails + elevated retrofuturistic pylons
      const traceLen = 7.4;
      const traceGeo = trackGeo(new THREE.BoxGeometry(0.028, 0.014, traceLen));
      const nodeGeo = trackGeo(new THREE.CylinderGeometry(0.085, 0.095, 0.04, 8));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const rail = new THREE.Mesh(traceGeo, i % 2 === 0 ? traceMat : warmTraceMat);
        const midR = 4.9;
        rail.position.set(Math.cos(a) * midR, 0.007, Math.sin(a) * midR);
        rail.rotation.y = -a + Math.PI / 2;
        group.add(rail);

        const pad = new THREE.Mesh(nodeGeo, this.materials.secondaryMetal);
        pad.position.set(Math.cos(a) * 3.25, 0.02, Math.sin(a) * 3.25);
        group.add(pad);
      }

      // Elevated retrofuturistic dual loop rings arching over the rear hemisphere
      const loopA = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(4.4, 0.032, 10, 96, Math.PI * 1.25)),
        traceMat
      );
      loopA.position.set(0, 1.85, -1.6);
      loopA.rotation.set(0.32, 0, Math.PI * 0.875);
      group.add(loopA);

      const loopB = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(4.95, 0.024, 10, 96, Math.PI * 1.15)),
        warmTraceMat
      );
      loopB.position.set(0, 2.05, -2.1);
      loopB.rotation.set(-0.22, 0, Math.PI * 0.925);
      group.add(loopB);

      // 36 Instanced traveling luminous signal packets streaming around the circuit loops
      const packetCount = 36;
      const packetGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.035, 0.055));
      const packets = new THREE.InstancedMesh(packetGeo, traceMat, packetCount);
      packets.frustumCulled = false;
      group.add(packets);

      update = (elapsed, dt) => {
        const speedBoost = 1 + Math.abs(this.hoverX) * 1.8 + this.scrollNorm * 2.4;
        traceMat.emissiveIntensity = 1.35 + Math.abs(this.hoverX) * 1.25 + this.scrollNorm * 0.95;
        warmTraceMat.emissiveIntensity = 1.1 + Math.abs(this.hoverY) * 1.1;

        loopA.rotation.y = this.hoverX * 0.25 + Math.sin(elapsed * 0.35) * 0.08;
        loopB.rotation.y = -this.hoverX * 0.2 + this.scrollNorm * 0.35;
        loopB.rotation.x = -0.22 + dt * 0;

        for (let i = 0; i < packetCount; i++) {
          const ringIdx = i % ringRadii.length;
          const r = ringRadii[ringIdx];
          const dir = ringIdx % 2 === 0 ? 1 : -1;
          const a = (i / packetCount) * Math.PI * 2 + elapsed * (0.45 + ringIdx * 0.14) * dir * speedBoost;
          _dummy.position.set(Math.cos(a) * r, 0.025, Math.sin(a) * r);
          _dummy.rotation.set(0, -a, 0);
          _dummy.scale.setScalar(0.85 + 0.35 * Math.sin(elapsed * 3.0 + i));
          _dummy.updateMatrix();
          packets.setMatrixAt(i, _dummy.matrix);
        }
        packets.instanceMatrix.needsUpdate = true;
      };
    } else {
      // orbital-lab: Hexagonal telemetry bay, spinning calibration rings & deep starfield dome
      const hexFloorGeo = trackGeo(new THREE.CylinderGeometry(4.9, 4.9, 0.08, 6));
      const hexFloor = new THREE.Mesh(hexFloorGeo, this.materials.orbitalDeck);
      hexFloor.position.y = -0.045;
      hexFloor.receiveShadow = true;
      group.add(hexFloor);

      const outerHaloGeo = trackGeo(new THREE.TorusGeometry(4.2, 0.03, 12, 72));
      outerHaloGeo.rotateX(Math.PI / 2);
      const outerHalo = new THREE.Mesh(outerHaloGeo, this.materials.emissiveAccent);
      outerHalo.position.y = 0.02;
      group.add(outerHalo);

      const gantryRingA = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(3.3, 0.032, 12, 80)),
        this.materials.secondaryMetal
      );
      gantryRingA.position.y = 1.6;
      const gantryRingB = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(3.65, 0.022, 12, 80)),
        this.materials.emissiveAccent
      );
      gantryRingB.position.y = 1.6;
      group.add(gantryRingA, gantryRingB);

      // 6 Sensor pylons around perimeter
      const sensorBaseGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.14, 1.4, 6));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = new THREE.Mesh(sensorBaseGeo, this.materials.slatePlinth);
        s.position.set(Math.cos(a) * 4.15, 0.7, Math.sin(a) * 4.15);
        s.rotation.y = -a;
        const tip = new THREE.Mesh(
          trackGeo(new THREE.OctahedronGeometry(0.09, 0)),
          this.materials.emissiveAccent
        );
        tip.position.y = 0.84;
        s.add(tip);
        group.add(s);
      }

      // Instanced orbital starfield dome
      const starCount = 120;
      const starGeo = trackGeo(new THREE.SphereGeometry(0.035, 6, 6));
      const starMat = trackMat(
        new THREE.MeshBasicMaterial({ color: 0xdbeafe })
      );
      const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
      for (let i = 0; i < starCount; i++) {
        const phi = Math.acos(1 - ((i + 0.5) / starCount) * 0.85);
        const theta = i * 2.39996;
        const r = 13.5 + (i % 4) * 1.1;
        _dummy.position.set(
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r + 1.2,
          Math.sin(phi) * Math.sin(theta) * r
        );
        _dummy.scale.setScalar(0.55 + (i % 3) * 0.45);
        _dummy.updateMatrix();
        stars.setMatrixAt(i, _dummy.matrix);
      }
      stars.instanceMatrix.needsUpdate = true;
      group.add(stars);

      update = (_elapsed, dt) => {
        gantryRingA.rotation.x += dt * 0.12;
        gantryRingA.rotation.y += dt * 0.08;
        gantryRingB.rotation.z -= dt * 0.1;
      };
    }

    return {
      id,
      group,
      update,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        localMaterials.forEach((m) => m.dispose());
      },
    };
  }

  public dispose(): void {
    for (const lvl of this.levels.values()) {
      this.parentGroup.remove(lvl.group);
      lvl.dispose();
    }
    this.levels.clear();
  }
}
