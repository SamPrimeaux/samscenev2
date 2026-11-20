import * as THREE from 'three';
import * as xb from 'xrblocks';
import {
  ENVIRONMENT_LEVEL_MAP,
  FINISH_MAP,
  PROCEDURAL_PBR_MATERIAL_MAP,
  REFERENCE_SKY_VIDEO_PATH,
  SKY_PRESET_MAP,
  SUBJECT_MAP,
} from './constants.ts';
import { AudioEngine } from './services/audioEngine.ts';
import {
  extractVideoKeyframes,
  ingestStudioFile,
  transcriptCuesToBeats,
} from './services/fileIngestService.ts';
import { ProjectPersistenceService } from './services/projectService.ts';
import { exportSceneAsGlb } from './services/sceneExportService.ts';
import {
  assistScript,
  composeWithMiniAgentSam,
  createStudioTemplate,
  deleteStudioTemplate,
  downloadWavBase64,
  exportStudioTemplatesSql,
  fetchStudioTemplates,
  generateCharacterFromMedia,
  generateScenePackFromVideoKeyframes,
  synthesizeSpeech,
} from './services/ttsService.ts';
import { CameraDirector } from './studio/cameraDirector.ts';
import { STAGE_POSITION, StudioStage } from './studio/environment.ts';
import { SceneryManager } from './studio/scenery.ts';
import { SpatialBrush } from './studio/sculptBrush.ts';
import type {
  AtmosphereMoodId,
  CameraShotId,
  CharacterRigSpec,
  CharacterStylePresetId,
  EnvironmentLevelId,
  ExtractedCameraKeyframe,
  ExtractedVideoKeyframe,
  FinishId,
  IamSceneDocument,
  IamSceneNode,
  MovieBeat,
  SamSceneProjectManifest,
  ScenePackResult,
  SceneryPropType,
  SkyPresetId,
  SkySceneConfig,
  SkyTriggerMode,
  StudioMediaAsset,
  StudioSubjectId,
  StudioTemplateRecord,
  TransitionType,
  TtsMode,
  TtsRequest,
} from './types.ts';
import { StudioDeckCard } from './ui/StudioDeckCard.ts';
import { StudioHudOverlay } from './ui/StudioHudOverlay.ts';
import { VoiceStudioCard } from './ui/VoiceStudioCard.ts';
import { MiniAgentSam } from './web/MiniAgentSam.ts';
import {
  PrimeTechShowcase,
  type ShowcaseGlbModelAsset,
  type ShowcaseTargetTab,
  type ShowcaseWorldPreset,
} from './web/PrimeTechShowcase.ts';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _paintPlane = new THREE.Plane();
const _paintNormal = new THREE.Vector3();
const _paintPoint = new THREE.Vector3();
const _dropGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _dropGroundPoint = new THREE.Vector3();

function detectFormatBadge(filename: string): string {
  const idx = filename.lastIndexOf('.');
  const ext = idx >= 0 ? filename.slice(idx + 1).toLowerCase() : '';
  if (ext === 'ifc') return 'BIM IFC';
  if (ext === 'glb' || ext === 'gltf') return 'GLB / glTF';
  if (['obj', 'stl', 'ply', 'fbx', 'dae'].includes(ext)) return ext.toUpperCase();
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'VIDEO';
  if (['mp3', 'wav', 'ogg', 'm4a', 'opus', 'aac'].includes(ext)) return 'AUDIO';
  if (['srt', 'vtt', 'txt', 'md'].includes(ext)) return 'TRANSCRIPT';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'IMAGE';
  if (ext === 'json') return 'PROJECT / JSON';
  return 'ASSET';
}

export class StudioApp extends xb.Script {
  private audioEngine = new AudioEngine();
  private projectService = new ProjectPersistenceService();
  private stage = new StudioStage();
  private cameraDirector = new CameraDirector();
  private scenery!: SceneryManager;
  private brush!: SpatialBrush;

  // Spatial XR UI cards (visible when entering XR / simulator, kept clear on desktop web)
  private deckCard!: StudioDeckCard;
  private voiceCard!: VoiceStudioCard;
  private hudOverlay!: StudioHudOverlay;
  private deckTransition!: xb.VisibilityTransition;
  private voiceTransition!: xb.VisibilityTransition;

  // Web creative studio shell, showcase & flexible side container
  private miniSam!: MiniAgentSam;
  private showcase!: PrimeTechShowcase;

  private activeSubjectId: StudioSubjectId = 'primetech-cadmesh';
  private activeFinishId: FinishId = 'titanium';
  private activeEnvironmentId: EnvironmentLevelId = 'primetech-vault';
  private activeMoodId: AtmosphereMoodId = 'noir';
  private activeBrushPresetId = 'pbr-brushed-gold';
  private activeDragPbrId: string | null = null;
  private mediaAssets: StudioMediaAsset[] = [];
  private generatedCharacters: CharacterRigSpec[] = [];
  private latestScenePack: ScenePackResult | null = null;
  private studioTemplates: StudioTemplateRecord[] = [];
  private lastAudioBase64: string | null = null;
  private uiValidated = false;
  private framesSinceInit = 0;

  // Desktop pointer/drag/paint & showcase tracking
  private pointerDownPos = new THREE.Vector2();
  private draggingProp = false;
  private paintingWeb = false;
  private dragDepth = 0;
  private movieRunToken = 0;
  private isRestoringManifest = false;
  private autoSaveTimer: number | null = null;
  private viewportObserver: ResizeObserver | null = null;
  private lastHoverNx = 0;
  private lastHoverNy = 0;
  private lastScrollNorm = 0;
  private cleanupListeners: Array<() => void> = [];

  init(): void {
    xb.ui.theme = 'grayGlass';

    this.add(this.stage);
    this.stage.init();
    this.cameraDirector.init(this.stage.isSoftwareGl);

    this.scenery = new SceneryManager(this.stage.materials, this.stage.textures, {
      onSelectionChange: (_item, count) => {
        this.miniSam?.syncSelection(this.scenery.getSelectedObjectDetails(), count);
      },
      onPlacementComplete: () => {
        this.miniSam?.setArmedPlacement(null);
        this.audioEngine.playStudioCue('select');
        this.recordProjectMutation();
      },
      onMutation: () => {
        this.recordProjectMutation();
      },
    });
    this.add(this.scenery);
    this.scenery.seedStarterScenery();

    const defaultBrushMat =
      this.stage.materials.createProceduralPbrMaterialById(this.activeBrushPresetId) ||
      this.stage.materials.paintRibbon;
    this.brush = new SpatialBrush(defaultBrushMat, (count) => {
      this.deckCard?.setStrokeCount(count);
      this.miniSam?.syncBrushState(this.brush.enabled, count);
    });
    this.brush.setActiveMaterial(defaultBrushMat, this.activeBrushPresetId);
    this.add(this.brush);

    this.setupXrSpatialUi();
    this.setupMiniAgentSam();
    this.setupPrimeTechShowcase();
    this.mountCanvasIntoViewport();
    this.attachCanvasInteractions();
    this.attachGlobalDropAndKeys();

    // Restore persisted active project if available, otherwise establish Undo baseline
    const saved = this.projectService.loadActiveFromStorage();
    if (saved) {
      this.applyManifest(saved, false);
    } else {
      this.stage.setEnvironmentLevel(this.activeEnvironmentId);
      this.stage.setAtmosphereMood(this.activeMoodId, true);
      this.stage.setSubject(this.activeSubjectId);
      this.stage.setFinish(this.activeFinishId);
      const initialSky = this.stage.setSkyTriggerMode('hover-reactive');
      this.cameraDirector.goToShot('establishing', 'cut');
      this.miniSam.syncEnvironment(this.activeEnvironmentId);
      this.miniSam.syncSubject(this.activeSubjectId);
      this.miniSam.syncFinish(this.activeFinishId);
      this.miniSam.syncMood(this.activeMoodId);
      this.miniSam.syncSkyConfig(initialSky);
      this.miniSam.syncLightingState(this.stage.getLightingState());
      this.projectService.replaceBaseline(this.captureManifest());
    }
    if (this.showcase.isOpen()) {
      this.applyShowcaseWorld(this.showcase.getActiveWorld());
      this.cameraDirector.goToShot('establishing', 'cut');
    }
    this.miniSam.syncSavedSlots(this.projectService.listSavedSlots());
    this.miniSam.syncHistoryState(
      this.projectService.canUndo(),
      this.projectService.canRedo()
    );
    void this.refreshStudioTemplates();

    this.audioEngine.playStudioCue('ready');
  }

  private mountCanvasIntoViewport(): void {
    const syncViewportSize = () => {
      if (xb.core.renderer?.xr?.isPresenting) return;
      const renderer = xb.core.renderer;
      const targetHost = this.getActiveViewportHost();
      if (!renderer || !targetHost) return;
      const camera = xb.core.camera as THREE.PerspectiveCamera | undefined;
      const w = Math.max(1, Math.floor(targetHost.clientWidth));
      const h = Math.max(1, Math.floor(targetHost.clientHeight));
      if (camera && 'aspect' in camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if ('setSize' in renderer && typeof renderer.setSize === 'function') {
        renderer.setSize(w, h, false);
      }
    };

    const onWindowResize = () => {
      window.requestAnimationFrame(syncViewportSize);
    };
    window.addEventListener('resize', onWindowResize);

    this.syncCanvasMount();

    this.cleanupListeners.push(() => {
      this.viewportObserver?.disconnect();
      this.viewportObserver = null;
      window.removeEventListener('resize', onWindowResize);
    });
  }

  private getActiveViewportHost(): HTMLElement {
    if (this.showcase?.isOpen()) {
      return this.showcase.getHeroViewportElement();
    }
    return this.miniSam.getViewportElement();
  }

  private syncCanvasMount(): void {
    const renderer = xb.core.renderer;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement) return;
    const canvas = renderer.domElement;
    const host = this.getActiveViewportHost();
    if (!host) return;

    if (canvas.parentElement !== host) {
      host.prepend(canvas);
    }

    const showcaseOpen = Boolean(this.showcase?.isOpen());
    this.cameraDirector.setShowcaseMode(showcaseOpen);
    this.stage.setHeroPresentationMode(
      showcaseOpen,
      showcaseOpen ? this.showcase.getActiveWorld().heroAssetMode : undefined
    );

    this.viewportObserver?.disconnect();
    const syncSize = () => {
      if (xb.core.renderer?.xr?.isPresenting) return;
      const camera = xb.core.camera as THREE.PerspectiveCamera | undefined;
      const w = Math.max(1, Math.floor(host.clientWidth));
      const h = Math.max(1, Math.floor(host.clientHeight));
      if (w <= 1 || h <= 1) return;
      if (camera && 'aspect' in camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if ('setSize' in renderer && typeof renderer.setSize === 'function') {
        renderer.setSize(w, h, false);
      }
    };
    this.viewportObserver = new ResizeObserver(() => syncSize());
    this.viewportObserver.observe(host);
    window.requestAnimationFrame(syncSize);
  }

  private setupXrSpatialUi(): void {
    this.deckCard = new StudioDeckCard({
      onSelectSubject: (id) => this.handleSelectSubject(id),
      onSelectFinish: (id) => this.handleSelectFinish(id),
      onExplodeChange: (value) => {
        this.stage.setExplodeAmount(value);
        this.miniSam.syncStageDynamics(value, this.stage.getSpinSpeed());
        this.recordProjectMutation();
      },
      onSpinChange: (value) => {
        this.stage.setSpinSpeed(value);
        this.miniSam.syncStageDynamics(this.stage.getExplodeAmount(), value);
        this.recordProjectMutation();
      },
      onLightAngleChange: (rad) => {
        this.stage.setKeyLightAngle(rad);
        this.recordProjectMutation();
      },
      onToggleBrush: (enabled) => this.handleToggleBrush(enabled),
      onClearBrush: () => this.handleClearBrush(),
      onResetStudio: () => this.handleResetStudio(),
    });
    this.deckCard.position.set(-0.78, 1.38, -1.08);
    this.deckCard.rotation.y = 0.38;
    this.deckTransition = new xb.VisibilityTransition({ duration: 0.24 });
    this.deckCard.add(this.deckTransition);
    this.deckCard.visible = false;
    this.add(this.deckCard);

    this.voiceCard = new VoiceStudioCard({
      onSynthesize: (req) => this.handleSynthesize(req),
      onStopAudio: () => this.handleStopAudio(),
      onDownloadAudio: () => this.handleDownloadAudio(),
      onAssistScript: (mode) => this.handleAssistScript(mode),
    });
    this.voiceCard.position.set(0.8, 1.38, -1.08);
    this.voiceCard.rotation.y = -0.38;
    this.voiceTransition = new xb.VisibilityTransition({ duration: 0.24 });
    this.voiceCard.add(this.voiceTransition);
    this.voiceCard.visible = false;
    this.add(this.voiceCard);

    this.hudOverlay = new StudioHudOverlay({
      onTogglePanels: (visible) => this.setPanelsVisible(visible),
      onQuickSpeak: () => void this.handleQuickSpeak(),
    });
    this.hudOverlay.visible = false;
    this.add(this.hudOverlay);
    this.refreshHudSummary();
  }

  private setupMiniAgentSam(): void {
    this.miniSam = new MiniAgentSam({
      onSelectSubject: (id) => this.handleSelectSubject(id),
      onSelectFinish: (id) => this.handleSelectFinish(id),
      onSelectEnvironment: (id) => this.handleSelectEnvironment(id),
      onSelectMood: (id) => this.handleSelectMood(id),
      onExplodeChange: (value) => {
        this.stage.setExplodeAmount(value);
        this.recordProjectMutation();
      },
      onSpinChange: (value) => {
        this.stage.setSpinSpeed(value);
        this.recordProjectMutation();
      },
      onLightAngleChange: (rad) => {
        this.stage.setKeyLightAngle(rad);
        this.recordProjectMutation();
      },
      onKeyIntensityChange: (value) => {
        this.stage.setKeyLightIntensity(value);
        this.recordProjectMutation();
      },
      onAmbientColorChange: (hue, sat) => {
        this.stage.setAmbientColorHsl(hue, sat);
        this.recordProjectMutation();
      },
      onAmbientIntensityChange: (value) => {
        this.stage.setAmbientIntensity(value);
        this.recordProjectMutation();
      },
      onShadowSoftnessChange: (value) => {
        this.stage.setShadowSoftness(value);
        this.recordProjectMutation();
      },
      onResetLighting: () => {
        this.stage.resetLighting();
        this.miniSam.syncLightingState(this.stage.getLightingState());
        this.audioEngine.playStudioCue('select');
        this.recordProjectMutation();
      },
      onToggleBrush: (enabled) => this.handleToggleBrush(enabled),
      onClearBrush: () => this.handleClearBrush(),
      onResetStudio: () => this.handleResetStudio(),
      onArmProp: (propType: SceneryPropType) => {
        this.scenery.armPropPlacement(propType);
      },
      onCancelArm: () => {
        this.scenery.clearArmedPlacement();
      },
      onImportFiles: (files) => this.handleImportFiles(files),
      onPlaceMediaAsset: (assetId) => this.handlePlaceMediaAsset(assetId),
      onArmImageInScene: (asset) => {
        this.scenery.armImagePlacement(asset);
      },
      onPlayMediaAudio: (assetId) => this.handlePlayMediaAudio(assetId),
      onApplyTranscript: (assetId, asBeats) => this.handleApplyTranscript(assetId, asBeats),
      onRemoveMediaAsset: (assetId) => this.handleRemoveMediaAsset(assetId),
      onInspectorChange: (patch) => {
        this.scenery.setSelectedTransform(patch);
      },
      onToggleVideoPlay: () => {
        this.scenery.toggleSelectedVideoPlay();
      },
      onToggleVideoMute: () => {
        this.scenery.toggleSelectedVideoMute();
      },
      onSelectAnimClip: (index) => {
        this.scenery.selectAnimationClip(index);
      },
      onToggleAnimPlay: () => {
        this.scenery.toggleAnimationPlay();
      },
      onRotateSelectedProp: () => {
        this.scenery.rotateSelected(Math.PI / 4);
        this.audioEngine.playStudioCue('select');
      },
      onDeleteSelectedProp: () => {
        this.scenery.deleteSelected();
        this.audioEngine.playStudioCue('select');
      },
      onFocusSelectedProp: () => {
        const sel = this.scenery.getSelectedItem();
        if (sel) {
          this.cameraDirector.focusOnWorldPoint(sel.group.position, 'glide');
        }
      },
      onClearScenery: () => {
        this.scenery.clearAll();
        this.audioEngine.playStudioCue('select');
      },
      onCameraShot: (shot: CameraShotId, transition: TransitionType) => {
        this.stage.triggerTransitionEffect(transition);
        this.cameraDirector.goToShot(shot, transition);
        this.audioEngine.playStudioCue('switch');
      },
      onToggleAutoTour: (enabled) => {
        this.cameraDirector.setAutoTour(enabled);
      },
      onPreviewBeat: (beat) => this.applyBeatVisuals(beat),
      onComposeStory: async (prompt, images) => {
        return composeWithMiniAgentSam({
          prompt,
          subjectId: this.activeSubjectId,
          mood: this.activeMoodId,
          images,
        });
      },
      onPlayMovie: (beats, startIndex) => void this.playMovie(beats, startIndex),
      onStopMovie: () => this.stopMovie(),
      onSpeakBeat: async (beat) => {
        this.miniSam.setSubtitle(`${beat.title} — ${beat.script}`);
        if (beat.audioAssetId) {
          this.handlePlayMediaAudio(beat.audioAssetId);
          return;
        }
        const req = this.buildTtsRequestForBeat(beat);
        await this.handleSynthesize(req);
      },
      onSynthesizeStandalone: (req) => this.handleSynthesize(req),
      onStopAudio: () => this.handleStopAudio(),
      onDownloadAudio: () => this.handleDownloadAudio(),
      onVolumeChange: (vol) => {
        this.audioEngine.setVolume(vol);
        this.recordProjectMutation();
      },
      onToggleMute: () => {
        const nextMuted = !this.audioEngine.isMuted();
        this.audioEngine.setMuted(nextMuted);
        this.miniSam.syncVolumeState(this.audioEngine.getVolume(), nextMuted);
        this.recordProjectMutation();
      },
      onAssistScript: (mode) => this.handleAssistScript(mode),
      onExportScene: () => this.handleExportScene(),
      onExportProjectBundle: () => this.handleExportProjectBundle(),
      onExportIamScene: () => this.handleExportIamScene(),
      onSaveProjectSlot: (name) => this.handleSaveProjectSlot(name),
      onLoadProjectSlot: (id) => this.handleLoadProjectSlot(id),
      onDeleteProjectSlot: (id) => {
        this.projectService.deleteSavedSlot(id);
        this.miniSam.syncSavedSlots(this.projectService.listSavedSlots());
        this.miniSam.showToast('Deleted project slot.');
      },
      onUndo: () => this.handleUndo(),
      onRedo: () => this.handleRedo(),
      onProjectStateChange: () => this.recordProjectMutation(),
      onEnterXr: () => this.handleEnterXr(),
      onSelectBrushPbrPreset: (presetId) => this.handleSelectBrushPbrPreset(presetId),
      onStartPbrDrag: (presetId) => {
        this.activeDragPbrId = presetId;
        if (!presetId) {
          this.miniSam.setViewportDropHint(null);
        }
      },
      onApplyPbrToAllStrokes: (presetId) => this.handleApplyPbrToAllStrokes(presetId),
      onApplyPbrToSubject: (presetId) => this.handleApplyPbrToSubject(presetId),
      onAddSampleSculpt: (presetId) => this.handleAddSampleSculpt(presetId),
      onSelectSkyPreset: (presetId: SkyPresetId) => {
        const cfg = this.stage.setSkyPreset(presetId);
        this.miniSam.syncSkyConfig(cfg);
        this.audioEngine.playStudioCue('switch');
        this.miniSam.showToast(`Sky Dome: ${cfg.title}`);
        this.recordProjectMutation();
      },
      onUpdateSkyConfig: (patch: Partial<SkySceneConfig>) => {
        const cfg = this.stage.applySkyConfig(patch, true);
        this.miniSam.syncSkyConfig(cfg);
        this.recordProjectMutation();
      },
      onSetSkyTriggerMode: (mode: SkyTriggerMode) => {
        const cfg = this.stage.setSkyTriggerMode(mode);
        this.miniSam.syncSkyConfig(cfg);
        this.audioEngine.playStudioCue('select');
        this.recordProjectMutation();
      },
      onSaveSkyTemplate: () => this.handleSaveSkyTemplate(),
      onGenerateCharacter: (params) => this.handleGenerateCharacter(params),
      onPlaceCharacter: (character) => {
        const item = this.scenery.placeCharacterRig(character);
        this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
        this.audioEngine.playStudioCue('ready');
        this.miniSam.showToast(`Placed 3D cartoon actor "${character.name}" on stage.`);
      },
      onSpeakCharacterIntro: async (character) => {
        await this.handleSynthesize({
          mode: 'single',
          text: character.introScript,
          voiceName: character.voiceName,
          stylePrompt: character.voiceStyle,
        });
      },
      onExtractVideoScenePack: (params) => this.handleExtractVideoScenePack(params),
      onApplyScenePack: (pack) => this.applyScenePack(pack),
      onPreviewCameraKeyframe: (kf) => this.previewExtractedCameraKeyframe(kf),
      onRefreshTemplates: (filters) => this.refreshStudioTemplates(filters),
      onApplyTemplateRecord: (tpl) => this.handleApplyTemplateRecord(tpl),
      onDeleteTemplateRecord: (id) => this.handleDeleteTemplateRecord(id),
      onExportTemplatesSql: () => this.handleExportTemplatesSql(),
      onOpenShowcase: () => {
        this.showcase?.show();
      },
    });

    this.miniSam.syncSelection(null, this.scenery.getItemCount());
    this.miniSam.syncStandaloneScript(SUBJECT_MAP[this.activeSubjectId].defaultSingleScript);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncEnvironment(this.activeEnvironmentId);
    this.miniSam.syncSkyConfig(this.stage.getSkyConfig());
    this.miniSam.syncBrushPreset(this.activeBrushPresetId);
    this.miniSam.syncBrushState(this.brush.enabled, this.brush.strokeCount);
    this.miniSam.syncVolumeState(this.audioEngine.getVolume(), this.audioEngine.isMuted());
  }

  private setupPrimeTechShowcase(): void {
    this.showcase = new PrimeTechShowcase({
      onOpenStudio: (options) => this.handleLaunchFromShowcase(options),
      onSelectHeroWorld: (world) => this.applyShowcaseWorld(world),
      onLoadGlbInStudio: (asset) => void this.handleLoadGlbFromShowcase(asset),
      onToggleHeroExplode: (exploded) => {
        this.stage.setExplodeAmount(exploded ? 0.65 : 0);
        this.miniSam.syncStageDynamics(exploded ? 0.65 : 0, this.stage.getSpinSpeed());
        this.audioEngine.playStudioCue('select');
      },
      onResetHeroCamera: () => {
        this.cameraDirector.goToShot('establishing', 'glide');
        this.audioEngine.playStudioCue('switch');
      },
      onChangeHeroTrigger: (mode) => {
        const cfg = this.stage.setSkyTriggerMode(mode);
        this.miniSam.syncSkyConfig(cfg);
        this.audioEngine.playStudioCue('select');
      },
      onExportIamScene: () => this.handleExportIamScene(),
      onVisibilityChange: () => {
        this.syncCanvasMount();
      },
    });
    this.showcase.show();

    const scrollRoot = this.showcase.getScrollRoot();
    const onShowcaseScroll = () => {
      const maxScroll = Math.max(1, scrollRoot.scrollHeight - scrollRoot.clientHeight);
      const norm = THREE.MathUtils.clamp(scrollRoot.scrollTop / maxScroll, 0, 1);
      this.lastScrollNorm = norm;
      this.stage.setWorldInteraction(this.lastHoverNx, this.lastHoverNy, norm);
      const sky = this.stage.getSkyConfig();
      if (sky.triggerMode === 'scroll-reactive') {
        const updated = this.stage.applySkyConfig({ progression: norm }, false);
        this.miniSam.syncSkyConfig(updated);
      }
    };
    scrollRoot.addEventListener('scroll', onShowcaseScroll, { passive: true });
    this.cleanupListeners.push(() => scrollRoot.removeEventListener('scroll', onShowcaseScroll));
  }

  private async handleLoadGlbFromShowcase(asset: ShowcaseGlbModelAsset): Promise<void> {
    this.showcase.hide();
    this.syncCanvasMount();
    this.stage.setEnvironmentLevel('studio-stage');
    this.activeEnvironmentId = 'studio-stage';
    this.stage.setAtmosphereMood('studio', true);
    this.activeMoodId = 'studio';
    this.miniSam.syncEnvironment('studio-stage');
    this.miniSam.syncMood('studio');
    this.miniSam.showToast(`Importing binary .glb model: ${asset.filename}...`);

    try {
      const resp = await fetch(asset.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${asset.url}`);
      const blob = await resp.blob();
      const file = new File([blob], asset.filename, { type: 'model/gltf-binary' });
      await this.handleImportFiles([file]);
      this.miniSam.openTab('scenery', window.innerWidth > 720);
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : `Failed to load ${asset.filename}`
      );
    }
  }

  private applyShowcaseWorld(world: ShowcaseWorldPreset): void {
    this.activeEnvironmentId = world.environmentId;
    this.stage.setEnvironmentLevel(world.environmentId);
    this.stage.setHeroPresentationMode(Boolean(this.showcase?.isOpen()), world.heroAssetMode);
    this.miniSam.syncEnvironment(world.environmentId);

    const envPreset = ENVIRONMENT_LEVEL_MAP[world.environmentId];
    const nextMood = envPreset?.defaultMood || 'noir';
    this.activeMoodId = nextMood;
    this.stage.setAtmosphereMood(nextMood);
    this.miniSam.syncMood(nextMood);
    this.miniSam.syncLightingState(this.stage.getLightingState());

    this.handleSelectSubject(world.subjectId);
    const nextFinish: FinishId =
      world.subjectId === 'primetech-plinth'
        ? 'titanium'
        : world.environmentId === 'iamscene-circuit'
          ? 'iridescent'
          : 'obsidian';
    this.handleSelectFinish(nextFinish);

    const skyCfg = this.stage.setSkyTriggerMode(world.triggerMode);
    this.miniSam.syncSkyConfig(skyCfg);

    this.cameraDirector.goToShot('establishing', 'glide');
    this.audioEngine.playStudioCue('switch');
  }

  private handleLaunchFromShowcase(options?: {
    worldId?: string;
    subjectId?: StudioSubjectId;
    environmentId?: EnvironmentLevelId;
    tab?: ShowcaseTargetTab;
  }): void {
    this.showcase.hide();
    this.syncCanvasMount();

    const envId: EnvironmentLevelId = options?.environmentId || 'primetech-vault';
    if (options?.subjectId && SUBJECT_MAP[options.subjectId]) {
      this.activeEnvironmentId = envId;
      this.stage.setEnvironmentLevel(envId);
      this.miniSam.syncEnvironment(envId);

      const mood = ENVIRONMENT_LEVEL_MAP[envId]?.defaultMood || 'noir';
      this.activeMoodId = mood;
      this.stage.setAtmosphereMood(mood, true);
      this.miniSam.syncMood(mood);
      this.miniSam.syncLightingState(this.stage.getLightingState());

      this.handleSelectSubject(options.subjectId);
      const nextFinish: FinishId =
        options.subjectId === 'primetech-plinth'
          ? 'titanium'
          : envId === 'iamscene-circuit'
            ? 'iridescent'
            : 'obsidian';
      this.handleSelectFinish(nextFinish);

      this.cameraDirector.goToShot('hero', 'glide');
      this.miniSam.showToast(
        `Loaded ${SUBJECT_MAP[options.subjectId].label} inside ${
          ENVIRONMENT_LEVEL_MAP[envId]?.label || 'PrimeTech Vault'
        }.`
      );
    }

    if (options?.tab) {
      const expand = window.innerWidth > 720;
      this.miniSam.openTab(options.tab, expand);
    }
  }

  private captureManifest(): SamSceneProjectManifest {
    const story = this.miniSam.getStoryboardBeats();
    const voice = this.miniSam.getVoiceState();
    const cam = this.cameraDirector.getCameraState();
    const savedImages = this.mediaAssets
      .filter((a) => a.category === 'image' && Boolean(a.dataUrl))
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        dataUrl: a.dataUrl || '',
        width: a.width || 800,
        height: a.height || 600,
      }));

    return {
      version: 1,
      projectName: story.movieTitle,
      updatedAt: Date.now(),
      subjectId: this.activeSubjectId,
      finishId: this.activeFinishId,
      environmentId: this.activeEnvironmentId,
      moodId: this.activeMoodId,
      skyConfig: this.stage.getSkyConfig(),
      explodeAmount: this.stage.getExplodeAmount(),
      spinSpeed: this.stage.getSpinSpeed(),
      lighting: this.stage.getLightingState(),
      cameraPosition: cam.position,
      cameraTarget: cam.target,
      movieTitle: story.movieTitle,
      beats: story.beats,
      activeBeatIndex: story.activeBeatIndex,
      voiceState: voice,
      sceneryItems: this.scenery.serializeItems(),
      savedImages,
    };
  }

  private applyManifest(manifest: SamSceneProjectManifest, pushUndo: boolean): void {
    this.isRestoringManifest = true;
    try {
      if (manifest.subjectId && SUBJECT_MAP[manifest.subjectId]) {
        this.activeSubjectId = manifest.subjectId;
        this.stage.setSubject(manifest.subjectId);
        this.deckCard?.setActiveSubject(manifest.subjectId);
        this.miniSam.syncSubject(manifest.subjectId);
      }
      if (manifest.finishId && FINISH_MAP[manifest.finishId]) {
        this.activeFinishId = manifest.finishId;
        this.stage.setFinish(manifest.finishId);
        this.deckCard?.setActiveFinish(manifest.finishId);
        this.miniSam.syncFinish(manifest.finishId);
      }
      if (manifest.environmentId && ENVIRONMENT_LEVEL_MAP[manifest.environmentId]) {
        this.activeEnvironmentId = manifest.environmentId;
        this.stage.setEnvironmentLevel(manifest.environmentId);
        this.miniSam.syncEnvironment(manifest.environmentId);
      }
      if (manifest.moodId) {
        this.activeMoodId = manifest.moodId;
        this.stage.setAtmosphereMood(manifest.moodId, true);
        this.miniSam.syncMood(manifest.moodId);
      }
      if (manifest.skyConfig) {
        const appliedSky = this.stage.applySkyConfig(manifest.skyConfig, true);
        this.miniSam.syncSkyConfig(appliedSky);
      }
      if (manifest.lighting) {
        this.stage.applyLightingState(manifest.lighting);
        this.miniSam.syncLightingState(manifest.lighting);
      }
      if (manifest.explodeAmount !== undefined) {
        this.stage.setExplodeAmount(manifest.explodeAmount);
      }
      if (manifest.spinSpeed !== undefined) {
        this.stage.setSpinSpeed(manifest.spinSpeed);
      }
      this.miniSam.syncStageDynamics(
        this.stage.getExplodeAmount(),
        this.stage.getSpinSpeed()
      );

      if (manifest.cameraPosition && manifest.cameraTarget) {
        this.cameraDirector.setCameraState(manifest.cameraPosition, manifest.cameraTarget);
      }

      if (Array.isArray(manifest.savedImages)) {
        for (const img of manifest.savedImages) {
          if (!this.mediaAssets.some((a) => a.id === img.id)) {
            this.mediaAssets.push({
              id: img.id,
              category: 'image',
              name: img.name,
              mimeType: img.mimeType,
              sizeBytes: img.dataUrl.length,
              createdAt: manifest.updatedAt || Date.now(),
              dataUrl: img.dataUrl,
              width: img.width,
              height: img.height,
            });
          }
        }
        this.miniSam.syncMediaAssets(this.mediaAssets);
      }

      if (Array.isArray(manifest.sceneryItems)) {
        this.scenery.restoreSerializedItems(manifest.sceneryItems, this.mediaAssets);
      }

      this.miniSam.setMovieTitle(manifest.movieTitle || manifest.projectName);
      if (Array.isArray(manifest.beats) && manifest.beats.length > 0) {
        this.miniSam.setStoryboardBeats(manifest.beats, manifest.activeBeatIndex || 0);
      }
      if (manifest.voiceState) {
        this.audioEngine.setVolume(manifest.voiceState.volume ?? 0.92);
        this.audioEngine.setMuted(Boolean(manifest.voiceState.muted));
        this.miniSam.applyVoiceState(manifest.voiceState);
      }
      this.refreshHudSummary();
    } finally {
      this.isRestoringManifest = false;
    }

    const synced = this.captureManifest();
    if (pushUndo) {
      this.projectService.pushSnapshot(synced);
    } else {
      this.projectService.replaceBaseline(synced);
    }
    this.projectService.saveActiveToStorage(synced);
    this.miniSam.syncHistoryState(
      this.projectService.canUndo(),
      this.projectService.canRedo()
    );
  }

  private recordProjectMutation(): void {
    if (this.isRestoringManifest) return;
    if (this.autoSaveTimer !== null) {
      window.clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = window.setTimeout(() => {
      this.autoSaveTimer = null;
      const snapshot = this.captureManifest();
      this.projectService.pushSnapshot(snapshot);
      this.projectService.saveActiveToStorage(snapshot);
      this.miniSam.syncHistoryState(
        this.projectService.canUndo(),
        this.projectService.canRedo()
      );
    }, 140);
  }

  private handleUndo(): void {
    const prev = this.projectService.undo();
    if (!prev) return;
    this.applyManifest(prev, false);
    this.audioEngine.playStudioCue('select');
    this.miniSam.showToast('Undid last change.');
  }

  private handleRedo(): void {
    const next = this.projectService.redo();
    if (!next) return;
    this.applyManifest(next, false);
    this.audioEngine.playStudioCue('select');
    this.miniSam.showToast('Redid change.');
  }

  private handleExportProjectBundle(): void {
    const manifest = this.captureManifest();
    const { filename, byteLength } = this.projectService.downloadProjectBundle(manifest);
    const kb = Math.max(1, Math.round(byteLength / 1024));
    this.audioEngine.playStudioCue('ready');
    this.miniSam.showToast(`Saved project bundle ${filename} (${kb} KB)`);
  }

  private handleSaveProjectSlot(name: string): void {
    const manifest = this.captureManifest();
    const slot = this.projectService.saveNamedSlot(name, manifest);
    this.miniSam.syncSavedSlots(this.projectService.listSavedSlots());
    this.miniSam.showToast(`Saved project "${slot.name}" locally.`);
  }

  private handleLoadProjectSlot(id: string): void {
    const slot = this.projectService.listSavedSlots().find((s) => s.id === id);
    if (!slot) return;
    this.applyManifest(slot.manifest, true);
    this.audioEngine.playStudioCue('ready');
    this.miniSam.showToast(`Loaded project "${slot.name}".`);
  }

  private async handleImportFiles(
    files: File[],
    dropFloorPoint?: THREE.Vector3
  ): Promise<void> {
    const total = files.length;
    if (total === 0) return;

    const yieldToPaint = () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      });

    try {
      for (let idx = 0; idx < total; idx++) {
        const file = files[idx];
        const formatLabel = detectFormatBadge(file.name);
        const setStage = (stage: string) => {
          this.miniSam.setIngestionProgress({
            active: true,
            currentFile: file.name,
            formatLabel,
            stage,
            completed: idx,
            total,
          });
        };

        setStage('Reading file & preparing parser...');
        await yieldToPaint();

        try {
          const lower = file.name.toLowerCase();
          if (lower.endsWith('.samscene.json')) {
            setStage('Restoring SamScene project manifest...');
            const text = await file.text();
            const manifest = this.projectService.parseProjectJson(text);
            this.applyManifest(manifest, true);
            this.audioEngine.playStudioCue('ready');
            this.miniSam.showToast(`Opened SamScene project: ${manifest.projectName}`);
            continue;
          }

          if (lower.endsWith('.iamscene.json')) {
            setStage('Parsing declarative iamscene.v1 scene document...');
            const text = await file.text();
            const doc = JSON.parse(text) as IamSceneDocument;
            if (doc && doc.schemaVersion === 'iamscene.v1') {
              if (doc.environmentId && ENVIRONMENT_LEVEL_MAP[doc.environmentId]) {
                this.handleSelectEnvironment(doc.environmentId);
              }
              if (doc.subjectId && SUBJECT_MAP[doc.subjectId]) {
                this.handleSelectSubject(doc.subjectId);
              }
              if (doc.finishId && FINISH_MAP[doc.finishId]) {
                this.handleSelectFinish(doc.finishId);
              }
              if (doc.triggerMode) {
                const cfg = this.stage.setSkyTriggerMode(doc.triggerMode);
                this.miniSam.syncSkyConfig(cfg);
              }
              this.audioEngine.playStudioCue('ready');
              this.miniSam.showToast(
                `Loaded portable IAMScene v1: "${doc.name}" (${doc.nodes?.length || 0} nodes).`
              );
              continue;
            }
          }

          if (lower.endsWith('.json')) {
            const rawText = await file.text();
            try {
              const parsed = JSON.parse(rawText) as {
                version?: number;
                schemaVersion?: string;
                beats?: unknown;
              };
              if (parsed?.schemaVersion === 'iamscene.v1') {
                const doc = parsed as unknown as IamSceneDocument;
                if (doc.environmentId && ENVIRONMENT_LEVEL_MAP[doc.environmentId]) {
                  this.handleSelectEnvironment(doc.environmentId);
                }
                if (doc.subjectId && SUBJECT_MAP[doc.subjectId]) {
                  this.handleSelectSubject(doc.subjectId);
                }
                this.audioEngine.playStudioCue('ready');
                this.miniSam.showToast(`Loaded IAMScene document: ${doc.name}`);
                continue;
              }
              if (parsed && parsed.version === 1 && Array.isArray(parsed.beats)) {
                setStage('Restoring SamScene project manifest...');
                const manifest = this.projectService.parseProjectJson(rawText);
                this.applyManifest(manifest, true);
                this.audioEngine.playStudioCue('ready');
                this.miniSam.showToast(`Opened SamScene project: ${manifest.projectName}`);
                continue;
              }
            } catch {
              // Treat as transcript JSON
            }
          }

          const asset = await ingestStudioFile(file, this.audioEngine, setStage);
          setStage('Registering in Asset Registry & staging 3D scene...');
          this.mediaAssets.unshift(asset);
          this.miniSam.syncMediaAssets(this.mediaAssets);

          const offsetDropPoint = dropFloorPoint
            ? new THREE.Vector3(
                dropFloorPoint.x + (idx % 3) * 0.65,
                0,
                dropFloorPoint.z + Math.floor(idx / 3) * 0.65
              )
            : undefined;

          if (asset.category === 'image' && asset.dataUrl) {
            const item = this.scenery.placeImageBackdrop(
              {
                id: asset.id,
                name: asset.name,
                mimeType: asset.mimeType,
                dataUrl: asset.dataUrl,
                width: asset.width || 800,
                height: asset.height || 600,
              },
              offsetDropPoint
            );
            this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
            this.audioEngine.playStudioCue('ready');
            this.miniSam.showToast(`Placed 3D image backdrop: ${asset.name}`);
          } else if (asset.category === 'video') {
            const item = this.scenery.placeVideoScreen(asset, offsetDropPoint);
            this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
            this.audioEngine.playStudioCue('ready');
            const kfCount = asset.extractedKeyframes?.length || 0;
            this.miniSam.showToast(
              `Placed 3D video screen: ${asset.name}${
                kfCount > 0 ? ` — Parsing ${kfCount} keyframes into Scene Pack...` : ''
              }`
            );
            if (kfCount > 0) {
              void this.handleExtractVideoScenePack({
                assetId: asset.id,
                prompt: `Extract textures, camera paths, sky dome, and character poses from ${asset.name}`,
                generateCoverArt: true,
                generateAnimationVideo: false,
              });
            }
          } else if (asset.category === 'model' || asset.category === 'bim') {
            const item = this.scenery.placeImportedModelAsset(asset, offsetDropPoint);
            if (item) {
              this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
            }
            this.audioEngine.playStudioCue('ready');
            const summaryMsg =
              asset.category === 'bim' && asset.bimSummary
                ? `Loaded BIM ${asset.bimSummary.schema} (${asset.bimSummary.totalElements} elements): ${asset.name}`
                : `Imported ${asset.modelStats?.format || '3D'} model (${asset.modelStats?.meshCount || 1} meshes): ${asset.name}`;
            this.miniSam.showToast(summaryMsg);
          } else if (asset.category === 'audio') {
            this.audioEngine.playStudioCue('ready');
            this.miniSam.showToast(
              `Imported audio "${asset.name}" (${asset.durationSec || 0}s) — ready in SamSpeak & Beats.`
            );
          } else if (asset.category === 'transcript') {
            this.handleApplyTranscript(asset.id, false);
          }
        } catch (err) {
          this.miniSam.showToast(
            err instanceof Error ? err.message : `Failed to import ${file.name}`
          );
        }
      }
    } finally {
      this.miniSam.setIngestionProgress(null);
    }
  }

  private handlePlaceMediaAsset(assetId: string): void {
    const asset = this.mediaAssets.find((a) => a.id === assetId);
    if (!asset) return;

    if (asset.category === 'image' && asset.dataUrl) {
      this.scenery.armImagePlacement({
        id: asset.id,
        name: asset.name,
        mimeType: asset.mimeType,
        dataUrl: asset.dataUrl,
        width: asset.width || 800,
        height: asset.height || 600,
      });
      this.miniSam.setArmedPlacement(asset.name);
      return;
    }

    if (asset.category === 'video') {
      const item = this.scenery.placeVideoScreen(asset);
      this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(`Placed video screen: ${asset.name}`);
      return;
    }

    if (asset.category === 'model' || asset.category === 'bim') {
      const item = this.scenery.placeImportedModelAsset(asset);
      if (item) {
        this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
        this.audioEngine.playStudioCue('ready');
        this.miniSam.showToast(`Placed in 3D: ${asset.name}`);
      }
    }
  }

  private handlePlayMediaAudio(assetId: string): void {
    const asset = this.mediaAssets.find((a) => a.id === assetId);
    if (!asset?.runtimeFileBuffer) return;

    this.miniSam.setStandaloneVoiceState(true, Boolean(this.lastAudioBase64));
    void this.audioEngine
      .playArrayBuffer(asset.runtimeFileBuffer, () => {
        this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
        this.miniSam.showToast(`Finished playing ${asset.name}`);
      })
      .catch((err) => {
        this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
        this.miniSam.showToast(
          err instanceof Error ? err.message : 'Audio decode failed.'
        );
      });
  }

  private handleApplyTranscript(assetId: string, asBeats: boolean): void {
    const asset = this.mediaAssets.find((a) => a.id === assetId);
    if (!asset) return;
    if (asBeats && asset.transcriptCues && asset.transcriptCues.length > 0) {
      const beats = transcriptCuesToBeats(asset.transcriptCues, this.activeMoodId);
      this.miniSam.setStoryboardBeats(beats, 0);
      this.recordProjectMutation();
      this.miniSam.showToast(`Generated ${beats.length} storyboard beats from ${asset.name}`);
      return;
    }
    if (asset.transcriptText) {
      this.miniSam.syncStandaloneScript(asset.transcriptText);
      this.recordProjectMutation();
      this.miniSam.showToast(`Loaded transcript into SamSpeak (${asset.transcriptCues?.length || 0} cues).`);
    }
  }

  private handleRemoveMediaAsset(assetId: string): void {
    const idx = this.mediaAssets.findIndex((a) => a.id === assetId);
    if (idx === -1) return;
    const [removed] = this.mediaAssets.splice(idx, 1);
    if (removed.objectUrl) {
      URL.revokeObjectURL(removed.objectUrl);
    }
    this.miniSam.syncMediaAssets(this.mediaAssets);
    this.recordProjectMutation();
  }

  private attachCanvasInteractions(): void {
    const renderer = xb.core.renderer;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement) return;
    const dom = renderer.domElement;

    const getWebBrushPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const camera = xb.core.camera;
      if (!camera) return null;
      const rect = dom.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      camera.getWorldDirection(_paintNormal).negate();
      _paintPlane.setFromNormalAndCoplanarPoint(
        _paintNormal,
        new THREE.Vector3(STAGE_POSITION.x, 1.15, STAGE_POSITION.z)
      );
      const hit = _raycaster.ray.intersectPlane(_paintPlane, _paintPoint);
      return hit ? hit.clone() : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (xb.core.renderer?.xr?.isPresenting) return;

      this.pointerDownPos.set(e.clientX, e.clientY);

      if (this.brush.enabled) {
        const pt = getWebBrushPoint(e.clientX, e.clientY);
        if (pt) {
          this.paintingWeb = true;
          this.cameraDirector.setDraggingProp(true);
          this.brush.startWebStroke(pt);
        }
        return;
      }

      if (this.scenery.isPlacementArmed) {
        this.cameraDirector.setDraggingProp(true);
        return;
      }

      const hit = this.scenery.hitTestProp(e.clientX, e.clientY);
      if (hit) {
        this.scenery.selectItem(hit.id);
        this.draggingProp = true;
        this.cameraDirector.setDraggingProp(true);
        this.audioEngine.playStudioCue('select');
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.paintingWeb) {
        const pt = getWebBrushPoint(e.clientX, e.clientY);
        if (pt) this.brush.moveWebStroke(pt);
        return;
      }
      if (this.draggingProp) {
        this.scenery.moveSelectedToScreenPoint(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );

      if (this.paintingWeb) {
        this.paintingWeb = false;
        this.brush.endWebStroke();
        this.cameraDirector.setDraggingProp(false);
        return;
      }

      if (this.draggingProp) {
        this.draggingProp = false;
        this.cameraDirector.setDraggingProp(false);
        if (moved >= 3) {
          this.scenery.notifyDragEnded();
        }
        return;
      }

      if (this.scenery.isPlacementArmed) {
        this.cameraDirector.setDraggingProp(false);
        if (moved < 8) {
          this.scenery.handleCanvasClick(e.clientX, e.clientY);
        }
        return;
      }

      if (moved < 5) {
        const hit = this.scenery.hitTestProp(e.clientX, e.clientY);
        if (!hit) {
          this.scenery.selectItem(null);
        }
      }
    };

    const onPointerMoveCanvas = (e: PointerEvent) => {
      if (xb.core.renderer?.xr?.isPresenting) return;
      const rect = dom.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        this.lastHoverNx = nx;
        this.lastHoverNy = ny;
        this.stage.setWorldInteraction(nx, ny, this.lastScrollNorm);
        const sky = this.stage.getSkyConfig();
        if (sky.triggerMode === 'hover-reactive') {
          this.stage.handleSkyPointerHover(nx, ny);
        }
      }
    };

    const onWheelCanvas = (e: WheelEvent) => {
      if (xb.core.renderer?.xr?.isPresenting) return;
      if (this.showcase?.isOpen()) return;
      const sky = this.stage.getSkyConfig();
      if (sky.triggerMode === 'scroll-reactive') {
        const nextProg = this.stage.handleSkyScrollDelta(e.deltaY);
        this.lastScrollNorm = nextProg;
        this.stage.setWorldInteraction(this.lastHoverNx, this.lastHoverNy, nextProg);
        this.miniSam.syncSkyConfig({ ...sky, progression: nextProg });
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMoveCanvas);
    dom.addEventListener('wheel', onWheelCanvas, { passive: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.cleanupListeners.push(() => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMoveCanvas);
      dom.removeEventListener('wheel', onWheelCanvas);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    });
  }

  private getDropFloorPoint(clientX: number, clientY: number): THREE.Vector3 | undefined {
    const viewport = this.miniSam.getViewportElement();
    const camera = xb.core.camera;
    if (!viewport || !camera) return undefined;
    const rect = viewport.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return undefined;
    }

    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);
    const hit = _raycaster.ray.intersectPlane(_dropGroundPlane, _dropGroundPoint);
    if (!hit) return undefined;

    return new THREE.Vector3(
      THREE.MathUtils.clamp(hit.x, STAGE_POSITION.x - 4.2, STAGE_POSITION.x + 4.2),
      0,
      THREE.MathUtils.clamp(hit.z, STAGE_POSITION.z - 4.2, STAGE_POSITION.z + 4.2)
    );
  }

  private raycastPbrTarget(
    clientX: number,
    clientY: number
  ): {
    kind: 'stroke' | 'subject' | 'scenery';
    mesh: THREE.Mesh;
    label: string;
  } | null {
    const viewport = this.miniSam.getViewportElement();
    const camera = xb.core.camera;
    if (!viewport || !camera) return null;
    const rect = viewport.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      return null;
    }

    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);

    const strokeMeshes = this.brush.getStrokeMeshes();
    if (strokeMeshes.length > 0) {
      const strokeHits = _raycaster.intersectObjects(strokeMeshes, false);
      if (strokeHits.length > 0) {
        const mesh = strokeHits[0].object as THREE.Mesh;
        return { kind: 'stroke', mesh, label: mesh.name || 'Sculpted Stroke' };
      }
    }

    const subjectMeshes = this.stage.getSubjectMeshes();
    if (subjectMeshes.length > 0) {
      const subjectHits = _raycaster.intersectObjects(subjectMeshes, false);
      if (subjectHits.length > 0) {
        const mesh = subjectHits[0].object as THREE.Mesh;
        return {
          kind: 'subject',
          mesh,
          label: `${SUBJECT_MAP[this.activeSubjectId].label} Sculpture`,
        };
      }
    }

    const placedMeshes = this.scenery.getPlacedMeshes();
    if (placedMeshes.length > 0) {
      const placedHits = _raycaster.intersectObjects(placedMeshes, false);
      if (placedHits.length > 0) {
        const mesh = placedHits[0].object as THREE.Mesh;
        return { kind: 'scenery', mesh, label: mesh.name || '3D Scene Mesh' };
      }
    }

    return null;
  }

  private applyPbrPresetToRaycastTarget(
    presetId: string,
    clientX: number,
    clientY: number
  ): boolean {
    const preset = PROCEDURAL_PBR_MATERIAL_MAP[presetId];
    if (!preset) return false;

    const target = this.raycastPbrTarget(clientX, clientY);
    if (target?.kind === 'stroke') {
      const mat = this.stage.materials.createProceduralPbrMaterial(preset);
      this.brush.applyMaterialToStroke(target.mesh, mat, preset.id);
      this.handleSelectBrushPbrPreset(preset.id);
      this.audioEngine.playStudioCue('paint');
      this.miniSam.showToast(`Applied ${preset.label} to ${target.label}.`);
      return true;
    }

    if (target?.kind === 'subject') {
      this.stage.applyProceduralMaterialToSubject(preset, target.mesh);
      this.handleSelectBrushPbrPreset(preset.id);
      this.audioEngine.playStudioCue('paint');
      this.miniSam.showToast(`Applied ${preset.label} to ${target.label}.`);
      return true;
    }

    if (target?.kind === 'scenery') {
      target.mesh.material = this.stage.materials.createProceduralPbrMaterial(preset);
      this.handleSelectBrushPbrPreset(preset.id);
      this.audioEngine.playStudioCue('paint');
      this.miniSam.showToast(`Applied ${preset.label} to ${target.label}.`);
      return true;
    }

    // Fallback: if dropped onto open viewport background, apply to brush + centerpiece primary
    this.handleSelectBrushPbrPreset(preset.id);
    if (this.brush.strokeCount > 0) {
      const mat = this.stage.materials.createProceduralPbrMaterial(preset);
      this.brush.applyMaterialToAllStrokes(mat, preset.id);
    }
    this.stage.applyProceduralMaterialToSubject(preset);
    this.audioEngine.playStudioCue('paint');
    this.miniSam.showToast(
      `Armed 3D brush & applied ${preset.label} to centerpiece sculpture.`
    );
    return true;
  }

  private attachGlobalDropAndKeys(): void {
    const hasDraggedFiles = (e: DragEvent): boolean => {
      if ((e.dataTransfer?.files?.length ?? 0) > 0) return true;
      const types = e.dataTransfer?.types;
      return types ? Array.from(types).includes('Files') : false;
    };

    const hasDraggedPbrSwatch = (e: DragEvent): boolean => {
      if (this.activeDragPbrId) return true;
      const types = e.dataTransfer?.types;
      return types ? Array.from(types).includes('application/x-samscene-pbr') : false;
    };

    const onDragEnter = (e: DragEvent) => {
      if (hasDraggedPbrSwatch(e)) return;
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      this.dragDepth++;
      this.miniSam.setDropOverlayVisible(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (hasDraggedPbrSwatch(e)) {
        const viewport = this.miniSam.getViewportElement();
        if (viewport && viewport.contains(e.target as Node)) {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
          const preset = this.activeDragPbrId
            ? PROCEDURAL_PBR_MATERIAL_MAP[this.activeDragPbrId]
            : undefined;
          const hit = this.raycastPbrTarget(e.clientX, e.clientY);
          const presetLabel = preset ? preset.label : 'PBR Material';
          if (hit) {
            this.miniSam.setViewportDropHint(`Drop "${presetLabel}" onto ${hit.label}`);
          } else {
            this.miniSam.setViewportDropHint(
              `Drop "${presetLabel}" onto sculpted stroke or sculpture (or open stage)`
            );
          }
        } else {
          this.miniSam.setViewportDropHint(null);
        }
        return;
      }

      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDragLeave = (e: DragEvent) => {
      if (hasDraggedPbrSwatch(e)) {
        if (e.relatedTarget === null) {
          this.miniSam.setViewportDropHint(null);
        }
        return;
      }
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      if (e.relatedTarget === null) {
        this.dragDepth = 0;
      } else {
        this.dragDepth = Math.max(0, this.dragDepth - 1);
      }
      if (this.dragDepth === 0) {
        this.miniSam.setDropOverlayVisible(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      const pbrId =
        e.dataTransfer?.getData('application/x-samscene-pbr') || this.activeDragPbrId;
      if (pbrId && PROCEDURAL_PBR_MATERIAL_MAP[pbrId]) {
        e.preventDefault();
        this.activeDragPbrId = null;
        this.miniSam.setViewportDropHint(null);
        const viewport = this.miniSam.getViewportElement();
        if (viewport && viewport.contains(e.target as Node)) {
          this.applyPbrPresetToRaycastTarget(pbrId, e.clientX, e.clientY);
        }
        return;
      }

      e.preventDefault();
      this.dragDepth = 0;
      this.miniSam.setDropOverlayVisible(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;
      const dropPoint = this.getDropFloorPoint(e.clientX, e.clientY);
      await this.handleImportFiles(files, dropPoint);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.handleRedo();
        } else {
          this.handleUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.handleRedo();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        this.miniSam.toggleCollapsed();
      } else if (e.key === 'r' || e.key === 'R') {
        this.scenery.rotateSelected(Math.PI / 4);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.scenery.deleteSelected();
      } else if (e.key === 'Escape') {
        this.scenery.clearArmedPlacement();
        this.miniSam.setArmedPlacement(null);
        this.activeDragPbrId = null;
        this.miniSam.setViewportDropHint(null);
        this.stopMovie();
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);

    this.cleanupListeners.push(() => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
    });
  }

  onXRSessionStarted(): void {
    this.deckCard.visible = true;
    this.voiceCard.visible = true;
    this.hudOverlay.visible = true;
  }

  onSimulatorStarted(): void {
    // Keep desktop viewport unobstructed; XR cards only appear in actual WebXR sessions.
  }

  onXRSessionEnded(): void {
    this.deckCard.visible = false;
    this.voiceCard.visible = false;
    this.hudOverlay.visible = false;
  }

  private handleEnterXr(): void {
    const manager = xb.core.webXRSessionManager;
    if (manager && manager.isXRSupported()) {
      manager.startSession();
      return;
    }
    this.miniSam.showToast(
      'No XR headset detected on this browser — full web SamScene 3D mode is active!'
    );
  }

  private handleSelectSubject(id: StudioSubjectId): void {
    this.activeSubjectId = id;
    this.stage.setSubject(id);
    this.deckCard.setActiveSubject(id);
    this.voiceCard.syncSubjectScript(id);
    this.miniSam.syncSubject(id);
    this.miniSam.syncStandaloneScript(SUBJECT_MAP[id].defaultSingleScript);
    this.refreshHudSummary();
    this.audioEngine.playStudioCue('switch');
    this.recordProjectMutation();
  }

  private handleSelectFinish(id: FinishId): void {
    this.activeFinishId = id;
    this.stage.setFinish(id);
    this.deckCard.setActiveFinish(id);
    this.miniSam.syncFinish(id);
    this.refreshHudSummary();
    this.audioEngine.playStudioCue('select');
    this.recordProjectMutation();
  }

  private handleSelectEnvironment(id: EnvironmentLevelId): void {
    this.activeEnvironmentId = id;
    this.stage.setEnvironmentLevel(id);
    const preset = ENVIRONMENT_LEVEL_MAP[id];
    if (preset) {
      this.activeMoodId = preset.defaultMood;
      this.stage.setAtmosphereMood(preset.defaultMood);
      this.miniSam.syncMood(preset.defaultMood);
      this.miniSam.syncLightingState(this.stage.getLightingState());
    }
    this.miniSam.syncEnvironment(id);
    this.refreshHudSummary();
    this.audioEngine.playStudioCue('switch');
    this.miniSam.showToast(`Environment: ${preset.label} (${preset.subtitle})`);
    this.recordProjectMutation();
  }

  private handleSelectMood(id: AtmosphereMoodId): void {
    this.activeMoodId = id;
    this.stage.setAtmosphereMood(id);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood(id);
    this.audioEngine.playStudioCue('select');
    this.recordProjectMutation();
  }

  private handleToggleBrush(enabled: boolean): void {
    this.brush.setEnabled(enabled);
    this.miniSam.syncBrushState(enabled, this.brush.strokeCount);
    this.audioEngine.playStudioCue('paint');
  }

  private handleClearBrush(): void {
    this.brush.clearStrokes();
    this.miniSam.syncBrushState(this.brush.enabled, 0);
    this.audioEngine.playStudioCue('select');
  }

  private handleResetStudio(): void {
    this.stage.resetViewPose();
    this.activeMoodId = ENVIRONMENT_LEVEL_MAP[this.activeEnvironmentId]?.defaultMood || 'studio';
    this.stage.setAtmosphereMood(this.activeMoodId);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood(this.activeMoodId);
    this.miniSam.syncStageDynamics(0, 0.28);
    this.cameraDirector.goToShot('establishing', 'glide');
    this.deckCard.resetSliders();
    this.deckCard.position.set(-0.78, 1.38, -1.08);
    this.deckCard.rotation.set(0, 0.38, 0);
    this.voiceCard.position.set(0.8, 1.38, -1.08);
    this.voiceCard.rotation.set(0, -0.38, 0);
    this.audioEngine.playStudioCue('ready');
    this.recordProjectMutation();
  }

  private setPanelsVisible(visible: boolean): void {
    if (visible) {
      this.deckTransition.show();
      this.voiceTransition.show();
    } else {
      this.deckTransition.hide();
      this.voiceTransition.hide();
    }
    this.audioEngine.playStudioCue('select');
  }

  private refreshHudSummary(): void {
    const subj = SUBJECT_MAP[this.activeSubjectId].label;
    const fin = FINISH_MAP[this.activeFinishId].label;
    const env = ENVIRONMENT_LEVEL_MAP[this.activeEnvironmentId]?.label || 'Soundstage';
    this.hudOverlay.setSummary(`${subj} • ${fin} • ${env}`);
  }

  private applyBeatVisuals(beat: MovieBeat): void {
    this.activeMoodId = beat.mood;
    this.stage.setAtmosphereMood(beat.mood);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood(beat.mood);
    this.stage.setExplodeAmount(beat.explodeAmount);
    this.miniSam.syncStageDynamics(beat.explodeAmount, this.stage.getSpinSpeed());
    if (typeof beat.skyProgression === 'number') {
      const sky = this.stage.applySkyConfig({ progression: beat.skyProgression }, false);
      this.miniSam.syncSkyConfig(sky);
    }
    this.stage.triggerTransitionEffect(beat.transitionType);
    this.cameraDirector.goToShot(beat.cameraShot, beat.transitionType);
  }

  private buildTtsRequestForBeat(beat: MovieBeat): TtsRequest {
    if (beat.ttsMode === 'dual') {
      return {
        mode: 'dual',
        text: beat.script,
        speakerA: 'Alex',
        speakerB: 'Sam',
        voiceA: beat.voiceName === 'Puck' ? 'Kore' : 'Puck',
        voiceB: beat.voiceName,
        styleA: beat.voiceStyle || 'Enthusiastic creative director',
        styleB: 'Curious spatial designer',
      };
    }
    return {
      mode: 'single',
      text: beat.script,
      voiceName: beat.voiceName,
      stylePrompt: beat.voiceStyle,
    };
  }

  private async playMovie(beats: MovieBeat[], startIndex = 0): Promise<void> {
    if (beats.length === 0) return;
    const token = ++this.movieRunToken;
    this.audioEngine.stop();

    for (let i = Math.max(0, startIndex); i < beats.length; i++) {
      if (token !== this.movieRunToken) return;
      const beat = beats[i];
      this.miniSam.setMoviePlaybackState(true, i);
      this.applyBeatVisuals(beat);
      this.miniSam.setSubtitle(`${beat.title} — ${beat.script}`);

      if (beat.muted) {
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, Math.max(1500, (beat.durationSec || 3) * 1000))
        );
      } else if (beat.audioAssetId) {
        const audioAsset = this.mediaAssets.find((a) => a.id === beat.audioAssetId);
        if (audioAsset?.runtimeFileBuffer) {
          this.miniSam.setStandaloneVoiceState(true, Boolean(this.lastAudioBase64));
          await new Promise<void>((resolve) => {
            void this.audioEngine
              .playArrayBuffer(audioAsset.runtimeFileBuffer!, () => resolve())
              .catch(() => resolve());
          });
        }
      } else {
        try {
          const res = await synthesizeSpeech(this.buildTtsRequestForBeat(beat));
          if (token !== this.movieRunToken) return;
          this.lastAudioBase64 = res.audioBase64;
          this.miniSam.setStandaloneVoiceState(true, true);

          await new Promise<void>((resolve) => {
            void this.audioEngine
              .playWavBase64(res.audioBase64, () => resolve())
              .catch(() => resolve());
          });
        } catch (err) {
          if (token !== this.movieRunToken) return;
          this.miniSam.showToast(
            err instanceof Error ? err.message : 'SamSpeak narration failed.'
          );
          await new Promise<void>((resolve) => window.setTimeout(resolve, 1800));
        }
      }

      if (token !== this.movieRunToken) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
    }

    if (token === this.movieRunToken) {
      this.miniSam.setMoviePlaybackState(false, -1);
      this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
      this.miniSam.setSubtitle(null);
      this.miniSam.showToast('SamScene movie walkthrough complete.');
    }
  }

  private stopMovie(): void {
    this.movieRunToken++;
    this.audioEngine.stop();
    this.miniSam.setMoviePlaybackState(false, -1);
    this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
    this.miniSam.setSubtitle(null);
  }

  private async handleSynthesize(request: TtsRequest): Promise<void> {
    this.hudOverlay.setQuickSpeakBusy(true);
    this.miniSam.setStandaloneVoiceState(true, Boolean(this.lastAudioBase64));
    try {
      const result = await synthesizeSpeech(request);
      this.lastAudioBase64 = result.audioBase64;
      this.voiceCard.setPlaybackState(true, true);
      this.voiceCard.setStatus(`SamSpeak active (${result.model})...`);
      this.miniSam.setStandaloneVoiceState(true, true);
      await this.audioEngine.playWavBase64(result.audioBase64, () => {
        this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
        this.voiceCard.setStatus('SamSpeak playback complete. Ready.');
        this.hudOverlay.setQuickSpeakBusy(false);
        this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
        this.miniSam.setSubtitle(null);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'SamSpeak synthesis failed.';
      this.voiceCard.setStatus(msg);
      this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
      this.hudOverlay.setQuickSpeakBusy(false);
      this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
      this.miniSam.showToast(msg);
    }
  }

  private async handleQuickSpeak(): Promise<void> {
    const text =
      this.voiceCard.getCurrentScript() ||
      SUBJECT_MAP[this.activeSubjectId].defaultSingleScript;
    const mode = this.voiceCard.getCurrentMode();
    const voice = this.voiceCard.getCurrentVoice();
    const style = this.voiceCard.getCurrentStyle();

    this.voiceCard.setBusy(true, 'Synthesizing with SamSpeak...');
    try {
      if (mode === 'dual') {
        await this.handleSynthesize({
          mode: 'dual',
          text,
          speakerA: 'Alex',
          speakerB: 'Sam',
          voiceA: voice === 'Puck' ? 'Kore' : 'Puck',
          voiceB: voice,
          styleA: style || 'Enthusiastic creative director',
          styleB: 'Curious spatial designer',
        });
      } else {
        await this.handleSynthesize({
          mode: 'single',
          text,
          voiceName: voice,
          stylePrompt: style,
        });
      }
    } finally {
      this.voiceCard.setBusy(false);
    }
  }

  private handleStopAudio(): void {
    this.movieRunToken++;
    this.audioEngine.stop();
    this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
    this.voiceCard.setStatus('Playback stopped.');
    this.hudOverlay.setQuickSpeakBusy(false);
    this.miniSam.setMoviePlaybackState(false, -1);
    this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
    this.miniSam.setSubtitle(null);
  }

  private handleDownloadAudio(): void {
    if (!this.lastAudioBase64) return;
    const filename = `samscene-${this.activeSubjectId}-samspeak.wav`;
    downloadWavBase64(this.lastAudioBase64, filename);
    this.voiceCard.setStatus(`Downloaded ${filename}`);
    this.miniSam.showToast(`Downloaded ${filename}`);
  }

  private async handleAssistScript(mode: TtsMode): Promise<string> {
    return assistScript({
      subjectId: this.activeSubjectId,
      mode,
    });
  }

  private async handleExportScene(): Promise<void> {
    try {
      const exportTargets = [
        this.stage.getExportGroup(),
        this.scenery.getExportGroup(),
        this.brush.getExportGroup(),
      ];
      const { filename, byteLength } = await exportSceneAsGlb(
        exportTargets,
        `samscene-${this.activeSubjectId}`
      );
      const sizeKb = Math.max(1, Math.round(byteLength / 1024));
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(`Exported ${filename} (${sizeKb} KB)`);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to export 3D scene.';
      this.miniSam.showToast(msg);
    }
  }

  private handleExportIamScene(): void {
    const cam = this.cameraDirector.getCameraState();
    const skyCfg = this.stage.getSkyConfig();
    const nodes: IamSceneNode[] = [
      {
        id: 'root',
        name: 'World Root',
        kind: 'group',
        parentId: 'null',
        visible: true,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
      {
        id: `subject_${this.activeSubjectId}`,
        name: SUBJECT_MAP[this.activeSubjectId]?.label || this.activeSubjectId,
        kind: 'cad_assembly',
        parentId: 'root',
        visible: true,
        transform: {
          position: [STAGE_POSITION.x, STAGE_POSITION.y, STAGE_POSITION.z],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
        provenance: {
          sourceFormat: 'occt',
          procedureId: 'cad.motor-bearing-end-plate@0.1.0',
        },
      },
      {
        id: 'main_camera',
        name: 'Director Camera',
        kind: 'camera',
        parentId: 'root',
        visible: true,
        transform: {
          position: cam.position,
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ];

    for (const item of this.scenery.serializeItems()) {
      nodes.push({
        id: item.id,
        name: `${item.kind} (${item.id.slice(0, 6)})`,
        kind: 'mesh',
        parentId: 'root',
        visible: item.visible,
        transform: {
          position: item.position,
          rotation: [0, Math.sin(item.rotationY * 0.5), 0, Math.cos(item.rotationY * 0.5)],
          scale: [item.scale, item.scale, item.scale],
        },
      });
    }

    const doc: IamSceneDocument = {
      schemaVersion: 'iamscene.v1',
      id: `iam_${Date.now().toString(36)}`,
      name: `${this.miniSam.getMovieTitle()} (${this.activeEnvironmentId})`,
      coordinateSystem: 'right-handed-y-up-meters',
      environmentId: this.activeEnvironmentId,
      subjectId: this.activeSubjectId,
      finishId: this.activeFinishId,
      triggerMode: skyCfg.triggerMode,
      nodes,
      updatedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `primetech-${this.activeEnvironmentId}.iamscene.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.audioEngine.playStudioCue('ready');
    this.miniSam.showToast(`Exported portable ${filename} (${nodes.length} nodes)`);
  }

  private handleSelectBrushPbrPreset(presetId: string): void {
    const preset = PROCEDURAL_PBR_MATERIAL_MAP[presetId];
    if (!preset) return;
    const mat = this.stage.materials.createProceduralPbrMaterial(preset);
    this.activeBrushPresetId = preset.id;
    this.brush.setActiveMaterial(mat, preset.id);
    this.miniSam.syncBrushPreset(preset.id);
  }

  private handleApplyPbrToAllStrokes(presetId: string): void {
    const preset = PROCEDURAL_PBR_MATERIAL_MAP[presetId];
    if (!preset) return;
    this.handleSelectBrushPbrPreset(presetId);
    if (this.brush.strokeCount === 0) {
      const mat = this.stage.materials.createProceduralPbrMaterial(preset);
      this.brush.addSampleSculptedRibbon(mat, preset.id);
      this.audioEngine.playStudioCue('paint');
      this.miniSam.showToast(`Created sculpted ribbon with ${preset.label}.`);
      return;
    }
    const mat = this.stage.materials.createProceduralPbrMaterial(preset);
    const updated = this.brush.applyMaterialToAllStrokes(mat, preset.id);
    this.audioEngine.playStudioCue('paint');
    this.miniSam.showToast(`Applied ${preset.label} to ${updated} sculpted stroke(s).`);
  }

  private handleApplyPbrToSubject(presetId: string): void {
    const preset = PROCEDURAL_PBR_MATERIAL_MAP[presetId];
    if (!preset) return;
    this.handleSelectBrushPbrPreset(presetId);
    const count = this.stage.applyProceduralMaterialToSubject(preset);
    this.audioEngine.playStudioCue('paint');
    this.miniSam.showToast(`Applied ${preset.label} across ${count} centerpiece mesh(es).`);
  }

  private handleAddSampleSculpt(presetId: string): void {
    const preset = PROCEDURAL_PBR_MATERIAL_MAP[presetId] || PROCEDURAL_PBR_MATERIAL_MAP[this.activeBrushPresetId];
    if (!preset) return;
    this.handleSelectBrushPbrPreset(preset.id);
    const mat = this.stage.materials.createProceduralPbrMaterial(preset);
    this.brush.addSampleSculptedRibbon(mat, preset.id);
    this.audioEngine.playStudioCue('paint');
    this.miniSam.showToast(`Added sample 3D sculpted ribbon (${preset.label}). Drag swatches onto it!`);
  }

  private async refreshStudioTemplates(filters?: {
    category?: string;
    resource_kind?: string;
    q?: string;
  }): Promise<void> {
    try {
      this.studioTemplates = await fetchStudioTemplates(filters);
      this.miniSam.syncStudioTemplates(this.studioTemplates);
    } catch (err) {
      console.warn('Could not load studio_templates:', err);
    }
  }

  private async handleSaveSkyTemplate(): Promise<void> {
    const cfg = this.stage.getSkyConfig();
    try {
      const tpl = await createStudioTemplate({
        sku: `SKY-${cfg.presetId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
        app_id: 'samscene',
        resource_kind: cfg.triggerMode === 'orbit-time' ? 'sky_shader' : 'hover_scroll_scene',
        pack_slug: cfg.presetId,
        pack_title: cfg.title,
        category: cfg.presetId,
        title: cfg.title,
        description: `Procedural sky dome (${cfg.triggerMode}) saved from SamScene.`,
        use_case: `${cfg.triggerMode} sky backdrop`,
        tags: [cfg.presetId, cfg.triggerMode, cfg.celestialBody],
        specs: {
          presetId: cfg.presetId,
          triggerMode: cfg.triggerMode,
          celestialBody: cfg.celestialBody,
          cloudDensity: cfg.cloudDensity,
          galaxyIntensity: cfg.galaxyIntensity,
          auroraIntensity: cfg.auroraIntensity,
        },
        renderer_key: 'threejs-procedural-sky-dome',
        status: 'active',
        payload: { skyConfig: cfg },
      });
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(`Saved "${tpl.title}" to studio_templates.`);
      await this.refreshStudioTemplates();
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : 'Failed to save sky template.'
      );
    }
  }

  private async handleGenerateCharacter(params: {
    prompt: string;
    stylePreset: CharacterStylePresetId;
    referenceAssetIds: string[];
    generatePortrait: boolean;
    generateAnimationVideo: boolean;
  }): Promise<void> {
    this.miniSam.setGeneratingCharacter(true);
    try {
      const referenceImages = this.mediaAssets
        .filter(
          (a) =>
            a.category === 'image' &&
            Boolean(a.dataUrl) &&
            (params.referenceAssetIds.length === 0 || params.referenceAssetIds.includes(a.id))
        )
        .slice(0, 3)
        .map((a) => ({
          name: a.name,
          mimeType: a.mimeType,
          data: a.dataUrl || '',
        }));

      const res = await generateCharacterFromMedia({
        prompt: params.prompt,
        stylePreset: params.stylePreset,
        referenceImages,
        generatePortrait: params.generatePortrait,
        generateAnimationVideo: params.generateAnimationVideo,
      });

      this.generatedCharacters.unshift(res.character);
      this.miniSam.syncGeneratedCharacters(this.generatedCharacters);
      const item = this.scenery.placeCharacterRig(res.character);
      this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
      if (res.suggestedSky) {
        const applied = this.stage.applySkyConfig(res.suggestedSky, true);
        this.miniSam.syncSkyConfig(applied);
      }
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(
        `Created 3D Cartoon Actor "${res.character.name}" (${res.character.archetype}) & staged in 3D!`
      );
      await this.refreshStudioTemplates();
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : 'Character Studio generation failed.'
      );
    } finally {
      this.miniSam.setGeneratingCharacter(false);
    }
  }

  private async handleExtractVideoScenePack(params: {
    assetId?: string;
    useReferenceVideo?: boolean;
    prompt: string;
    generateCoverArt: boolean;
    generateAnimationVideo: boolean;
  }): Promise<void> {
    this.miniSam.setExtractingVideoPack(true);
    try {
      let videoName = 'Sky Reference Video';
      let keyframes: ExtractedVideoKeyframe[] | undefined;

      if (params.useReferenceVideo) {
        videoName = 'Screen_Recording_Sky_Reference.mov';
        this.miniSam.showToast('Sampling keyframes from bundled sky recording...');
        const sampled = await extractVideoKeyframes(REFERENCE_SKY_VIDEO_PATH, 5);
        keyframes = sampled.keyframes;
      } else if (params.assetId) {
        const asset = this.mediaAssets.find((a) => a.id === params.assetId);
        if (!asset || asset.category !== 'video') {
          throw new Error('Select a video asset in the registry first.');
        }
        videoName = asset.name;
        if (asset.extractedKeyframes && asset.extractedKeyframes.length > 0) {
          keyframes = asset.extractedKeyframes;
        } else if (asset.objectUrl) {
          const sampled = await extractVideoKeyframes(asset.objectUrl, 5);
          keyframes = sampled.keyframes;
          asset.extractedKeyframes = keyframes;
          this.miniSam.syncMediaAssets(this.mediaAssets);
        }
      }

      if (!keyframes || keyframes.length === 0) {
        throw new Error('Could not extract any video keyframes from this file.');
      }

      const pack = await generateScenePackFromVideoKeyframes({
        prompt: params.prompt,
        videoName,
        keyframes,
        generateCoverArt: params.generateCoverArt,
        generateAnimationVideo: params.generateAnimationVideo,
      });

      this.latestScenePack = pack;
      this.miniSam.syncScenePack(pack);
      this.applyScenePack(pack);
      await this.refreshStudioTemplates();
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : 'Video keyframe Scene Pack extraction failed.'
      );
    } finally {
      this.miniSam.setExtractingVideoPack(false);
    }
  }

  private applyScenePack(pack: ScenePackResult): void {
    this.isRestoringManifest = true;
    try {
      if (pack.environmentId && ENVIRONMENT_LEVEL_MAP[pack.environmentId]) {
        this.activeEnvironmentId = pack.environmentId;
        this.stage.setEnvironmentLevel(pack.environmentId);
        this.miniSam.syncEnvironment(pack.environmentId);
      }
      if (pack.moodId) {
        this.activeMoodId = pack.moodId;
        this.stage.setAtmosphereMood(pack.moodId, true);
        this.miniSam.syncMood(pack.moodId);
        this.miniSam.syncLightingState(this.stage.getLightingState());
      }
      if (pack.subjectId && SUBJECT_MAP[pack.subjectId]) {
        this.activeSubjectId = pack.subjectId;
        this.stage.setSubject(pack.subjectId);
        this.deckCard?.setActiveSubject(pack.subjectId);
        this.miniSam.syncSubject(pack.subjectId);
      }
      if (pack.finishId && FINISH_MAP[pack.finishId]) {
        this.activeFinishId = pack.finishId;
        this.stage.setFinish(pack.finishId);
        this.deckCard?.setActiveFinish(pack.finishId);
        this.miniSam.syncFinish(pack.finishId);
      }
      if (pack.skyConfig) {
        const appliedSky = this.stage.applySkyConfig(pack.skyConfig, true);
        this.miniSam.syncSkyConfig(appliedSky);
      }
      if (pack.extractedTextures && pack.extractedTextures.length > 0) {
        this.stage.applyExtractedTextures(pack.extractedTextures);
      }
      if (Array.isArray(pack.sceneryProps) && pack.sceneryProps.length > 0) {
        this.scenery.clearAll(false);
        for (const prop of pack.sceneryProps) {
          this.scenery.placePropAt(
            prop.type,
            new THREE.Vector3(prop.position[0], prop.position[1], prop.position[2]),
            prop.rotationY,
            false
          );
        }
      }
      if (pack.character) {
        if (!this.generatedCharacters.some((c) => c.id === pack.character!.id)) {
          this.generatedCharacters.unshift(pack.character);
          this.miniSam.syncGeneratedCharacters(this.generatedCharacters);
        }
        this.scenery.placeCharacterRig(pack.character, undefined, false);
      }
      if (Array.isArray(pack.beats) && pack.beats.length > 0) {
        this.miniSam.setMovieTitle(pack.packTitle);
        this.miniSam.setStoryboardBeats(pack.beats, 0);
      }
      if (pack.cameraPath && pack.cameraPath.length > 0) {
        this.previewExtractedCameraKeyframe(pack.cameraPath[0]);
      }
      this.refreshHudSummary();
    } finally {
      this.isRestoringManifest = false;
    }

    this.recordProjectMutation();
    this.audioEngine.playStudioCue('ready');
    this.miniSam.showToast(
      `Applied Scene Pack "${pack.packTitle}" (${pack.extractedTextures?.length || 0} textures, ${
        pack.cameraPath?.length || 0
      } camera keyframes)!`
    );
  }

  private previewExtractedCameraKeyframe(kf: ExtractedCameraKeyframe): void {
    this.cameraDirector.setCameraState(kf.position, kf.target);
    const sky = this.stage.applySkyConfig({ progression: kf.skyProgression }, true);
    this.miniSam.syncSkyConfig(sky);
    this.miniSam.showToast(
      `Camera Path @ ${kf.timestampSec.toFixed(1)}s — ${kf.motionNote}`
    );
  }

  private handleApplyTemplateRecord(tpl: StudioTemplateRecord): void {
    const payload = tpl.payload || {};
    if (payload.scenePack && typeof payload.scenePack === 'object') {
      this.applyScenePack(payload.scenePack as ScenePackResult);
      return;
    }
    if (payload.skyConfig && typeof payload.skyConfig === 'object') {
      const sky = this.stage.applySkyConfig(payload.skyConfig as Partial<SkySceneConfig>, true);
      this.miniSam.syncSkyConfig(sky);
      this.audioEngine.playStudioCue('switch');
      this.miniSam.showToast(`Applied sky template "${tpl.title}".`);
      this.recordProjectMutation();
      return;
    }
    if (payload.character && typeof payload.character === 'object') {
      const char = payload.character as CharacterRigSpec;
      const item = this.scenery.placeCharacterRig(char);
      this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(`Spawned character "${char.name}" from studio_templates.`);
      return;
    }
    const presetMatch = SKY_PRESET_MAP[tpl.category as SkyPresetId];
    if (presetMatch) {
      const cfg = this.stage.setSkyPreset(presetMatch.id);
      this.miniSam.syncSkyConfig(cfg);
      this.miniSam.showToast(`Loaded template preset "${tpl.title}".`);
    }
  }

  private async handleDeleteTemplateRecord(id: string): Promise<void> {
    try {
      await deleteStudioTemplate(id);
      await this.refreshStudioTemplates();
      this.miniSam.showToast('Deleted record from studio_templates.');
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : 'Failed to delete template.'
      );
    }
  }

  private async handleExportTemplatesSql(): Promise<void> {
    try {
      const sqlText = await exportStudioTemplatesSql();
      const blob = new Blob([sqlText], { type: 'application/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'samscene_studio_templates.sql';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.miniSam.showToast('Exported studio_templates SQL seed file.');
    } catch (err) {
      this.miniSam.showToast(
        err instanceof Error ? err.message : 'Failed to export studio_templates SQL.'
      );
    }
  }

  update(): void {
    const rawDt = xb.getDeltaTime();
    const dt = rawDt > 0 ? Math.min(0.05, rawDt) : 1 / 60;
    const elapsed = xb.core.elapsedTime || 0;
    const audio = this.audioEngine.sampleLevels(dt);

    this.cameraDirector.update(dt);
    this.stage.updateStage(elapsed, dt, audio);
    this.scenery.updateScenery(dt, elapsed, audio);
    this.miniSam?.updateAudioVisualizer(audio, this.audioEngine.getPlaybackProgress());

    if (!this.uiValidated) {
      this.framesSinceInit++;
      if (this.framesSinceInit >= 12) {
        const report = xb.ui.validate();
        if (report.ready) {
          this.uiValidated = true;
          if (!report.ok) {
            console.warn('Spatial UI validation issues:', report.issues);
          }
        }
      }
    }
  }

  dispose(): void {
    this.movieRunToken++;
    if (this.autoSaveTimer !== null) {
      window.clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.cleanupListeners.forEach((fn) => fn());
    this.cleanupListeners = [];
    for (const asset of this.mediaAssets) {
      if (asset.objectUrl) {
        URL.revokeObjectURL(asset.objectUrl);
      }
    }
    this.mediaAssets = [];
    this.cameraDirector.dispose();
    this.miniSam?.dispose();
    this.showcase?.dispose();
    this.audioEngine.dispose();
  }
}
