import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as xb from 'xrblocks';
import type {
  AudioLevels,
  BimSummary,
  CharacterRigSpec,
  DroppedImageAsset,
  PlacedItemKind,
  SceneryPropType,
  SelectedObjectDetails,
  SerializedSceneryItem,
  StudioMediaAsset,
} from '../types.ts';
import { buildProceduralCharacterRig } from './characterRig.ts';
import { STAGE_POSITION } from './environment.ts';
import type { StudioMaterialLibrary } from './materials.ts';
import type { StudioTextureSet } from './textures.ts';

export interface PlacedPropItem {
  id: string;
  kind: PlacedItemKind;
  label: string;
  group: THREE.Group;
  assetId?: string;
  imageDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  bimSummary?: BimSummary;
  characterSpec?: CharacterRigSpec;
  updateCharacter?: (elapsed: number, dt: number, audio: AudioLevels) => void;
  videoEl?: HTMLVideoElement;
  videoTexture?: THREE.VideoTexture;
  mixer?: THREE.AnimationMixer;
  animations?: THREE.AnimationClip[];
  activeClipIndex?: number;
  animationPlaying?: boolean;
  dispose: () => void;
}

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

/**
 * Web-friendly 3D Scenery, Media, Model & BIM Manager.
 * Supports click-to-place, click-to-select, drag-to-move, inspector transforms,
 * 3D video screens, glTF AnimationMixer clips, BIM buildings, procedural cartoon characters, and serialization.
 */
export class SceneryManager extends xb.Script {
  private materials: StudioMaterialLibrary;
  private textures: StudioTextureSet;
  private propsRoot = new THREE.Group();
  private items: PlacedPropItem[] = [];
  private selectedId: string | null = null;
  private armedPlacement:
    | { kind: 'prop'; propType: SceneryPropType }
    | { kind: 'image'; asset: DroppedImageAsset }
    | { kind: 'character'; spec: CharacterRigSpec }
    | null = null;

  private selectionRing!: THREE.Mesh;
  private selectionGeo!: THREE.RingGeometry;
  private selectionMat!: THREE.MeshBasicMaterial;
  private onSelectionChange?: (item: PlacedPropItem | null, count: number) => void;
  private onPlacementComplete?: () => void;
  private onMutation?: () => void;

  constructor(
    materials: StudioMaterialLibrary,
    textures: StudioTextureSet,
    callbacks?: {
      onSelectionChange?: (item: PlacedPropItem | null, count: number) => void;
      onPlacementComplete?: () => void;
      onMutation?: () => void;
    }
  ) {
    super();
    this.materials = materials;
    this.textures = textures;
    this.onSelectionChange = callbacks?.onSelectionChange;
    this.onPlacementComplete = callbacks?.onPlacementComplete;
    this.onMutation = callbacks?.onMutation;
    this.propsRoot.name = 'SceneryPropsRoot';
    this.add(this.propsRoot);

    this.selectionGeo = new THREE.RingGeometry(0.24, 0.29, 36);
    this.selectionGeo.rotateX(-Math.PI / 2);
    this.selectionMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.selectionRing = new THREE.Mesh(this.selectionGeo, this.selectionMat);
    this.selectionRing.position.y = 0.012;
    this.selectionRing.visible = false;
    this.add(this.selectionRing);
  }

  public seedStarterScenery(): void {
    this.placePropAt('pine', new THREE.Vector3(-1.55, 0, -2.35), 0.2, false);
    this.placePropAt('boulders', new THREE.Vector3(-1.2, 0, -2.1), 0.7, false);
    this.placePropAt('lantern', new THREE.Vector3(1.38, 0, -2.05), -0.5, false);
    this.placePropAt('pine', new THREE.Vector3(1.75, 0, -2.45), 1.1, false);
    this.selectItem(null);
  }

  public armPropPlacement(propType: SceneryPropType): void {
    this.armedPlacement = { kind: 'prop', propType };
  }

  public armImagePlacement(asset: DroppedImageAsset): void {
    this.armedPlacement = { kind: 'image', asset };
  }

  public armCharacterPlacement(spec: CharacterRigSpec): void {
    this.armedPlacement = { kind: 'character', spec };
  }

  public clearArmedPlacement(): void {
    this.armedPlacement = null;
  }

  public get isPlacementArmed(): boolean {
    return this.armedPlacement !== null;
  }

  public getSelectedItem(): PlacedPropItem | null {
    return this.items.find((i) => i.id === this.selectedId) ?? null;
  }

  public getAllItems(): PlacedPropItem[] {
    return this.items;
  }

  public getItemCount(): number {
    return this.items.length;
  }

  public getSelectedObjectDetails(): SelectedObjectDetails | null {
    const item = this.getSelectedItem();
    if (!item) return null;
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      position: [
        Number(item.group.position.x.toFixed(2)),
        Number(item.group.position.y.toFixed(2)),
        Number(item.group.position.z.toFixed(2)),
      ],
      rotationYDeg: Math.round(((item.group.rotation.y * 180) / Math.PI) % 360),
      scale: Number(item.group.scale.x.toFixed(2)),
      visible: item.group.visible,
      bimSummary: item.bimSummary,
      characterSpec: item.characterSpec,
      videoPlaying: item.videoEl ? !item.videoEl.paused : undefined,
      videoMuted: item.videoEl ? item.videoEl.muted : undefined,
      animationClips: item.animations?.map((a, idx) => a.name || `Clip ${idx + 1}`),
      activeAnimationIndex: item.activeClipIndex,
      animationPlaying: item.animationPlaying,
    };
  }

  public setSelectedTransform(patch: {
    x?: number;
    y?: number;
    z?: number;
    rotationYDeg?: number;
    scale?: number;
    visible?: boolean;
  }): void {
    const item = this.getSelectedItem();
    if (!item) return;
    if (patch.x !== undefined) item.group.position.x = patch.x;
    if (patch.y !== undefined) item.group.position.y = Math.max(0, patch.y);
    if (patch.z !== undefined) item.group.position.z = patch.z;
    if (patch.rotationYDeg !== undefined) {
      item.group.rotation.y = (patch.rotationYDeg * Math.PI) / 180;
    }
    if (patch.scale !== undefined) {
      const s = THREE.MathUtils.clamp(patch.scale, 0.25, 4);
      item.group.scale.setScalar(s);
    }
    if (patch.visible !== undefined) {
      item.group.visible = patch.visible;
    }
    this.updateSelectionRing();
    this.onSelectionChange?.(item, this.items.length);
    this.onMutation?.();
  }

  public toggleSelectedVideoPlay(): boolean {
    const item = this.getSelectedItem();
    if (!item?.videoEl) return false;
    if (item.videoEl.paused) {
      void item.videoEl.play();
    } else {
      item.videoEl.pause();
    }
    this.onSelectionChange?.(item, this.items.length);
    return !item.videoEl.paused;
  }

  public toggleSelectedVideoMute(): boolean {
    const item = this.getSelectedItem();
    if (!item?.videoEl) return false;
    item.videoEl.muted = !item.videoEl.muted;
    this.onSelectionChange?.(item, this.items.length);
    return item.videoEl.muted;
  }

  public selectAnimationClip(index: number): void {
    const item = this.getSelectedItem();
    if (!item?.mixer || !item.animations || !item.animations[index]) return;
    item.mixer.stopAllAction();
    item.activeClipIndex = index;
    item.animationPlaying = true;
    const action = item.mixer.clipAction(item.animations[index]);
    action.reset().play();
    this.onSelectionChange?.(item, this.items.length);
  }

  public toggleAnimationPlay(): void {
    const item = this.getSelectedItem();
    if (!item?.mixer || !item.animations || item.animations.length === 0) return;
    const idx = item.activeClipIndex ?? 0;
    const action = item.mixer.clipAction(item.animations[idx]);
    item.animationPlaying = !item.animationPlaying;
    action.paused = !item.animationPlaying;
    this.onSelectionChange?.(item, this.items.length);
  }

  public getExportGroup(): THREE.Group {
    this.propsRoot.updateMatrixWorld(true);
    return this.propsRoot;
  }

  public raycastGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const renderer = xb.core.renderer;
    const camera = xb.core.camera;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !camera) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitPoint);
    if (!hit) return null;

    const dx = hit.x - STAGE_POSITION.x;
    const dz = hit.z - STAGE_POSITION.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4.2) {
      hit.x = STAGE_POSITION.x + (dx / dist) * 4.2;
      hit.z = STAGE_POSITION.z + (dz / dist) * 4.2;
    }
    return hit.clone();
  }

  public hitTestProp(clientX: number, clientY: number): PlacedPropItem | null {
    const renderer = xb.core.renderer;
    const camera = xb.core.camera;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !camera) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);

    const roots = this.items.filter((i) => i.group.visible).map((i) => i.group);
    const hits = _raycaster.intersectObjects(roots, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const found = this.items.find((i) => i.group === obj);
      if (found) return found;
      obj = obj.parent;
    }
    return null;
  }

  public handleCanvasClick(clientX: number, clientY: number): boolean {
    if (this.armedPlacement) {
      const pt = this.raycastGround(clientX, clientY);
      if (!pt) return false;
      if (this.armedPlacement.kind === 'prop') {
        this.placePropAt(this.armedPlacement.propType, pt, Math.random() * Math.PI * 2);
      } else if (this.armedPlacement.kind === 'character') {
        this.placeCharacterRig(this.armedPlacement.spec, pt);
      } else {
        this.placeImageBackdrop(this.armedPlacement.asset, pt);
      }
      this.armedPlacement = null;
      this.onPlacementComplete?.();
      return true;
    }

    const hitProp = this.hitTestProp(clientX, clientY);
    if (hitProp) {
      this.selectItem(hitProp.id);
      return true;
    }
    this.selectItem(null);
    return false;
  }

  public moveSelectedToScreenPoint(clientX: number, clientY: number): void {
    const selected = this.getSelectedItem();
    if (!selected) return;
    const pt = this.raycastGround(clientX, clientY);
    if (!pt) return;
    selected.group.position.set(pt.x, selected.group.position.y, pt.z);
    this.updateSelectionRing();
    this.onSelectionChange?.(selected, this.items.length);
  }

  public notifyDragEnded(): void {
    this.onMutation?.();
  }

  public selectItem(id: string | null): void {
    this.selectedId = id;
    this.updateSelectionRing();
    this.onSelectionChange?.(this.getSelectedItem(), this.items.length);
  }

  public rotateSelected(deltaRad = Math.PI / 4): void {
    const item = this.getSelectedItem();
    if (!item) return;
    item.group.rotation.y += deltaRad;
    this.onSelectionChange?.(item, this.items.length);
    this.onMutation?.();
  }

  public deleteSelected(): void {
    if (!this.selectedId) return;
    const idx = this.items.findIndex((i) => i.id === this.selectedId);
    if (idx === -1) return;
    const [removed] = this.items.splice(idx, 1);
    this.propsRoot.remove(removed.group);
    removed.dispose();
    this.selectItem(null);
    this.onMutation?.();
  }

  public clearAll(notify = true): void {
    for (const item of this.items) {
      this.propsRoot.remove(item.group);
      item.dispose();
    }
    this.items = [];
    this.selectItem(null);
    if (notify) this.onMutation?.();
  }

  private updateSelectionRing(): void {
    const item = this.getSelectedItem();
    if (!item) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.visible = true;
    this.selectionRing.position.set(item.group.position.x, 0.012, item.group.position.z);
    this.selectionRing.scale.setScalar(Math.max(0.8, item.group.scale.x));
  }

  public placePropAt(
    type: SceneryPropType,
    position: THREE.Vector3,
    rotationY = 0,
    notify = true
  ): PlacedPropItem {
    const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const built = this.buildProceduralProp(type);
    built.group.position.set(position.x, 0, position.z);
    built.group.rotation.y = rotationY;
    this.propsRoot.add(built.group);

    const item: PlacedPropItem = {
      id,
      kind: type,
      label: built.label,
      group: built.group,
      dispose: built.dispose,
    };
    this.items.push(item);
    this.selectItem(id);
    if (notify) this.onMutation?.();
    return item;
  }

  public placeImageBackdrop(
    asset: DroppedImageAsset,
    position?: THREE.Vector3,
    notify = true
  ): PlacedPropItem {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pos =
      position ??
      new THREE.Vector3(
        (this.items.filter((i) => i.kind === 'image').length % 2 === 0 ? -1 : 1) * 0.95,
        0,
        -2.25
      );

    const built = this.buildImageFrameGroup(asset);
    built.group.position.set(pos.x, 0, pos.z);
    built.group.lookAt(STAGE_POSITION.x, 0, STAGE_POSITION.z + 1.2);
    this.propsRoot.add(built.group);

    const item: PlacedPropItem = {
      id,
      kind: 'image',
      label: asset.name.slice(0, 22),
      group: built.group,
      assetId: asset.id,
      imageDataUrl: asset.dataUrl,
      imageWidth: asset.width,
      imageHeight: asset.height,
      dispose: built.dispose,
    };
    this.items.push(item);
    this.selectItem(id);
    if (notify) this.onMutation?.();
    return item;
  }

  public placeVideoScreen(
    asset: StudioMediaAsset,
    position?: THREE.Vector3
  ): PlacedPropItem {
    const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pos =
      position ??
      new THREE.Vector3(
        (this.items.filter((i) => i.kind === 'video').length % 2 === 0 ? 1 : -1) * 1.15,
        0,
        -2.1
      );

    const group = new THREE.Group();
    group.name = `VideoScreen_${asset.name}`;
    const geometries: THREE.BufferGeometry[] = [];
    const track = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    const aspect =
      asset.width && asset.height && asset.height > 0
        ? THREE.MathUtils.clamp(asset.width / asset.height, 0.6, 2.2)
        : 16 / 9;
    const panelH = 0.78;
    const panelW = panelH * aspect;
    const centerY = 0.98;

    const footGeo = track(new THREE.BoxGeometry(0.56, 0.036, 0.28));
    const foot = new THREE.Mesh(footGeo, this.materials.slatePlinth);
    foot.position.y = 0.018;
    foot.castShadow = true;
    group.add(foot);

    const postGeo = track(new THREE.CylinderGeometry(0.018, 0.024, 0.96, 16));
    const post = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
    post.position.set(0, 0.5, -0.02);
    post.castShadow = true;
    group.add(post);

    const bezelGeo = track(new THREE.BoxGeometry(panelW + 0.06, panelH + 0.06, 0.036));
    const bezel = new THREE.Mesh(bezelGeo, this.materials.slatePlinth);
    bezel.position.set(0, centerY, -0.006);
    bezel.castShadow = true;
    group.add(bezel);

    const videoEl = document.createElement('video');
    videoEl.src = asset.objectUrl || '';
    videoEl.loop = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.crossOrigin = 'anonymous';
    void videoEl.play().catch(() => {});

    const videoTex = new THREE.VideoTexture(videoEl);
    videoTex.colorSpace = THREE.SRGBColorSpace;

    const screenMat = new THREE.MeshStandardMaterial({
      map: videoTex,
      roughness: 0.28,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveMap: videoTex,
      emissiveIntensity: 0.35,
    });
    const screenGeo = track(new THREE.PlaneGeometry(panelW, panelH));
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, centerY, 0.016);
    group.add(screen);

    group.position.set(pos.x, 0, pos.z);
    group.lookAt(STAGE_POSITION.x, 0, STAGE_POSITION.z + 1.2);
    this.propsRoot.add(group);

    const item: PlacedPropItem = {
      id,
      kind: 'video',
      label: asset.name.slice(0, 22),
      group,
      assetId: asset.id,
      videoEl,
      videoTexture: videoTex,
      dispose: () => {
        videoEl.pause();
        videoEl.src = '';
        videoTex.dispose();
        screenMat.dispose();
        geometries.forEach((g) => g.dispose());
      },
    };
    this.items.push(item);
    this.selectItem(id);
    this.onMutation?.();
    return item;
  }

  public placeImportedModelAsset(
    asset: StudioMediaAsset,
    position?: THREE.Vector3
  ): PlacedPropItem | null {
    if (!asset.runtimeModelRoot) return null;
    const isBim = asset.category === 'bim';
    const id = `${isBim ? 'bim' : 'mdl'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingCount = this.items.filter(
      (i) => i.kind === 'model' || i.kind === 'bim'
    ).length;
    const angle = existingCount * 0.9 - 0.6;
    const pos =
      position ??
      new THREE.Vector3(
        STAGE_POSITION.x + Math.sin(angle) * 1.15,
        0,
        STAGE_POSITION.z + Math.cos(angle) * 0.95 - 0.35
      );

    // Clone geometry wrapper (preserving SkinnedMesh bone bindings) so multiple placements remain independent
    const modelInstance = SkeletonUtils.clone(asset.runtimeModelRoot) as THREE.Group;

    // Add sleek architectural plinth ring under imported 3D / BIM assets
    const group = new THREE.Group();
    group.name = `${isBim ? 'BIM' : 'Model'}_${asset.name}`;
    const plinthGeo = new THREE.CylinderGeometry(0.46, 0.5, 0.036, 32);
    const plinth = new THREE.Mesh(plinthGeo, this.materials.slatePlinth);
    plinth.position.y = 0.018;
    plinth.receiveShadow = true;
    plinth.castShadow = true;
    group.add(plinth);

    modelInstance.position.y += 0.036;
    group.add(modelInstance);
    group.position.set(pos.x, 0, pos.z);
    this.propsRoot.add(group);

    let mixer: THREE.AnimationMixer | undefined;
    const animations = asset.runtimeAnimations;
    let activeClipIndex: number | undefined;
    let animationPlaying = false;
    if (animations && animations.length > 0) {
      mixer = new THREE.AnimationMixer(modelInstance);
      activeClipIndex = 0;
      animationPlaying = true;
      mixer.clipAction(animations[0]).play();
    }

    const item: PlacedPropItem = {
      id,
      kind: isBim ? 'bim' : 'model',
      label: asset.name.slice(0, 22),
      group,
      assetId: asset.id,
      bimSummary: asset.bimSummary,
      mixer,
      animations,
      activeClipIndex,
      animationPlaying,
      dispose: () => {
        mixer?.stopAllAction();
        plinthGeo.dispose();
      },
    };
    this.items.push(item);
    this.selectItem(id);
    this.onMutation?.();
    return item;
  }

  public placeCharacterRig(
    spec: CharacterRigSpec,
    position?: THREE.Vector3,
    notify = true
  ): PlacedPropItem {
    const id = `chr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingChars = this.items.filter((i) => i.kind === 'character').length;
    const offsetAngle = existingChars * 0.85 - 0.55;
    const pos =
      position ??
      new THREE.Vector3(
        STAGE_POSITION.x + Math.sin(offsetAngle) * 1.05 + (existingChars === 0 ? 0.82 : 0),
        0,
        STAGE_POSITION.z + Math.cos(offsetAngle) * 0.65 - 0.15
      );

    const built = buildProceduralCharacterRig(spec);
    built.group.position.set(pos.x, 0, pos.z);
    built.group.lookAt(STAGE_POSITION.x, 0, STAGE_POSITION.z + 1.4);
    this.propsRoot.add(built.group);

    const item: PlacedPropItem = {
      id,
      kind: 'character',
      label: spec.name.slice(0, 24),
      group: built.group,
      characterSpec: spec,
      updateCharacter: built.update,
      dispose: built.dispose,
    };
    this.items.push(item);
    this.selectItem(id);
    if (notify) this.onMutation?.();
    return item;
  }

  public updateScenery(dt: number, elapsed = 0, audio?: AudioLevels): void {
    const fallbackAudio: AudioLevels = audio ?? {
      rms: 0,
      low: 0,
      mid: 0,
      high: 0,
      isPlaying: false,
    };
    for (const item of this.items) {
      if (item.mixer && item.animationPlaying) {
        item.mixer.update(dt);
      }
      if (item.updateCharacter) {
        item.updateCharacter(elapsed, dt, fallbackAudio);
      }
    }
  }

  public serializeItems(): SerializedSceneryItem[] {
    return this.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      position: [
        Number(item.group.position.x.toFixed(3)),
        Number(item.group.position.y.toFixed(3)),
        Number(item.group.position.z.toFixed(3)),
      ],
      rotationY: Number(item.group.rotation.y.toFixed(4)),
      scale: Number(item.group.scale.x.toFixed(3)),
      visible: item.group.visible,
      assetId: item.assetId,
      imageDataUrl: item.imageDataUrl,
      imageWidth: item.imageWidth,
      imageHeight: item.imageHeight,
      characterSpec: item.characterSpec,
    }));
  }

  public restoreSerializedItems(
    serialized: SerializedSceneryItem[],
    mediaAssets: StudioMediaAsset[]
  ): void {
    this.clearAll(false);
    for (const entry of serialized) {
      const pos = new THREE.Vector3(entry.position[0], entry.position[1], entry.position[2]);
      let created: PlacedPropItem | null = null;

      if (
        entry.kind === 'pine' ||
        entry.kind === 'boulders' ||
        entry.kind === 'lantern' ||
        entry.kind === 'arch'
      ) {
        created = this.placePropAt(entry.kind, pos, entry.rotationY, false);
      } else if (entry.kind === 'character' && entry.characterSpec) {
        created = this.placeCharacterRig(entry.characterSpec, pos, false);
      } else if (entry.kind === 'image' && entry.imageDataUrl) {
        created = this.placeImageBackdrop(
          {
            id: entry.assetId || entry.id,
            name: entry.label,
            mimeType: 'image/jpeg',
            dataUrl: entry.imageDataUrl,
            width: entry.imageWidth || 800,
            height: entry.imageHeight || 600,
          },
          pos,
          false
        );
      } else if (entry.assetId) {
        const found = mediaAssets.find((a) => a.id === entry.assetId);
        if (found && (found.category === 'model' || found.category === 'bim')) {
          created = this.placeImportedModelAsset(found, pos);
        } else if (found && found.category === 'video') {
          created = this.placeVideoScreen(found, pos);
        }
      }

      if (created) {
        created.group.position.set(entry.position[0], entry.position[1], entry.position[2]);
        created.group.rotation.y = entry.rotationY;
        created.group.scale.setScalar(entry.scale || 1);
        created.group.visible = entry.visible !== false;
      }
    }
    this.selectItem(null);
  }

  private buildImageFrameGroup(asset: DroppedImageAsset): {
    group: THREE.Group;
    dispose: () => void;
  } {
    const group = new THREE.Group();
    group.name = `DroppedBackdrop_${asset.name}`;
    const geometries: THREE.BufferGeometry[] = [];
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    const aspect =
      asset.width > 0 && asset.height > 0
        ? Math.min(2.0, Math.max(0.55, asset.width / asset.height))
        : 1.5;
    const panelH = 0.72;
    const panelW = panelH * aspect;
    const centerY = 0.92;

    const shadowGeo = track(new THREE.PlaneGeometry(0.65, 0.45));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    group.add(shadow);

    const footGeo = track(new THREE.BoxGeometry(0.46, 0.032, 0.24));
    const foot = new THREE.Mesh(footGeo, this.materials.slatePlinth);
    foot.position.y = 0.016;
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(foot);

    const postGeo = track(new THREE.CylinderGeometry(0.014, 0.018, 0.92, 16));
    const postL = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
    postL.position.set(-panelW * 0.28, 0.48, -0.02);
    postL.castShadow = true;
    const postR = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
    postR.position.set(panelW * 0.28, 0.48, -0.02);
    postR.castShadow = true;
    group.add(postL, postR);

    const bezelGeo = track(new THREE.BoxGeometry(panelW + 0.06, panelH + 0.06, 0.035));
    const bezel = new THREE.Mesh(bezelGeo, this.materials.heroMetal);
    bezel.position.set(0, centerY, -0.005);
    bezel.castShadow = true;
    group.add(bezel);

    const imgEl = new Image();
    imgEl.src = asset.dataUrl;
    const tex = new THREE.Texture(imgEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    imgEl.onload = () => {
      tex.needsUpdate = true;
    };
    if (imgEl.complete) tex.needsUpdate = true;
    disposables.push(tex);

    const canvasMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.22,
    });
    disposables.push(canvasMat);

    const canvasGeo = track(new THREE.PlaneGeometry(panelW, panelH));
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.set(0, centerY, 0.016);
    group.add(canvasMesh);

    return {
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  private buildProceduralProp(type: SceneryPropType): {
    label: string;
    group: THREE.Group;
    dispose: () => void;
  } {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const localMaterials: THREE.Material[] = [];
    const track = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    const shadowGeo = track(new THREE.PlaneGeometry(0.55, 0.55));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    group.add(shadow);

    let label = 'Prop';

    if (type === 'pine') {
      label = 'Cypress Pine';
      const trunkGeo = track(new THREE.CylinderGeometry(0.025, 0.048, 0.34, 12));
      const trunk = new THREE.Mesh(trunkGeo, this.materials.walnutWood);
      trunk.position.y = 0.17;
      trunk.castShadow = true;
      group.add(trunk);

      const tierSpecs = [
        { r: 0.24, h: 0.36, y: 0.42 },
        { r: 0.19, h: 0.32, y: 0.62 },
        { r: 0.14, h: 0.28, y: 0.8 },
        { r: 0.08, h: 0.22, y: 0.96 },
      ];
      for (const t of tierSpecs) {
        const coneGeo = track(new THREE.ConeGeometry(t.r, t.h, 14));
        const cone = new THREE.Mesh(coneGeo, this.materials.foliage);
        cone.position.y = t.y;
        cone.castShadow = true;
        cone.receiveShadow = true;
        group.add(cone);
      }
    } else if (type === 'boulders') {
      label = 'Moss Boulders';
      const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x5c6472,
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true,
      });
      localMaterials.push(stoneMat);

      const specs = [
        { r: 0.18, pos: [0, 0.11, 0], scale: [1.2, 0.78, 1.05] },
        { r: 0.12, pos: [0.16, 0.08, 0.09], scale: [1.0, 0.72, 1.1] },
        { r: 0.1, pos: [-0.14, 0.07, -0.07], scale: [1.1, 0.68, 0.95] },
      ];
      for (const s of specs) {
        const rockGeo = track(new THREE.IcosahedronGeometry(s.r, 1));
        const rock = new THREE.Mesh(rockGeo, stoneMat);
        rock.position.set(s.pos[0], s.pos[1], s.pos[2]);
        rock.scale.set(s.scale[0], s.scale[1], s.scale[2]);
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);
      }
      const capGeo = track(new THREE.SphereGeometry(0.11, 14, 10));
      capGeo.scale(1.1, 0.32, 1.0);
      const cap = new THREE.Mesh(capGeo, this.materials.moss);
      cap.position.set(0, 0.22, 0);
      group.add(cap);
    } else if (type === 'lantern') {
      label = 'Wayfinder Lamp';
      const baseGeo = track(new THREE.CylinderGeometry(0.08, 0.11, 0.06, 8));
      const base = new THREE.Mesh(baseGeo, this.materials.slatePlinth);
      base.position.y = 0.03;
      base.castShadow = true;
      group.add(base);

      const postCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.05, 0),
        new THREE.Vector3(0, 0.58, 0),
        new THREE.Vector3(0, 0.92, 0.06),
        new THREE.Vector3(0, 0.98, 0.18),
      ]);
      const armGeo = track(new THREE.TubeGeometry(postCurve, 24, 0.015, 10, false));
      const arm = new THREE.Mesh(armGeo, this.materials.secondaryMetal);
      arm.castShadow = true;
      group.add(arm);

      const capGeo = track(new THREE.ConeGeometry(0.085, 0.06, 8));
      const cap = new THREE.Mesh(capGeo, this.materials.heroMetal);
      cap.position.set(0, 0.93, 0.18);
      group.add(cap);

      const glassGeo = track(new THREE.CylinderGeometry(0.052, 0.044, 0.11, 8));
      const glass = new THREE.Mesh(glassGeo, this.materials.glassDome);
      glass.position.set(0, 0.85, 0.18);
      group.add(glass);

      const coreGeo = track(new THREE.SphereGeometry(0.024, 16, 12));
      const core = new THREE.Mesh(coreGeo, this.materials.emissiveAccent);
      core.position.set(0, 0.85, 0.18);
      group.add(core);
    } else {
      label = 'Studio Arch';
      const pierGeo = track(new THREE.BoxGeometry(0.11, 0.95, 0.14));
      const pierL = new THREE.Mesh(pierGeo, this.materials.slatePlinth);
      pierL.position.set(-0.38, 0.475, 0);
      pierL.castShadow = true;
      const pierR = new THREE.Mesh(pierGeo, this.materials.slatePlinth);
      pierR.position.set(0.38, 0.475, 0);
      pierR.castShadow = true;
      group.add(pierL, pierR);

      const archGeo = track(new THREE.TorusGeometry(0.38, 0.045, 16, 40, Math.PI));
      const arch = new THREE.Mesh(archGeo, this.materials.heroMetal);
      arch.position.set(0, 0.95, 0);
      arch.castShadow = true;
      group.add(arch);

      const neonGeo = track(new THREE.TorusGeometry(0.33, 0.012, 10, 40, Math.PI));
      const neon = new THREE.Mesh(neonGeo, this.materials.emissiveAccent);
      neon.position.set(0, 0.95, 0.02);
      group.add(neon);
    }

    return {
      label,
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        localMaterials.forEach((m) => m.dispose());
      },
    };
  }

  dispose(): void {
    this.clearAll(false);
    this.selectionGeo.dispose();
    this.selectionMat.dispose();
  }
}
