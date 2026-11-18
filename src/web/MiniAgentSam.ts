import {
  ATMOSPHERE_LIST,
  CAMERA_SHOTS,
  DEFAULT_STORYBOARD_BEATS,
  DEFAULT_STYLE_PRESETS,
  ENVIRONMENT_LEVELS,
  FINISH_LIST,
  SCENERY_PROP_OPTIONS,
  SUBJECT_LIST,
  TRANSITION_OPTIONS,
  VOICE_OPTIONS,
} from '../constants.ts';
import type { PlaybackProgress } from '../services/audioEngine.ts';
import type { SavedProjectSlot } from '../services/projectService.ts';
import type {
  AtmosphereMoodId,
  AudioLevels,
  CameraShotId,
  DroppedImageAsset,
  DynamicLightingState,
  EnvironmentLevelId,
  FinishId,
  ImportedAssetCategory,
  IngestProgressState,
  MovieBeat,
  SamSceneProjectManifest,
  SceneryPropType,
  SelectedObjectDetails,
  StudioMediaAsset,
  StudioSubjectId,
  TransitionType,
  TtsMode,
  TtsRequest,
  VoiceName,
} from '../types.ts';

type SideTab = 'sam' | 'scenery' | 'lighting' | 'walkthrough' | 'assets';
type SideViewMode = 'panel' | 'split' | 'canvas';
type DockSide = 'left' | 'right';
type AssetFilter = 'all' | ImportedAssetCategory;

const MULTI_FILE_ACCEPT =
  '.glb,.gltf,.obj,.stl,.ply,.fbx,.dae,.ifc,.srt,.vtt,.txt,.md,.json,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a,.opus,.aac,.png,.jpg,.jpeg,.webp,.gif,.samscene.json';

export interface MiniAgentSamCallbacks {
  onSelectSubject: (id: StudioSubjectId) => void;
  onSelectFinish: (id: FinishId) => void;
  onSelectEnvironment: (id: EnvironmentLevelId) => void;
  onSelectMood: (id: AtmosphereMoodId) => void;
  onExplodeChange: (value: number) => void;
  onSpinChange: (value: number) => void;
  onLightAngleChange: (radians: number) => void;
  onKeyIntensityChange: (value: number) => void;
  onAmbientColorChange: (hue: number, saturation: number) => void;
  onAmbientIntensityChange: (value: number) => void;
  onShadowSoftnessChange: (value: number) => void;
  onResetLighting: () => void;
  onToggleBrush: (enabled: boolean) => void;
  onClearBrush: () => void;
  onResetStudio: () => void;
  onArmProp: (propType: SceneryPropType) => void;
  onCancelArm: () => void;
  onImportFiles: (files: File[]) => Promise<void>;
  onPlaceMediaAsset: (assetId: string) => void;
  onArmImageInScene: (asset: DroppedImageAsset) => void;
  onPlayMediaAudio: (assetId: string) => void;
  onApplyTranscript: (assetId: string, asBeats: boolean) => void;
  onRemoveMediaAsset: (assetId: string) => void;
  onInspectorChange: (patch: {
    x?: number;
    y?: number;
    z?: number;
    rotationYDeg?: number;
    scale?: number;
    visible?: boolean;
  }) => void;
  onToggleVideoPlay: () => void;
  onToggleVideoMute: () => void;
  onSelectAnimClip: (index: number) => void;
  onToggleAnimPlay: () => void;
  onRotateSelectedProp: () => void;
  onDeleteSelectedProp: () => void;
  onFocusSelectedProp: () => void;
  onClearScenery: () => void;
  onCameraShot: (shot: CameraShotId, transition: TransitionType) => void;
  onToggleAutoTour: (enabled: boolean) => void;
  onPreviewBeat: (beat: MovieBeat) => void;
  onComposeStory: (
    prompt: string,
    images: DroppedImageAsset[]
  ) => Promise<{
    movieTitle: string;
    beats: MovieBeat[];
  }>;
  onPlayMovie: (beats: MovieBeat[], startIndex: number) => void;
  onStopMovie: () => void;
  onSpeakBeat: (beat: MovieBeat) => Promise<void>;
  onSynthesizeStandalone: (request: TtsRequest) => Promise<void>;
  onStopAudio: () => void;
  onDownloadAudio: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onAssistScript: (mode: TtsMode) => Promise<string>;
  onExportScene: () => Promise<void>;
  onExportProjectBundle: () => void;
  onSaveProjectSlot: (name: string) => void;
  onLoadProjectSlot: (id: string) => void;
  onDeleteProjectSlot: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onProjectStateChange: () => void;
  onEnterXr: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/**
 * SamScene + SamSpeak Workspace Shell & Flexible Side Container.
 * Features a slim left icon rail, resizable/collapsible/dock-flippable Side Container
 * (Panel / Split / Flow Canvas), multi-format ingest, Object Inspector,
 * SamSpeak waveform studio, collapsible timeline strip, and unobstructed 3D viewport.
 */
export class MiniAgentSam {
  private callbacks: MiniAgentSamCallbacks;
  private root: HTMLDivElement;
  private sideEl!: HTMLElement;
  private splitterEl!: HTMLDivElement;
  private viewportEl!: HTMLElement;
  private sideBodyEl!: HTMLDivElement;
  private timelineBarEl!: HTMLDivElement;
  private subtitleEl!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private dropOverlayEl!: HTMLDivElement;
  private ingestLoaderEl!: HTMLDivElement;
  private ingestFormatEl!: HTMLSpanElement;
  private ingestFileEl!: HTMLElement;
  private ingestStageEl!: HTMLSpanElement;
  private ingestCountEl!: HTMLSpanElement;
  private ingestBarFillEl!: HTMLDivElement;
  private armedBannerEl!: HTMLDivElement;
  private armedBannerTextEl!: HTMLSpanElement;
  private exportMenuEl!: HTMLDivElement;

  private activeTab: SideTab = 'sam';
  private viewMode: SideViewMode = 'split';
  private dockSide: DockSide = 'left';
  private sideWidth = 420;
  private collapsed = false;
  private timelineCollapsed = false;
  private exportMenuOpen = false;

  private activeSubject: StudioSubjectId = 'astrolabe';
  private activeFinish: FinishId = 'gold';
  private activeEnvironment: EnvironmentLevelId = 'studio-stage';
  private activeMood: AtmosphereMoodId = 'studio';
  private lightingState: DynamicLightingState = {
    keyIntensity: 2.6,
    ambientHue: 217,
    ambientSaturation: 0.72,
    ambientIntensity: 1.15,
    ambientHex: '#d0e2ff',
    shadowSoftness: 2.5,
    keyAngle: 0.65,
  };
  private stageExplode = 0;
  private stageSpin = 0.28;
  private brushEnabled = false;
  private strokeCount = 0;
  private autoTour = false;
  private manualTransition: TransitionType = 'glide';

  private movieTitle = 'SamScene Guided Adventure';
  private promptDraft = '';
  private beats: MovieBeat[] = DEFAULT_STORYBOARD_BEATS.map((b) => ({ ...b }));
  private activeBeatIndex = 0;
  private isComposing = false;
  private isPlayingMovie = false;
  private playingBeatIndex = -1;

  private mediaAssets: StudioMediaAsset[] = [];
  private assetFilter: AssetFilter = 'all';
  private assetSearch = '';
  private savedSlots: SavedProjectSlot[] = [];
  private ingestProgress: IngestProgressState | null = null;

  private selectedDetails: SelectedObjectDetails | null = null;
  private sceneryCount = 0;
  private canUndo = false;
  private canRedo = false;

  // SamSpeak Voice Studio state
  private voiceMode: TtsMode = 'single';
  private voiceName: VoiceName = 'Kore';
  private voiceStyle = 'Warm, articulate design documentary narrator';
  private voiceScript = '';
  private voiceVolume = 0.92;
  private voiceMuted = false;
  private isSpeakingStandalone = false;
  private hasAudioDownload = false;
  private isExportingScene = false;
  private visualizerBins = new Float32Array(28);

  private toastTimer: number | null = null;
  private cleanupListeners: Array<() => void> = [];

  constructor(callbacks: MiniAgentSamCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'ws-shell';
    this.buildShell();
    document.body.prepend(this.root);
    this.applyLayoutState();
    this.render();
  }

  public getViewportElement(): HTMLElement {
    return this.viewportEl;
  }

  private getDroppedImages(): DroppedImageAsset[] {
    return this.mediaAssets
      .filter((a) => a.category === 'image' && Boolean(a.dataUrl))
      .map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        dataUrl: a.dataUrl || '',
        width: a.width || 800,
        height: a.height || 600,
      }));
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <aside class="ws-rail" aria-label="SamScene workspace navigation">
        <div class="ws-rail-group">
          <button type="button" class="ws-rail-btn is-active" data-rail-tab="sam" title="Sam Composer &amp; Storyboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9L12 3z"/></svg>
            <span>Sam</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="scenery" title="Stage, Environments &amp; Inspector">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span>Stage</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="lighting" title="Dynamic Lighting &amp; Atmosphere">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>
            <span>Lights</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="walkthrough" title="Direct Camera &amp; SamSpeak Voice Studio">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span>Direct</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="assets" title="Asset Library (GLB, IFC BIM, Video, Audio, Transcripts &amp; Projects)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <span>Assets</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsRailCanvasBtn" title="Toggle Creativity Flow Canvas">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>
            <span>Flow</span>
          </button>
        </div>

        <div class="ws-rail-group ws-rail-bottom">
          <button type="button" class="ws-rail-btn" id="wsFlipSideBtn" title="Flip Side Container Left / Right">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="8 9 5 12 8 15"/><polyline points="16 9 19 12 16 15"/></svg>
            <span>Flip</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsCollapseRailBtn" title="Collapse / Expand Side Container (H)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
            <span>Hide</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsEnterXrBtn" title="Enter WebXR Headset (if connected)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4l-2.5-3h-3L8 17H4a2 2 0 0 1-2-2v-5z"/></svg>
            <span>XR</span>
          </button>
        </div>
      </aside>

      <aside class="ws-side" id="wsSideContainer">
        <header class="ws-side-header">
          <div class="ws-side-title-group">
            <span class="ws-side-title">SamScene Studio</span>
            <span class="ws-side-subtitle" id="wsSideMovieTitle"></span>
          </div>
          <div class="ws-side-controls">
            <div class="ws-view-switch" role="group" aria-label="Side container view mode">
              <button type="button" class="ws-switch-btn" data-view-mode="panel">Panel</button>
              <button type="button" class="ws-switch-btn is-active" data-view-mode="split">Split</button>
              <button type="button" class="ws-switch-btn" data-view-mode="canvas">Canvas</button>
            </div>
            <button type="button" class="ws-icon-btn" id="wsSideCloseBtn" title="Collapse Side Container (H)">×</button>
          </div>
        </header>

        <div class="ws-flow-bar" aria-label="Creativity flow stages">
          <button type="button" class="ws-flow-pill is-active" data-flow-step="compose"><span>1</span>Sam</button>
          <button type="button" class="ws-flow-pill" data-flow-step="stage"><span>2</span>Stage</button>
          <button type="button" class="ws-flow-pill" data-flow-step="direct"><span>3</span>SamSpeak</button>
          <button type="button" class="ws-flow-pill" data-flow-step="assets"><span>4</span>Assets</button>
          <button type="button" class="ws-flow-pill ws-flow-play" data-flow-step="play">▶ Play</button>
        </div>

        <div class="ws-side-body" id="wsSideBody"></div>
      </aside>

      <div class="ws-splitter" id="wsSplitter" role="separator" aria-orientation="vertical" title="Drag to resize side container"></div>

      <main class="ws-viewport" id="wsViewport">
        <div class="ws-viewport-hud">
          <div class="ws-vp-left">
            <button type="button" class="ws-vp-pill ws-vp-accent" id="wsExpandSideBtn" hidden>Open Studio (H)</button>
            <div class="ws-vp-badge">
              <strong>SAMSCENE</strong>
              <span id="wsBrandStatus">Astrolabe • Soundstage • Studio</span>
            </div>
          </div>
          <div class="ws-vp-right">
            <button type="button" class="ws-vp-pill" id="wsUndoBtn" title="Undo (Ctrl/Cmd+Z)" disabled>Undo</button>
            <button type="button" class="ws-vp-pill" id="wsRedoBtn" title="Redo (Ctrl/Cmd+Shift+Z)" disabled>Redo</button>
            <label class="ws-vp-pill" title="Import GLB, GLTF, OBJ, STL, FBX, DAE, IFC BIM, Video, Audio, Transcript, Image, or .samscene.json">
              <input type="file" id="wsHudFileInput" accept="${MULTI_FILE_ACCEPT}" multiple hidden />
              + Import
            </label>
            <button type="button" class="ws-vp-pill ws-vp-accent" id="wsPlayMovieBtn">Play Movie</button>
            <button type="button" class="ws-vp-pill ws-vp-danger" id="wsStopMovieBtn" hidden>Stop Movie</button>
            <div class="ws-export-wrap">
              <button type="button" class="ws-vp-pill" id="wsExportMenuBtn" title="Export 3D Scene GLB or Project Bundle">Export ▾</button>
              <div class="ws-export-menu" id="wsExportMenu" hidden>
                <button type="button" class="ws-export-item" id="wsExportGlbAction">
                  <span>Export 3D Scene (.GLB)</span>
                  <small>Download complete stage, props &amp; sculptures</small>
                </button>
                <button type="button" class="ws-export-item" id="wsExportJsonAction">
                  <span>Save Project (.samscene.json)</span>
                  <small>Portable state, lighting, beats &amp; settings</small>
                </button>
              </div>
            </div>
            <button type="button" class="ws-vp-pill" id="wsResetCamBtn">Reset View</button>
          </div>
        </div>

        <div class="ws-armed-banner" id="wsArmedBanner" hidden>
          <span id="wsArmedBannerText">Click anywhere on the stage floor to place</span>
          <button type="button" class="ws-mini-btn" id="wsCancelArmBtn">Cancel (Esc)</button>
        </div>

        <div class="ws-ingest-loader" id="wsIngestLoader" role="status" aria-live="polite" hidden>
          <div class="ws-spinner" aria-hidden="true"></div>
          <div class="ws-ingest-meta">
            <div class="ws-ingest-top">
              <span class="ws-ingest-badge" id="wsIngestFormat">GLB</span>
              <strong id="wsIngestFile">Importing asset...</strong>
              <span class="ws-ingest-count" id="wsIngestCount">1 / 1</span>
            </div>
            <span class="ws-ingest-stage" id="wsIngestStage">Parsing 3D scene...</span>
            <div class="ws-ingest-bar">
              <div class="ws-ingest-bar-fill" id="wsIngestBarFill" style="width: 30%"></div>
            </div>
          </div>
        </div>

        <div class="ws-subtitle" id="wsSubtitle" hidden></div>
        <div class="ws-toast" id="wsToast" hidden></div>

        <div class="ws-timeline-bar" id="wsTimelineBar"></div>
      </main>

      <div class="ws-drop-overlay" id="wsDropOverlay" hidden>
        <div class="ws-drop-overlay-box">
          <strong>Drop GLB / glTF, BIM (.ifc) or Studio Media into SamScene</strong>
          <span>Drop onto the 3D stage to place immediately • .GLB / .GLTF • .IFC BIM • .OBJ/.STL/.FBX • Video • Audio • Transcripts • Images</span>
        </div>
      </div>
    `;

    this.sideEl = this.root.querySelector('#wsSideContainer') as HTMLElement;
    this.splitterEl = this.root.querySelector('#wsSplitter') as HTMLDivElement;
    this.viewportEl = this.root.querySelector('#wsViewport') as HTMLElement;
    this.sideBodyEl = this.root.querySelector('#wsSideBody') as HTMLDivElement;
    this.timelineBarEl = this.root.querySelector('#wsTimelineBar') as HTMLDivElement;
    this.subtitleEl = this.root.querySelector('#wsSubtitle') as HTMLDivElement;
    this.toastEl = this.root.querySelector('#wsToast') as HTMLDivElement;
    this.dropOverlayEl = this.root.querySelector('#wsDropOverlay') as HTMLDivElement;
    this.ingestLoaderEl = this.root.querySelector('#wsIngestLoader') as HTMLDivElement;
    this.ingestFormatEl = this.root.querySelector('#wsIngestFormat') as HTMLSpanElement;
    this.ingestFileEl = this.root.querySelector('#wsIngestFile') as HTMLElement;
    this.ingestStageEl = this.root.querySelector('#wsIngestStage') as HTMLSpanElement;
    this.ingestCountEl = this.root.querySelector('#wsIngestCount') as HTMLSpanElement;
    this.ingestBarFillEl = this.root.querySelector('#wsIngestBarFill') as HTMLDivElement;
    this.armedBannerEl = this.root.querySelector('#wsArmedBanner') as HTMLDivElement;
    this.armedBannerTextEl = this.root.querySelector('#wsArmedBannerText') as HTMLSpanElement;
    this.exportMenuEl = this.root.querySelector('#wsExportMenu') as HTMLDivElement;

    this.attachShellEvents();
    this.attachResizeSplitter();
  }

  private attachShellEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-rail-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.railTab as SideTab;
        if (!next) return;
        if (this.collapsed) this.collapsed = false;
        if (this.viewMode === 'canvas') this.viewMode = 'split';
        this.activeTab = next;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelector('#wsRailCanvasBtn')?.addEventListener('click', () => {
      if (this.collapsed) this.collapsed = false;
      this.viewMode = this.viewMode === 'canvas' ? 'split' : 'canvas';
      if (this.sideWidth < 460) {
        this.sideWidth = 520;
      }
      this.applyLayoutState();
      this.render();
    });

    this.root.querySelector('#wsFlipSideBtn')?.addEventListener('click', () => {
      this.dockSide = this.dockSide === 'left' ? 'right' : 'left';
      this.applyLayoutState();
    });

    this.root.querySelector('#wsCollapseRailBtn')?.addEventListener('click', () => {
      this.toggleCollapsed();
    });

    this.root.querySelector('#wsSideCloseBtn')?.addEventListener('click', () => {
      this.toggleCollapsed(true);
    });

    this.root.querySelector('#wsExpandSideBtn')?.addEventListener('click', () => {
      this.toggleCollapsed(false);
    });

    this.root.querySelector('#wsEnterXrBtn')?.addEventListener('click', () => {
      this.callbacks.onEnterXr();
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.viewMode as SideViewMode;
        if (!mode) return;
        this.viewMode = mode;
        if (mode === 'canvas' && this.sideWidth < 500) this.sideWidth = 540;
        if (mode === 'panel' && this.sideWidth > 480) this.sideWidth = 400;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-flow-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.flowStep;
        if (step === 'compose') {
          this.activeTab = 'sam';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'stage') {
          this.activeTab = 'scenery';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'direct') {
          this.activeTab = 'walkthrough';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'assets') {
          this.activeTab = 'assets';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'play') {
          this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
          return;
        }
        this.collapsed = false;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelector('#wsUndoBtn')?.addEventListener('click', () => {
      this.callbacks.onUndo();
    });

    this.root.querySelector('#wsRedoBtn')?.addEventListener('click', () => {
      this.callbacks.onRedo();
    });

    const hudFileInput = this.root.querySelector('#wsHudFileInput') as HTMLInputElement | null;
    hudFileInput?.addEventListener('change', async () => {
      const files = Array.from(hudFileInput.files || []);
      if (files.length > 0) {
        await this.callbacks.onImportFiles(files);
      }
      hudFileInput.value = '';
    });

    this.root.querySelector('#wsPlayMovieBtn')?.addEventListener('click', () => {
      this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
    });

    this.root.querySelector('#wsStopMovieBtn')?.addEventListener('click', () => {
      this.callbacks.onStopMovie();
    });

    const exportMenuBtn = this.root.querySelector('#wsExportMenuBtn') as HTMLButtonElement | null;
    exportMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.exportMenuOpen = !this.exportMenuOpen;
      this.exportMenuEl.hidden = !this.exportMenuOpen;
    });

    const onDocClick = (e: MouseEvent) => {
      if (
        this.exportMenuOpen &&
        !this.exportMenuEl.contains(e.target as Node) &&
        e.target !== exportMenuBtn
      ) {
        this.exportMenuOpen = false;
        this.exportMenuEl.hidden = true;
      }
    };
    window.addEventListener('click', onDocClick);
    this.cleanupListeners.push(() => window.removeEventListener('click', onDocClick));

    const exportGlbBtn = this.root.querySelector('#wsExportGlbAction') as HTMLButtonElement | null;
    exportGlbBtn?.addEventListener('click', async () => {
      if (this.isExportingScene || !exportMenuBtn) return;
      this.exportMenuOpen = false;
      this.exportMenuEl.hidden = true;
      this.isExportingScene = true;
      exportMenuBtn.disabled = true;
      exportMenuBtn.textContent = 'Exporting...';
      try {
        await this.callbacks.onExportScene();
      } finally {
        this.isExportingScene = false;
        exportMenuBtn.disabled = false;
        exportMenuBtn.textContent = 'Export ▾';
      }
    });

    this.root.querySelector('#wsExportJsonAction')?.addEventListener('click', () => {
      this.exportMenuOpen = false;
      this.exportMenuEl.hidden = true;
      this.callbacks.onExportProjectBundle();
    });

    this.root.querySelector('#wsResetCamBtn')?.addEventListener('click', () => {
      this.autoTour = false;
      this.callbacks.onResetStudio();
      this.renderBody();
    });

    this.root.querySelector('#wsCancelArmBtn')?.addEventListener('click', () => {
      this.callbacks.onCancelArm();
      this.setArmedPlacement(null);
    });
  }

  private attachResizeSplitter(): void {
    let dragging = false;
    let startX = 0;
    let startWidth = this.sideWidth;

    const onPointerDown = (e: PointerEvent) => {
      if (this.collapsed) return;
      dragging = true;
      startX = e.clientX;
      startWidth = this.sideWidth;
      this.splitterEl.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = this.dockSide === 'left' ? e.clientX - startX : startX - e.clientX;
      const maxAllowed = Math.min(780, Math.floor(window.innerWidth * 0.62));
      this.sideWidth = Math.max(310, Math.min(maxAllowed, startWidth + delta));
      this.root.style.setProperty('--ws-side-width', `${this.sideWidth}px`);
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      this.splitterEl.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    this.splitterEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.cleanupListeners.push(() => {
      this.splitterEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    });
  }

  private applyLayoutState(): void {
    this.root.style.setProperty('--ws-side-width', `${this.sideWidth}px`);
    this.root.classList.toggle('is-dock-right', this.dockSide === 'right');
    this.root.classList.toggle('is-side-collapsed', this.collapsed);

    this.sideEl.hidden = this.collapsed;
    this.splitterEl.hidden = this.collapsed;

    const expandBtn = this.root.querySelector('#wsExpandSideBtn') as HTMLButtonElement;
    if (expandBtn) expandBtn.hidden = !this.collapsed;

    const railHideBtn = this.root.querySelector('#wsCollapseRailBtn');
    const railHideSpan = railHideBtn?.querySelector('span');
    if (railHideSpan) railHideSpan.textContent = this.collapsed ? 'Open' : 'Hide';
  }

  public toggleCollapsed(force?: boolean): void {
    this.collapsed = force !== undefined ? force : !this.collapsed;
    this.applyLayoutState();
  }

  public setDropOverlayVisible(visible: boolean): void {
    this.dropOverlayEl.hidden = !visible;
  }

  public setIngestionProgress(state: IngestProgressState | null): void {
    this.ingestProgress = state && state.active ? state : null;
    if (!this.ingestProgress) {
      this.ingestLoaderEl.hidden = true;
      if (this.activeTab === 'assets') {
        this.renderBody();
      }
      return;
    }

    this.ingestFormatEl.textContent = this.ingestProgress.formatLabel;
    this.ingestFileEl.textContent = this.ingestProgress.currentFile;
    this.ingestStageEl.textContent = this.ingestProgress.stage;
    this.ingestCountEl.textContent = `${Math.min(
      this.ingestProgress.completed + 1,
      Math.max(1, this.ingestProgress.total)
    )} / ${Math.max(1, this.ingestProgress.total)}`;
    const pct = Math.min(
      100,
      Math.max(
        18,
        Math.round(
          ((this.ingestProgress.completed + 0.5) / Math.max(1, this.ingestProgress.total)) * 100
        )
      )
    );
    this.ingestBarFillEl.style.width = `${pct}%`;
    this.ingestLoaderEl.hidden = false;

    if (this.activeTab === 'assets') {
      this.renderBody();
    }
  }

  public showToast(message: string, durationMs = 3400): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
      this.toastTimer = null;
    }, durationMs);
  }

  public setSubtitle(text: string | null): void {
    if (!text) {
      this.subtitleEl.hidden = true;
      this.subtitleEl.textContent = '';
      return;
    }
    this.subtitleEl.textContent = text;
    this.subtitleEl.hidden = false;
  }

  public setArmedPlacement(label: string | null): void {
    if (!label) {
      this.armedBannerEl.hidden = true;
      return;
    }
    this.armedBannerTextEl.textContent = `Placement armed: Click anywhere on the stage floor to drop "${label}"`;
    this.armedBannerEl.hidden = false;
  }

  public syncMediaAssets(assets: StudioMediaAsset[]): void {
    this.mediaAssets = assets;
    this.renderBody();
  }

  public syncSavedSlots(slots: SavedProjectSlot[]): void {
    this.savedSlots = slots;
    if (this.activeTab === 'assets') {
      this.renderBody();
    }
  }

  public syncHistoryState(canUndo: boolean, canRedo: boolean): void {
    this.canUndo = canUndo;
    this.canRedo = canRedo;
    const undoBtn = this.root.querySelector('#wsUndoBtn') as HTMLButtonElement | null;
    const redoBtn = this.root.querySelector('#wsRedoBtn') as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
  }

  public syncSubject(id: StudioSubjectId): void {
    this.activeSubject = id;
    this.updateBrandStatus();
    if (this.activeTab === 'scenery' || this.activeTab === 'sam' || this.viewMode !== 'panel') {
      this.renderBody();
    }
  }

  public syncFinish(id: FinishId): void {
    this.activeFinish = id;
    if (this.activeTab === 'scenery' || this.viewMode !== 'panel') this.renderBody();
  }

  public syncEnvironment(id: EnvironmentLevelId): void {
    this.activeEnvironment = id;
    this.updateBrandStatus();
    if (this.activeTab === 'scenery' || this.activeTab === 'sam' || this.viewMode !== 'panel') {
      this.renderBody();
    }
  }

  public syncMood(id: AtmosphereMoodId): void {
    this.activeMood = id;
    this.updateBrandStatus();
    if (
      this.activeTab === 'scenery' ||
      this.activeTab === 'lighting' ||
      this.viewMode !== 'panel'
    ) {
      this.renderBody();
    }
  }

  public syncLightingState(state: DynamicLightingState): void {
    this.lightingState = { ...state };
    if (this.activeTab === 'lighting') {
      this.renderBody();
    }
  }

  public syncStageDynamics(explode: number, spin: number): void {
    this.stageExplode = explode;
    this.stageSpin = spin;
    if (this.activeTab === 'scenery') this.renderBody();
  }

  public syncBrushState(enabled: boolean, strokeCount: number): void {
    this.brushEnabled = enabled;
    this.strokeCount = strokeCount;
    if (this.activeTab === 'scenery') this.renderBody();
  }

  public syncSelection(details: SelectedObjectDetails | null, totalCount: number): void {
    this.selectedDetails = details;
    this.sceneryCount = totalCount;
    if (this.activeTab === 'scenery' || this.viewMode !== 'panel') this.renderBody();
  }

  public setMoviePlaybackState(playing: boolean, beatIndex = -1): void {
    this.isPlayingMovie = playing;
    this.playingBeatIndex = beatIndex;
    if (playing && beatIndex >= 0 && beatIndex < this.beats.length) {
      this.activeBeatIndex = beatIndex;
    }
    this.renderHeaderState();
    this.renderBody();
    this.renderTimelineBar();
  }

  public setStandaloneVoiceState(
    speaking: boolean,
    hasDownload: boolean,
    scriptText?: string
  ): void {
    this.isSpeakingStandalone = speaking;
    this.hasAudioDownload = hasDownload;
    if (scriptText !== undefined) {
      this.voiceScript = scriptText;
    }
    if (this.activeTab === 'walkthrough') this.renderBody();
  }

  public syncStandaloneScript(scriptText: string): void {
    this.voiceScript = scriptText;
    if (this.activeTab === 'walkthrough' || this.activeTab === 'sam') {
      this.renderBody();
    }
  }

  public syncVolumeState(volume: number, muted: boolean): void {
    this.voiceVolume = volume;
    this.voiceMuted = muted;
    if (this.activeTab === 'walkthrough') this.renderBody();
  }

  public setMovieTitle(title: string): void {
    this.movieTitle = title || 'SamScene Project';
    this.renderHeaderState();
  }

  public getMovieTitle(): string {
    return this.movieTitle;
  }

  public setStoryboardBeats(beats: MovieBeat[], activeIndex = 0): void {
    if (beats.length === 0) return;
    this.beats = beats.map((b) => ({ ...b }));
    this.activeBeatIndex = Math.max(0, Math.min(activeIndex, this.beats.length - 1));
    this.render();
  }

  public getStoryboardBeats(): {
    movieTitle: string;
    beats: MovieBeat[];
    activeBeatIndex: number;
  } {
    return {
      movieTitle: this.movieTitle,
      beats: this.beats.map((b) => ({ ...b })),
      activeBeatIndex: this.activeBeatIndex,
    };
  }

  public getVoiceState(): {
    mode: TtsMode;
    voiceName: VoiceName;
    voiceStyle: string;
    script: string;
    volume: number;
    muted: boolean;
  } {
    return {
      mode: this.voiceMode,
      voiceName: this.voiceName,
      voiceStyle: this.voiceStyle,
      script: this.voiceScript,
      volume: this.voiceVolume,
      muted: this.voiceMuted,
    };
  }

  public applyVoiceState(state: {
    mode?: TtsMode;
    voiceName?: VoiceName;
    voiceStyle?: string;
    script?: string;
    volume?: number;
    muted?: boolean;
  }): void {
    if (state.mode) this.voiceMode = state.mode;
    if (state.voiceName) this.voiceName = state.voiceName;
    if (state.voiceStyle !== undefined) this.voiceStyle = state.voiceStyle;
    if (state.script !== undefined) this.voiceScript = state.script;
    if (state.volume !== undefined) this.voiceVolume = state.volume;
    if (state.muted !== undefined) this.voiceMuted = state.muted;
    if (this.activeTab === 'walkthrough') this.renderBody();
  }

  /**
   * Draws SamSpeak's real-time frequency & progress canvas without touching DOM tree layout.
   */
  public updateAudioVisualizer(levels: AudioLevels, progress: PlaybackProgress): void {
    const canvas = this.sideBodyEl.querySelector('#wsSamSpeakCanvas') as HTMLCanvasElement | null;
    const timeEl = this.sideBodyEl.querySelector('#wsSamSpeakTime') as HTMLSpanElement | null;
    if (timeEl) {
      timeEl.textContent = progress.isPlaying
        ? `${formatTime(progress.currentTime)} / ${formatTime(progress.duration)}`
        : 'Standby';
    }
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle baseline grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const barCount = this.visualizerBins.length;
    const step = w / barCount;
    const barW = Math.max(2, step - 3);
    const nowSec = performance.now() * 0.004;

    for (let i = 0; i < barCount; i++) {
      const bandRatio = i / barCount;
      const bandEnergy =
        bandRatio < 0.32 ? levels.low : bandRatio < 0.72 ? levels.mid : levels.high;
      const idleRipple = levels.isPlaying ? 0.14 + 0.18 * Math.sin(nowSec + i * 0.45) : 0.08;
      const target = Math.min(1, bandEnergy * (0.72 + 0.35 * Math.sin(nowSec * 1.4 + i)) + idleRipple);
      this.visualizerBins[i] += (target - this.visualizerBins[i]) * 0.32;

      const barH = Math.max(3, this.visualizerBins[i] * (h - 6));
      const x = i * step + 1.5;
      const y = (h - barH) / 2;

      ctx.fillStyle = progress.isPlaying
        ? `hsl(${210 + i * 2.2}, 88%, 62%)`
        : 'rgba(161, 161, 166, 0.32)';
      ctx.fillRect(x, y, barW, barH);
    }

    if (progress.isPlaying && progress.duration > 0) {
      const pct = Math.max(0, Math.min(1, progress.currentTime / progress.duration));
      ctx.fillStyle = '#30d158';
      ctx.fillRect(0, h - 2, w * pct, 2);
    }
  }

  private updateBrandStatus(): void {
    const el = this.root.querySelector('#wsBrandStatus');
    if (!el) return;
    const subj = SUBJECT_LIST.find((s) => s.id === this.activeSubject)?.label || 'Astrolabe';
    const env =
      ENVIRONMENT_LEVELS.find((e) => e.id === this.activeEnvironment)?.label || 'Soundstage';
    const mood = ATMOSPHERE_LIST.find((m) => m.id === this.activeMood)?.label || 'Studio';
    el.textContent = `${subj} • ${env} • ${mood}`;
  }

  private renderHeaderState(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-rail-tab]').forEach((btn) => {
      const active = this.viewMode !== 'canvas' && btn.dataset.railTab === this.activeTab;
      btn.classList.toggle('is-active', active);
    });
    this.root
      .querySelector('#wsRailCanvasBtn')
      ?.classList.toggle('is-active', this.viewMode === 'canvas');

    this.root.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.viewMode === this.viewMode);
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-flow-step]').forEach((btn) => {
      const step = btn.dataset.flowStep;
      const isActive =
        (step === 'compose' && this.activeTab === 'sam') ||
        (step === 'stage' && (this.activeTab === 'scenery' || this.activeTab === 'lighting')) ||
        (step === 'direct' && this.activeTab === 'walkthrough') ||
        (step === 'assets' && this.activeTab === 'assets');
      btn.classList.toggle('is-active', isActive);
    });

    const titleEl = this.root.querySelector('#wsSideMovieTitle');
    if (titleEl) {
      titleEl.textContent = `${this.movieTitle} • ${this.beats.length} beats`;
    }

    const playBtn = this.root.querySelector('#wsPlayMovieBtn') as HTMLButtonElement | null;
    const stopBtn = this.root.querySelector('#wsStopMovieBtn') as HTMLButtonElement | null;
    if (playBtn) playBtn.hidden = this.isPlayingMovie;
    if (stopBtn) stopBtn.hidden = !this.isPlayingMovie;

    this.syncHistoryState(this.canUndo, this.canRedo);
  }

  private render(): void {
    this.updateBrandStatus();
    this.renderHeaderState();
    this.renderBody();
    this.renderTimelineBar();
  }

  private renderTimelineBar(): void {
    this.timelineBarEl.classList.toggle('is-collapsed', this.timelineCollapsed);
    if (this.timelineCollapsed) {
      this.timelineBarEl.innerHTML = `
        <button type="button" class="ws-mini-btn" id="wsTimelineToggleBtn">Timeline (${this.beats.length}) ▲</button>
      `;
    } else {
      const activeBeat = this.beats[this.activeBeatIndex];
      const tracksHtml = this.beats
        .map((b, i) => {
          const isCurrent = i === this.activeBeatIndex;
          const isPlaying = this.isPlayingMovie && i === this.playingBeatIndex;
          return `
            <button type="button" class="ws-tl-beat ${isCurrent ? 'is-active' : ''} ${
              isPlaying ? 'is-playing' : ''
            }" data-tl-beat="${i}" title="${escapeHtml(b.script)}">
              <span>${escapeHtml(b.title)}</span>
              <small style="opacity:0.7">${b.durationSec || 4}s</small>
            </button>
          `;
        })
        .join('');

      this.timelineBarEl.innerHTML = `
        <button type="button" class="ws-mini-btn" id="wsTimelineToggleBtn" title="Collapse Timeline">▼</button>
        <div class="ws-timeline-tracks">${tracksHtml}</div>
        <button type="button" class="ws-mini-btn" id="wsTlPrevMove" title="Move beat earlier" ${
          this.activeBeatIndex <= 0 ? 'disabled' : ''
        }>←</button>
        <button type="button" class="ws-mini-btn" id="wsTlNextMove" title="Move beat later" ${
          this.activeBeatIndex >= this.beats.length - 1 ? 'disabled' : ''
        }>→</button>
        <button type="button" class="ws-mini-btn" id="wsTlMuteBeat" title="Toggle beat voiceover mute">${
          activeBeat?.muted ? 'Unmute' : 'Mute'
        }</button>
        <button type="button" class="ws-mini-btn ws-mini-accent" id="wsTlAddBeat">+ Beat</button>
      `;
    }

    this.timelineBarEl
      .querySelector('#wsTimelineToggleBtn')
      ?.addEventListener('click', () => {
        this.timelineCollapsed = !this.timelineCollapsed;
        this.renderTimelineBar();
      });

    this.timelineBarEl
      .querySelectorAll<HTMLButtonElement>('[data-tl-beat]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.tlBeat);
          if (!Number.isNaN(idx) && this.beats[idx]) {
            this.activeBeatIndex = idx;
            this.callbacks.onPreviewBeat(this.beats[idx]);
            this.render();
          }
        });
      });

    this.timelineBarEl.querySelector('#wsTlPrevMove')?.addEventListener('click', () => {
      this.moveBeat(this.activeBeatIndex, -1);
    });
    this.timelineBarEl.querySelector('#wsTlNextMove')?.addEventListener('click', () => {
      this.moveBeat(this.activeBeatIndex, 1);
    });
    this.timelineBarEl.querySelector('#wsTlMuteBeat')?.addEventListener('click', () => {
      const beat = this.beats[this.activeBeatIndex];
      if (!beat) return;
      beat.muted = !beat.muted;
      this.callbacks.onProjectStateChange();
      this.renderTimelineBar();
    });
    this.timelineBarEl.querySelector('#wsTlAddBeat')?.addEventListener('click', () => {
      this.appendBlankBeat();
    });
  }

  private renderBody(): void {
    if (this.viewMode === 'canvas') {
      this.sideBodyEl.innerHTML = `<div class="ws-canvas-well" id="wsCanvasMount"></div>`;
      const mount = this.sideBodyEl.querySelector('#wsCanvasMount') as HTMLDivElement;
      this.renderFlowCanvas(mount);
      return;
    }

    if (this.viewMode === 'split') {
      this.sideBodyEl.innerHTML = `
        <div class="ws-split-top" id="wsPanelMount"></div>
        <div class="ws-canvas-well ws-split-bottom" id="wsCanvasMount"></div>
      `;
      const panelMount = this.sideBodyEl.querySelector('#wsPanelMount') as HTMLDivElement;
      const canvasMount = this.sideBodyEl.querySelector('#wsCanvasMount') as HTMLDivElement;
      this.renderActivePanel(panelMount);
      this.renderFlowCanvas(canvasMount);
      return;
    }

    this.sideBodyEl.innerHTML = `<div class="ws-panel-full" id="wsPanelMount"></div>`;
    const panelMount = this.sideBodyEl.querySelector('#wsPanelMount') as HTMLDivElement;
    this.renderActivePanel(panelMount);
  }

  private renderActivePanel(container: HTMLElement): void {
    if (this.activeTab === 'sam') {
      this.renderSamPanel(container);
    } else if (this.activeTab === 'scenery') {
      this.renderSceneryPanel(container);
    } else if (this.activeTab === 'lighting') {
      this.renderLightingPanel(container);
    } else if (this.activeTab === 'assets') {
      this.renderAssetsPanel(container);
    } else {
      this.renderWalkthroughPanel(container);
    }
  }

  private renderFlowCanvas(container: HTMLElement): void {
    const subjLabel = SUBJECT_LIST.find((s) => s.id === this.activeSubject)?.label || 'Astrolabe';
    const envLabel =
      ENVIRONMENT_LEVELS.find((e) => e.id === this.activeEnvironment)?.label || 'Soundstage';
    const moodObj = ATMOSPHERE_LIST.find((m) => m.id === this.activeMood) || ATMOSPHERE_LIST[0];
    const images = this.getDroppedImages();

    const inspoThumbs =
      images.length > 0
        ? images
            .map(
              (img) => `
              <button type="button" class="ws-art-thumb" data-canvas-place-img="${escapeHtml(
                img.id
              )}" title="Click to place ${escapeHtml(img.name)} in 3D">
                <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" referrerpolicy="no-referrer" />
                <span>${escapeHtml(img.name.slice(0, 12))}</span>
              </button>
            `
            )
            .join('')
        : `<span class="ws-muted-note">Drop images, GLBs, BIM (.ifc), videos, or audio onto SamScene.</span>`;

    const beatCardsHtml = this.beats
      .map((b, i) => {
        const moodColor = ATMOSPHERE_LIST.find((m) => m.id === b.mood)?.swatchHex || '#0A84FF';
        const isCurrent = i === this.activeBeatIndex;
        const isPlaying = this.isPlayingMovie && i === this.playingBeatIndex;
        return `
          <div class="ws-artboard ${isCurrent ? 'is-selected' : ''} ${
            isPlaying ? 'is-playing' : ''
          }" data-canvas-beat="${i}">
            <div class="ws-artboard-head">
              <span class="ws-artboard-title">${escapeHtml(b.title)}</span>
              <span class="ws-mood-dot" style="background:${moodColor}" title="Mood: ${escapeHtml(
                b.mood
              )}"></span>
            </div>
            <div class="ws-artboard-tags">
              <span class="ws-tag">${escapeHtml(b.cameraShot)}</span>
              <span class="ws-tag">${escapeHtml(b.transitionType)}</span>
              <span class="ws-tag">${escapeHtml(b.voiceName)}</span>
              ${b.muted ? '<span class="ws-tag">Muted</span>' : ''}
            </div>
            <p class="ws-artboard-script">${escapeHtml(b.script)}</p>
            <div class="ws-artboard-actions">
              <button type="button" class="ws-mini-btn" data-canvas-preview="${i}">Preview Shot</button>
              <button type="button" class="ws-mini-btn ws-mini-accent" data-canvas-speak="${i}">SamSpeak</button>
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="ws-canvas-toolbar">
        <span class="ws-canvas-label">SAMSCENE CREATIVITY FLOW</span>
        <div class="ws-row-gap">
          <button type="button" class="ws-mini-btn" id="wsCanvasAddBeat">+ Beat</button>
          <button type="button" class="ws-mini-btn ws-mini-accent" id="wsCanvasPlayAll">${
            this.isPlayingMovie ? 'Stop Movie' : 'Play Flow'
          }</button>
        </div>
      </div>

      <div class="ws-artboard ws-artboard-meta">
        <div class="ws-artboard-head">
          <span class="ws-artboard-title">00 • Scene Context</span>
          <span class="ws-tag">${escapeHtml(envLabel)} • ${escapeHtml(subjLabel)} • ${escapeHtml(
            moodObj.label
          )}</span>
        </div>
        <div class="ws-art-thumb-row">${inspoThumbs}</div>
      </div>

      <div class="ws-flow-cards-list">${beatCardsHtml}</div>
    `;

    container.querySelector('#wsCanvasAddBeat')?.addEventListener('click', () => {
      this.appendBlankBeat();
    });

    container.querySelector('#wsCanvasPlayAll')?.addEventListener('click', () => {
      if (this.isPlayingMovie) {
        this.callbacks.onStopMovie();
      } else {
        this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-place-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asset = images.find((img) => img.id === btn.dataset.canvasPlaceImg);
        if (asset) {
          this.callbacks.onArmImageInScene(asset);
          this.setArmedPlacement(asset.name);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-preview]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.canvasPreview);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-speak]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.canvasSpeak);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          void this.callbacks.onSpeakBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLElement>('[data-canvas-beat]').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.canvasBeat);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });
  }

  private renderSamPanel(container: HTMLElement): void {
    const beat = this.beats[this.activeBeatIndex] || this.beats[0];
    const images = this.getDroppedImages();
    const audioAssets = this.mediaAssets.filter((a) => a.category === 'audio');
    const envLabel =
      ENVIRONMENT_LEVELS.find((e) => e.id === this.activeEnvironment)?.label || 'Soundstage';
    const subjLabel = SUBJECT_LIST.find((s) => s.id === this.activeSubject)?.label || 'Astrolabe';

    const beatPillsHtml = this.beats
      .map((b, i) => {
        const isCurrent = i === this.activeBeatIndex;
        const isPlaying = this.isPlayingMovie && i === this.playingBeatIndex;
        return `
          <button type="button" class="ws-beat-pill ${isCurrent ? 'is-active' : ''} ${
            isPlaying ? 'is-playing' : ''
          }" data-beat-index="${i}">
            <strong>${escapeHtml(b.title)}</strong>
            <span>${escapeHtml(b.transitionType)} • ${escapeHtml(b.voiceName)}</span>
          </button>
        `;
      })
      .join('');

    const thumbsHtml = images
      .map(
        (img) => `
        <div class="ws-thumb-card">
          <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" referrerpolicy="no-referrer" />
          <div class="ws-thumb-actions">
            <button type="button" class="ws-mini-btn" data-place-img="${escapeHtml(img.id)}">3D</button>
            <button type="button" class="ws-mini-btn" data-remove-img="${escapeHtml(img.id)}">×</button>
          </div>
        </div>
      `
      )
      .join('');

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">miniAgentSam Composer</span>
          <span class="ws-muted-note">Contextual to Scene &amp; SamSpeak</span>
        </div>
        <div class="ws-context-bar">
          <span>Level: <strong>${escapeHtml(envLabel)}</strong></span>
          <span>• Subject: <strong>${escapeHtml(subjLabel)}</strong></span>
          <span>• Voice: <strong>${escapeHtml(beat?.voiceName || this.voiceName)}</strong></span>
          <span>• Media: <strong>${this.mediaAssets.length}</strong></span>
        </div>
        <textarea class="ws-textarea" id="wsPromptInput" rows="2" placeholder="Compose a guided walkthrough, audio cues, lighting transitions, or attach assets...">${escapeHtml(
          this.promptDraft
        )}</textarea>
        <div class="ws-row-gap">
          <label class="ws-dropzone">
            <input type="file" id="wsFileInput" accept="${MULTI_FILE_ACCEPT}" multiple hidden />
            <span>+ Import Media / 3D / BIM</span>
          </label>
          <button type="button" class="ws-btn ws-btn-primary" id="wsComposeBtn" ${
            this.isComposing ? 'disabled' : ''
          }>
            ${this.isComposing ? 'Composing...' : 'Compose Story'}
          </button>
        </div>
        ${images.length > 0 ? `<div class="ws-thumb-strip">${thumbsHtml}</div>` : ''}
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Storyboard Beats (${this.beats.length})</span>
          <button type="button" class="ws-mini-btn" id="wsAddBeatBtn">+ Add Beat</button>
        </div>
        <div class="ws-beat-strip">${beatPillsHtml}</div>

        ${
          beat
            ? `
          <div class="ws-beat-editor">
            <div class="ws-row-gap">
              <input type="text" class="ws-input ws-flex-1" id="wsBeatTitle" value="${escapeHtml(
                beat.title
              )}" placeholder="Beat title" />
              <button type="button" class="ws-btn ws-btn-primary" id="wsSpeakBeatBtn">SamSpeak</button>
              <button type="button" class="ws-btn ws-btn-ghost" id="wsDeleteBeatBtn" ${
                this.beats.length <= 1 ? 'disabled' : ''
              }>Del</button>
            </div>
            <div class="ws-grid-3">
              <select class="ws-select" id="wsBeatShot" title="Camera Shot">
                ${CAMERA_SHOTS.map(
                  (s) =>
                    `<option value="${s.id}" ${s.id === beat.cameraShot ? 'selected' : ''}>${escapeHtml(
                      s.label
                    )}</option>`
                ).join('')}
              </select>
              <select class="ws-select" id="wsBeatTransition" title="Camera Transition">
                ${TRANSITION_OPTIONS.map(
                  (t) =>
                    `<option value="${t.id}" ${
                      t.id === beat.transitionType ? 'selected' : ''
                    }>${escapeHtml(t.label)}</option>`
                ).join('')}
              </select>
              <select class="ws-select" id="wsBeatMood" title="Atmosphere Mood">
                ${ATMOSPHERE_LIST.map(
                  (m) =>
                    `<option value="${m.id}" ${m.id === beat.mood ? 'selected' : ''}>${escapeHtml(
                      m.label
                    )}</option>`
                ).join('')}
              </select>
            </div>
            <div class="ws-grid-2">
              <select class="ws-select" id="wsBeatMode">
                <option value="single" ${beat.ttsMode === 'single' ? 'selected' : ''}>Single Voice</option>
                <option value="dual" ${beat.ttsMode === 'dual' ? 'selected' : ''}>Dual (Alex &amp; Sam)</option>
              </select>
              <select class="ws-select" id="wsBeatVoice">
                ${VOICE_OPTIONS.map(
                  (v) =>
                    `<option value="${v.name}" ${v.name === beat.voiceName ? 'selected' : ''}>${
                      v.name
                    } (${v.tone})</option>`
                ).join('')}
              </select>
            </div>
            <div class="ws-row-gap">
              <input type="text" class="ws-input ws-flex-1" id="wsBeatStyle" value="${escapeHtml(
                beat.voiceStyle
              )}" placeholder="Voice direction" />
              <label class="ws-inline-slider">
                <span>Explode</span>
                <input type="range" id="wsBeatExplode" min="0" max="1" step="0.05" value="${
                  beat.explodeAmount
                }" />
              </label>
            </div>
            ${
              audioAssets.length > 0
                ? `
              <select class="ws-select" id="wsBeatAudioClip" title="Optional imported audio clip for this beat">
                <option value="">Voiceover (SamSpeak TTS)</option>
                ${audioAssets
                  .map(
                    (a) =>
                      `<option value="${escapeHtml(a.id)}" ${
                        a.id === beat.audioAssetId ? 'selected' : ''
                      }>Audio Clip: ${escapeHtml(a.name)}</option>`
                  )
                  .join('')}
              </select>
            `
                : ''
            }
            <textarea class="ws-textarea" id="wsBeatScript" rows="2">${escapeHtml(
              beat.script
            )}</textarea>
          </div>
        `
            : ''
        }
      </section>
    `;

    const promptInput = container.querySelector('#wsPromptInput') as HTMLTextAreaElement;
    promptInput.addEventListener('input', () => {
      this.promptDraft = promptInput.value;
    });

    const fileInput = container.querySelector('#wsFileInput') as HTMLInputElement;
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      if (files.length > 0) {
        await this.callbacks.onImportFiles(files);
      }
      fileInput.value = '';
    });

    container.querySelector('#wsComposeBtn')?.addEventListener('click', async () => {
      const prompt = this.promptDraft.trim();
      if (!prompt && images.length === 0) {
        this.showToast('Type a creative prompt or import an image first.');
        return;
      }
      this.isComposing = true;
      this.renderBody();
      try {
        const result = await this.callbacks.onComposeStory(prompt, images);
        this.movieTitle = result.movieTitle;
        this.beats = result.beats;
        this.activeBeatIndex = 0;
        this.callbacks.onPreviewBeat(this.beats[0]);
        this.callbacks.onProjectStateChange();
        this.showToast(`miniAgentSam composed "${result.movieTitle}"!`);
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : 'Compose failed.');
      } finally {
        this.isComposing = false;
        this.render();
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-beat-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.beatIndex);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-place-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asset = images.find((img) => img.id === btn.dataset.placeImg);
        if (asset) {
          this.callbacks.onArmImageInScene(asset);
          this.setArmedPlacement(asset.name);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-remove-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.removeImg;
        if (id) this.callbacks.onRemoveMediaAsset(id);
      });
    });

    container.querySelector('#wsAddBeatBtn')?.addEventListener('click', () => {
      this.appendBlankBeat();
    });

    if (beat) {
      const titleEl = container.querySelector('#wsBeatTitle') as HTMLInputElement;
      const shotEl = container.querySelector('#wsBeatShot') as HTMLSelectElement;
      const transEl = container.querySelector('#wsBeatTransition') as HTMLSelectElement;
      const moodEl = container.querySelector('#wsBeatMood') as HTMLSelectElement;
      const modeEl = container.querySelector('#wsBeatMode') as HTMLSelectElement;
      const voiceEl = container.querySelector('#wsBeatVoice') as HTMLSelectElement;
      const styleEl = container.querySelector('#wsBeatStyle') as HTMLInputElement;
      const explodeEl = container.querySelector('#wsBeatExplode') as HTMLInputElement;
      const scriptEl = container.querySelector('#wsBeatScript') as HTMLTextAreaElement;
      const audioClipEl = container.querySelector('#wsBeatAudioClip') as HTMLSelectElement | null;

      titleEl.addEventListener('input', () => {
        beat.title = titleEl.value;
        this.callbacks.onProjectStateChange();
      });
      shotEl.addEventListener('change', () => {
        beat.cameraShot = shotEl.value as CameraShotId;
        this.callbacks.onPreviewBeat(beat);
        this.callbacks.onProjectStateChange();
        if (this.viewMode === 'split') this.render();
      });
      transEl.addEventListener('change', () => {
        beat.transitionType = transEl.value as TransitionType;
        this.callbacks.onPreviewBeat(beat);
        this.callbacks.onProjectStateChange();
        if (this.viewMode === 'split') this.render();
      });
      moodEl.addEventListener('change', () => {
        beat.mood = moodEl.value as AtmosphereMoodId;
        this.callbacks.onPreviewBeat(beat);
        this.callbacks.onProjectStateChange();
        if (this.viewMode === 'split') this.render();
      });
      modeEl.addEventListener('change', () => {
        beat.ttsMode = modeEl.value as TtsMode;
        this.callbacks.onProjectStateChange();
      });
      voiceEl.addEventListener('change', () => {
        beat.voiceName = voiceEl.value as VoiceName;
        this.callbacks.onProjectStateChange();
        if (this.viewMode === 'split') this.render();
      });
      styleEl.addEventListener('input', () => {
        beat.voiceStyle = styleEl.value;
        this.callbacks.onProjectStateChange();
      });
      explodeEl.addEventListener('input', () => {
        beat.explodeAmount = Number(explodeEl.value);
        this.callbacks.onExplodeChange(beat.explodeAmount);
        this.callbacks.onProjectStateChange();
      });
      audioClipEl?.addEventListener('change', () => {
        beat.audioAssetId = audioClipEl.value || undefined;
        const found = this.mediaAssets.find((a) => a.id === beat.audioAssetId);
        beat.audioLabel = found?.name;
        this.callbacks.onProjectStateChange();
      });
      scriptEl.addEventListener('input', () => {
        beat.script = scriptEl.value;
        this.callbacks.onProjectStateChange();
      });

      container.querySelector('#wsSpeakBeatBtn')?.addEventListener('click', () => {
        this.callbacks.onPreviewBeat(beat);
        void this.callbacks.onSpeakBeat(beat);
      });

      container.querySelector('#wsDeleteBeatBtn')?.addEventListener('click', () => {
        if (this.beats.length <= 1) return;
        this.beats.splice(this.activeBeatIndex, 1);
        this.activeBeatIndex = Math.max(0, this.activeBeatIndex - 1);
        this.callbacks.onProjectStateChange();
        this.render();
      });
    }
  }

  private renderSceneryPanel(container: HTMLElement): void {
    const sel = this.selectedDetails;

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Environment Levels</span>
          <span class="ws-muted-note">Realistic 3D worlds</span>
        </div>
        <div class="ws-env-grid">
          ${ENVIRONMENT_LEVELS.map(
            (env) => `
              <button type="button" class="ws-env-card ${
                env.id === this.activeEnvironment ? 'is-active' : ''
              }" data-env-id="${env.id}" title="${escapeHtml(env.description)}">
                <div class="ws-env-card-head">
                  <span class="ws-swatch" style="background:${env.swatchHex}"></span>
                  ${escapeHtml(env.label)}
                </div>
                <span>${escapeHtml(env.subtitle)}</span>
              </button>
            `
          ).join('')}
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Centerpiece Subject</span>
        <div class="ws-chip-row">
          ${SUBJECT_LIST.map(
            (s) =>
              `<button type="button" class="ws-chip ${
                s.id === this.activeSubject ? 'is-active' : ''
              }" data-subject="${s.id}">${escapeHtml(s.label)}</button>`
          ).join('')}
        </div>
        <span class="ws-label">PBR Finish</span>
        <div class="ws-chip-row">
          ${FINISH_LIST.map(
            (f) =>
              `<button type="button" class="ws-chip ${
                f.id === this.activeFinish ? 'is-active' : ''
              }" data-finish="${f.id}">
                <span class="ws-swatch" style="background:${f.swatchHex}"></span>
                ${escapeHtml(f.label)}
              </button>`
          ).join('')}
        </div>
        <div class="ws-row-between">
          <span class="ws-label">Atmosphere Mood</span>
          <button type="button" class="ws-mini-btn" id="wsJumpLightingBtn">Dynamic Lighting ↗</button>
        </div>
        <div class="ws-chip-row">
          ${ATMOSPHERE_LIST.map(
            (m) =>
              `<button type="button" class="ws-chip ${
                m.id === this.activeMood ? 'is-active' : ''
              }" data-mood="${m.id}">
                <span class="ws-swatch" style="background:${m.swatchHex}"></span>
                ${escapeHtml(m.label)}
              </button>`
          ).join('')}
        </div>
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Object Inspector &amp; Scenery (${this.sceneryCount})</span>
          <span class="ws-muted-note">Click in 3D to drag • R rotate</span>
        </div>
        <div class="ws-grid-2">
          ${SCENERY_PROP_OPTIONS.map(
            (p) =>
              `<button type="button" class="ws-btn ws-btn-ghost" data-arm-prop="${p.type}" title="${escapeHtml(
                p.hint
              )}">+ ${escapeHtml(p.label)}</button>`
          ).join('')}
        </div>
        <div class="ws-selection-box">
          <div class="ws-row-between">
            <span class="ws-selection-text">${
              sel
                ? `${escapeHtml(sel.label)} (${sel.kind.toUpperCase()})`
                : 'Click any prop, model, video, or BIM object in 3D'
            }</span>
            ${
              sel
                ? `<label class="ws-muted-note" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                     <input type="checkbox" id="wsInspVisible" ${sel.visible ? 'checked' : ''} /> Visible
                   </label>`
                : ''
            }
          </div>
          ${
            sel
              ? `
            <div class="ws-inspector-grid">
              <label class="ws-num-field">X (m)<input type="number" step="0.1" id="wsInspX" value="${sel.position[0]}" /></label>
              <label class="ws-num-field">Y (m)<input type="number" step="0.1" id="wsInspY" value="${sel.position[1]}" /></label>
              <label class="ws-num-field">Z (m)<input type="number" step="0.1" id="wsInspZ" value="${sel.position[2]}" /></label>
              <label class="ws-num-field">Rot Y°<input type="number" step="15" id="wsInspRot" value="${sel.rotationYDeg}" /></label>
              <label class="ws-num-field">Scale<input type="number" step="0.1" min="0.25" max="4" id="wsInspScale" value="${sel.scale}" /></label>
            </div>
            ${
              sel.videoPlaying !== undefined
                ? `
              <div class="ws-row-gap">
                <button type="button" class="ws-mini-btn ws-mini-accent" id="wsInspVideoPlay">${
                  sel.videoPlaying ? 'Pause Video' : 'Play Video'
                }</button>
                <button type="button" class="ws-mini-btn" id="wsInspVideoMute">${
                  sel.videoMuted ? 'Unmute Video' : 'Mute Video'
                }</button>
              </div>
            `
                : ''
            }
            ${
              sel.animationClips && sel.animationClips.length > 0
                ? `
              <div class="ws-row-gap">
                <select class="ws-select ws-flex-1" id="wsInspAnimClip">
                  ${sel.animationClips
                    .map(
                      (name, idx) =>
                        `<option value="${idx}" ${
                          idx === sel.activeAnimationIndex ? 'selected' : ''
                        }>Clip: ${escapeHtml(name)}</option>`
                    )
                    .join('')}
                </select>
                <button type="button" class="ws-mini-btn ws-mini-accent" id="wsInspAnimToggle">${
                  sel.animationPlaying ? 'Pause Clip' : 'Play Clip'
                }</button>
              </div>
            `
                : ''
            }
            ${
              sel.bimSummary
                ? `
              <div class="ws-bim-box">
                <strong>BIM • ${escapeHtml(sel.bimSummary.schema)} — ${escapeHtml(
                  sel.bimSummary.buildingName
                )}</strong>
                <span>${sel.bimSummary.totalElements} elements • ${
                    sel.bimSummary.storeys.length
                  } storeys (${sel.bimSummary.boundingBoxMeters.join(' × ')} m)</span>
              </div>
            `
                : ''
            }
          `
              : ''
          }
          <div class="ws-row-gap">
            <button type="button" class="ws-mini-btn" id="wsFocusPropBtn" ${
              !sel ? 'disabled' : ''
            }>Focus</button>
            <button type="button" class="ws-mini-btn" id="wsRotatePropBtn" ${
              !sel ? 'disabled' : ''
            }>Rotate 45°</button>
            <button type="button" class="ws-mini-btn" id="wsDeletePropBtn" ${
              !sel ? 'disabled' : ''
            }>Delete</button>
            <button type="button" class="ws-mini-btn" id="wsClearSceneryBtn">Clear</button>
          </div>
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Stage Controls &amp; 3D Brush</span>
        <div class="ws-sliders-col">
          <label class="ws-slider-row">
            <span>Explode View</span>
            <input type="range" id="wsStageExplode" min="0" max="1" step="0.05" value="${this.stageExplode}" />
          </label>
          <label class="ws-slider-row">
            <span>Turntable Spin</span>
            <input type="range" id="wsStageSpin" min="0" max="1.4" step="0.05" value="${this.stageSpin}" />
          </label>
          <label class="ws-slider-row">
            <span>Key Light Orbit</span>
            <input type="range" id="wsStageLight" min="-1.5" max="2.5" step="0.1" value="${this.lightingState.keyAngle}" />
          </label>
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-flex-1 ${
            this.brushEnabled ? 'ws-btn-accent' : 'ws-btn-ghost'
          }" id="wsToggleBrushBtn">
            ${this.brushEnabled ? '3D Brush: ON (Drag canvas)' : '3D Brush: OFF'}
          </button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsClearBrushBtn">
            Clear (${this.strokeCount})
          </button>
        </div>
      </section>
    `;

    container.querySelectorAll<HTMLButtonElement>('[data-env-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectEnvironment(btn.dataset.envId as EnvironmentLevelId);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectSubject(btn.dataset.subject as StudioSubjectId);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectFinish(btn.dataset.finish as FinishId);
      });
    });

    container.querySelector('#wsJumpLightingBtn')?.addEventListener('click', () => {
      this.activeTab = 'lighting';
      if (this.viewMode === 'canvas') this.viewMode = 'split';
      this.render();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectMood(btn.dataset.mood as AtmosphereMoodId);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-arm-prop]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.armProp as SceneryPropType;
        const label = SCENERY_PROP_OPTIONS.find((p) => p.type === type)?.label || type;
        this.callbacks.onArmProp(type);
        this.setArmedPlacement(label);
      });
    });

    if (sel) {
      const xIn = container.querySelector('#wsInspX') as HTMLInputElement;
      const yIn = container.querySelector('#wsInspY') as HTMLInputElement;
      const zIn = container.querySelector('#wsInspZ') as HTMLInputElement;
      const rIn = container.querySelector('#wsInspRot') as HTMLInputElement;
      const sIn = container.querySelector('#wsInspScale') as HTMLInputElement;
      const vIn = container.querySelector('#wsInspVisible') as HTMLInputElement;

      xIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ x: Number(xIn.value) })
      );
      yIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ y: Number(yIn.value) })
      );
      zIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ z: Number(zIn.value) })
      );
      rIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ rotationYDeg: Number(rIn.value) })
      );
      sIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ scale: Number(sIn.value) })
      );
      vIn?.addEventListener('change', () =>
        this.callbacks.onInspectorChange({ visible: vIn.checked })
      );

      container.querySelector('#wsInspVideoPlay')?.addEventListener('click', () => {
        this.callbacks.onToggleVideoPlay();
      });
      container.querySelector('#wsInspVideoMute')?.addEventListener('click', () => {
        this.callbacks.onToggleVideoMute();
      });

      const animSel = container.querySelector('#wsInspAnimClip') as HTMLSelectElement | null;
      animSel?.addEventListener('change', () => {
        this.callbacks.onSelectAnimClip(Number(animSel.value));
      });
      container.querySelector('#wsInspAnimToggle')?.addEventListener('click', () => {
        this.callbacks.onToggleAnimPlay();
      });
    }

    container.querySelector('#wsFocusPropBtn')?.addEventListener('click', () => {
      this.callbacks.onFocusSelectedProp();
    });
    container.querySelector('#wsRotatePropBtn')?.addEventListener('click', () => {
      this.callbacks.onRotateSelectedProp();
    });
    container.querySelector('#wsDeletePropBtn')?.addEventListener('click', () => {
      this.callbacks.onDeleteSelectedProp();
    });
    container.querySelector('#wsClearSceneryBtn')?.addEventListener('click', () => {
      this.callbacks.onClearScenery();
    });

    const explodeEl = container.querySelector('#wsStageExplode') as HTMLInputElement;
    const spinEl = container.querySelector('#wsStageSpin') as HTMLInputElement;
    const lightEl = container.querySelector('#wsStageLight') as HTMLInputElement;
    explodeEl.addEventListener('input', () => {
      this.stageExplode = Number(explodeEl.value);
      this.callbacks.onExplodeChange(this.stageExplode);
    });
    spinEl.addEventListener('input', () => {
      this.stageSpin = Number(spinEl.value);
      this.callbacks.onSpinChange(this.stageSpin);
    });
    lightEl.addEventListener('input', () => {
      this.lightingState.keyAngle = Number(lightEl.value);
      this.callbacks.onLightAngleChange(this.lightingState.keyAngle);
    });

    container.querySelector('#wsToggleBrushBtn')?.addEventListener('click', () => {
      this.brushEnabled = !this.brushEnabled;
      this.callbacks.onToggleBrush(this.brushEnabled);
      this.renderBody();
    });
    container.querySelector('#wsClearBrushBtn')?.addEventListener('click', () => {
      this.callbacks.onClearBrush();
    });
  }

  private renderLightingPanel(container: HTMLElement): void {
    const s = this.lightingState;
    const angleDeg = Math.round((s.keyAngle * 180) / Math.PI);
    const satPct = Math.round(s.ambientSaturation * 100);
    const previewHex = `hsl(${s.ambientHue}, ${satPct}%, 72%)`;

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Dynamic Lighting</span>
          <button type="button" class="ws-mini-btn" id="wsResetLightingBtn">Reset Lighting</button>
        </div>

        <div class="ws-light-controls">
          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Light Intensity</span>
              <span class="ws-light-value" id="wsValKeyIntensity">${s.keyIntensity.toFixed(2)}</span>
            </div>
            <input type="range" class="ws-range" id="wsLightIntensity" min="0" max="5" step="0.05" value="${s.keyIntensity}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Color</span>
              <span class="ws-color-badge">
                <span class="ws-color-dot" id="wsAmbientSwatch" style="background:${previewHex}"></span>
                <span class="ws-light-value" id="wsValAmbientHue">${s.ambientHue}°</span>
              </span>
            </div>
            <input type="range" class="ws-range ws-hue-slider" id="wsAmbientHue" min="0" max="360" step="1" value="${s.ambientHue}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Tint</span>
              <span class="ws-light-value" id="wsValAmbientSat">${satPct}%</span>
            </div>
            <input type="range" class="ws-range" id="wsAmbientSat" min="0" max="100" step="1" value="${satPct}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Fill</span>
              <span class="ws-light-value" id="wsValAmbientFill">${s.ambientIntensity.toFixed(2)}</span>
            </div>
            <input type="range" class="ws-range" id="wsAmbientFill" min="0" max="2.5" step="0.05" value="${s.ambientIntensity}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Shadow Softness</span>
              <span class="ws-light-value" id="wsValShadowSoftness">${s.shadowSoftness.toFixed(1)} px</span>
            </div>
            <input type="range" class="ws-range" id="wsShadowSoftness" min="0.5" max="10" step="0.25" value="${s.shadowSoftness}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Key Light Angle</span>
              <span class="ws-light-value" id="wsValKeyAngle">${angleDeg}°</span>
            </div>
            <input type="range" class="ws-range" id="wsLightOrbit" min="-1.5" max="2.5" step="0.05" value="${s.keyAngle}" />
          </label>
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Atmosphere Mood Presets</span>
        <div class="ws-chip-row">
          ${ATMOSPHERE_LIST.map(
            (m) =>
              `<button type="button" class="ws-chip ${
                m.id === this.activeMood ? 'is-active' : ''
              }" data-light-mood="${m.id}">
                <span class="ws-swatch" style="background:${m.swatchHex}"></span>
                ${escapeHtml(m.label)}
              </button>`
          ).join('')}
        </div>
      </section>
    `;

    const keyIntInput = container.querySelector('#wsLightIntensity') as HTMLInputElement;
    const keyIntVal = container.querySelector('#wsValKeyIntensity') as HTMLSpanElement;
    const hueInput = container.querySelector('#wsAmbientHue') as HTMLInputElement;
    const hueVal = container.querySelector('#wsValAmbientHue') as HTMLSpanElement;
    const satInput = container.querySelector('#wsAmbientSat') as HTMLInputElement;
    const satVal = container.querySelector('#wsValAmbientSat') as HTMLSpanElement;
    const swatchEl = container.querySelector('#wsAmbientSwatch') as HTMLSpanElement;
    const fillInput = container.querySelector('#wsAmbientFill') as HTMLInputElement;
    const fillVal = container.querySelector('#wsValAmbientFill') as HTMLSpanElement;
    const shadowInput = container.querySelector('#wsShadowSoftness') as HTMLInputElement;
    const shadowVal = container.querySelector('#wsValShadowSoftness') as HTMLSpanElement;
    const orbitInput = container.querySelector('#wsLightOrbit') as HTMLInputElement;
    const orbitVal = container.querySelector('#wsValKeyAngle') as HTMLSpanElement;

    const updateAmbient = () => {
      const hue = Number(hueInput.value);
      const satPctVal = Number(satInput.value);
      const sat = satPctVal / 100;
      this.lightingState.ambientHue = hue;
      this.lightingState.ambientSaturation = sat;
      hueVal.textContent = `${hue}°`;
      satVal.textContent = `${satPctVal}%`;
      swatchEl.style.background = `hsl(${hue}, ${satPctVal}%, 72%)`;
      this.callbacks.onAmbientColorChange(hue, sat);
    };

    keyIntInput.addEventListener('input', () => {
      const val = Number(keyIntInput.value);
      this.lightingState.keyIntensity = val;
      keyIntVal.textContent = val.toFixed(2);
      this.callbacks.onKeyIntensityChange(val);
    });

    hueInput.addEventListener('input', updateAmbient);
    satInput.addEventListener('input', updateAmbient);

    fillInput.addEventListener('input', () => {
      const val = Number(fillInput.value);
      this.lightingState.ambientIntensity = val;
      fillVal.textContent = val.toFixed(2);
      this.callbacks.onAmbientIntensityChange(val);
    });

    shadowInput.addEventListener('input', () => {
      const val = Number(shadowInput.value);
      this.lightingState.shadowSoftness = val;
      shadowVal.textContent = `${val.toFixed(1)} px`;
      this.callbacks.onShadowSoftnessChange(val);
    });

    orbitInput.addEventListener('input', () => {
      const val = Number(orbitInput.value);
      this.lightingState.keyAngle = val;
      orbitVal.textContent = `${Math.round((val * 180) / Math.PI)}°`;
      this.callbacks.onLightAngleChange(val);
    });

    container.querySelector('#wsResetLightingBtn')?.addEventListener('click', () => {
      this.callbacks.onResetLighting();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-light-mood]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectMood(btn.dataset.lightMood as AtmosphereMoodId);
      });
    });
  }

  private renderWalkthroughPanel(container: HTMLElement): void {
    const volPct = Math.round(this.voiceVolume * 100);
    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Camera Director</span>
          <select class="ws-select" id="wsManualTransition">
            ${TRANSITION_OPTIONS.map(
              (t) =>
                `<option value="${t.id}" ${
                  t.id === this.manualTransition ? 'selected' : ''
                }>${escapeHtml(t.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ws-chip-row">
          ${CAMERA_SHOTS.map(
            (s) =>
              `<button type="button" class="ws-chip" data-shot="${s.id}">${escapeHtml(
                s.label
              )}</button>`
          ).join('')}
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-flex-1 ${
            this.autoTour ? 'ws-btn-accent' : 'ws-btn-ghost'
          }" id="wsAutoTourBtn">
            ${this.autoTour ? 'Auto-Orbit Tour: ON' : 'Auto-Orbit Tour: OFF'}
          </button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsResetViewBtn">
            Reset Studio
          </button>
        </div>
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">SamSpeak Studio</span>
          <span class="ws-muted-note" id="wsSamSpeakTime">Standby</span>
        </div>

        <div class="ws-waveform-box">
          <canvas id="wsSamSpeakCanvas" class="ws-waveform-canvas" width="320" height="36"></canvas>
          <div class="ws-row-between">
            <label class="ws-inline-slider" style="flex:1">
              <span>Gain ${volPct}%</span>
              <input type="range" id="wsVoiceVolume" min="0" max="1" step="0.02" value="${this.voiceVolume}" />
            </label>
            <button type="button" class="ws-mini-btn ${
              this.voiceMuted ? 'ws-btn-danger' : ''
            }" id="wsVoiceMuteBtn">${this.voiceMuted ? 'Muted' : 'Mute'}</button>
          </div>
        </div>

        <div class="ws-grid-2">
          <select class="ws-select" id="wsVoiceMode">
            <option value="single" ${this.voiceMode === 'single' ? 'selected' : ''}>Single Narrator</option>
            <option value="dual" ${this.voiceMode === 'dual' ? 'selected' : ''}>Dual (Alex &amp; Sam)</option>
          </select>
          <select class="ws-select" id="wsVoiceSelect">
            ${VOICE_OPTIONS.map(
              (v) =>
                `<option value="${v.name}" ${v.name === this.voiceName ? 'selected' : ''}>${
                  v.name
                } — ${v.tone}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ws-row-gap">
          <select class="ws-select" id="wsStylePreset">
            <option value="">Preset...</option>
            ${DEFAULT_STYLE_PRESETS.map(
              (p) => `<option value="${escapeHtml(p.style)}">${escapeHtml(p.label)}</option>`
            ).join('')}
          </select>
          <input type="text" class="ws-input ws-flex-1" id="wsVoiceStyleInput" value="${escapeHtml(
            this.voiceStyle
          )}" placeholder="Voice style direction" />
        </div>
        <textarea class="ws-textarea" id="wsVoiceScriptInput" rows="3" placeholder="Write voiceover or dialogue script for SamSpeak...">${escapeHtml(
          this.voiceScript
        )}</textarea>
        <div class="ws-row-gap">
          <button type="button" class="ws-mini-btn" data-tag=" <breath> ">+&lt;breath&gt;</button>
          <button type="button" class="ws-mini-btn" data-tag=" <laugh> ">+&lt;laugh&gt;</button>
          <button type="button" class="ws-mini-btn" data-tag=" |yeah| ">+|yeah|</button>
          <button type="button" class="ws-mini-btn" id="wsAiWriteBtn">AI Write</button>
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-btn-primary ws-flex-1" id="wsSpeakStandaloneBtn" ${
            this.isSpeakingStandalone ? 'disabled' : ''
          }>${this.isSpeakingStandalone ? 'SamSpeaking...' : 'SamSpeak Scene'}</button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsStopStandaloneBtn" ${
            !this.isSpeakingStandalone ? 'disabled' : ''
          }>Stop</button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsDownloadWavBtn" ${
            !this.hasAudioDownload ? 'disabled' : ''
          }>.WAV</button>
        </div>
      </section>
    `;

    const transEl = container.querySelector('#wsManualTransition') as HTMLSelectElement;
    transEl.addEventListener('change', () => {
      this.manualTransition = transEl.value as TransitionType;
    });

    container.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.autoTour = false;
        this.callbacks.onCameraShot(btn.dataset.shot as CameraShotId, this.manualTransition);
        this.renderBody();
      });
    });

    container.querySelector('#wsAutoTourBtn')?.addEventListener('click', () => {
      this.autoTour = !this.autoTour;
      this.callbacks.onToggleAutoTour(this.autoTour);
      this.renderBody();
    });

    container.querySelector('#wsResetViewBtn')?.addEventListener('click', () => {
      this.autoTour = false;
      this.callbacks.onResetStudio();
      this.renderBody();
    });

    const volInput = container.querySelector('#wsVoiceVolume') as HTMLInputElement;
    volInput?.addEventListener('input', () => {
      this.voiceVolume = Number(volInput.value);
      this.callbacks.onVolumeChange(this.voiceVolume);
      const label = volInput.parentElement?.querySelector('span');
      if (label) label.textContent = `Gain ${Math.round(this.voiceVolume * 100)}%`;
    });

    container.querySelector('#wsVoiceMuteBtn')?.addEventListener('click', () => {
      this.callbacks.onToggleMute();
    });

    const modeEl = container.querySelector('#wsVoiceMode') as HTMLSelectElement;
    const voiceEl = container.querySelector('#wsVoiceSelect') as HTMLSelectElement;
    const presetEl = container.querySelector('#wsStylePreset') as HTMLSelectElement;
    const styleInput = container.querySelector('#wsVoiceStyleInput') as HTMLInputElement;
    const scriptInput = container.querySelector('#wsVoiceScriptInput') as HTMLTextAreaElement;

    modeEl.addEventListener('change', () => {
      this.voiceMode = modeEl.value as TtsMode;
      this.callbacks.onProjectStateChange();
    });
    voiceEl.addEventListener('change', () => {
      this.voiceName = voiceEl.value as VoiceName;
      this.callbacks.onProjectStateChange();
    });
    presetEl.addEventListener('change', () => {
      if (presetEl.value) {
        this.voiceStyle = presetEl.value;
        styleInput.value = presetEl.value;
        this.callbacks.onProjectStateChange();
      }
    });
    styleInput.addEventListener('input', () => {
      this.voiceStyle = styleInput.value;
      this.callbacks.onProjectStateChange();
    });
    scriptInput.addEventListener('input', () => {
      this.voiceScript = scriptInput.value;
      this.callbacks.onProjectStateChange();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag || '';
        this.voiceScript = (this.voiceScript + tag).trimStart();
        scriptInput.value = this.voiceScript;
        this.callbacks.onProjectStateChange();
      });
    });

    container.querySelector('#wsAiWriteBtn')?.addEventListener('click', async () => {
      try {
        const script = await this.callbacks.onAssistScript(this.voiceMode);
        this.voiceScript = script;
        scriptInput.value = script;
        this.callbacks.onProjectStateChange();
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : 'AI write failed');
      }
    });

    container.querySelector('#wsSpeakStandaloneBtn')?.addEventListener('click', () => {
      const text = this.voiceScript.trim();
      if (!text) {
        this.showToast('Please enter a SamSpeak script first.');
        return;
      }
      if (this.voiceMode === 'dual') {
        void this.callbacks.onSynthesizeStandalone({
          mode: 'dual',
          text,
          speakerA: 'Alex',
          speakerB: 'Sam',
          voiceA: this.voiceName === 'Puck' ? 'Kore' : 'Puck',
          voiceB: this.voiceName,
          styleA: this.voiceStyle || 'Enthusiastic creative director',
          styleB: 'Curious spatial designer',
        });
      } else {
        void this.callbacks.onSynthesizeStandalone({
          mode: 'single',
          text,
          voiceName: this.voiceName,
          stylePrompt: this.voiceStyle,
        });
      }
    });

    container.querySelector('#wsStopStandaloneBtn')?.addEventListener('click', () => {
      this.callbacks.onStopAudio();
    });
    container.querySelector('#wsDownloadWavBtn')?.addEventListener('click', () => {
      this.callbacks.onDownloadAudio();
    });
  }

  private renderAssetsPanel(container: HTMLElement): void {
    const query = this.assetSearch.trim().toLowerCase();
    const filtered = this.mediaAssets.filter((a) => {
      if (this.assetFilter !== 'all' && a.category !== this.assetFilter) return false;
      if (query && !a.name.toLowerCase().includes(query)) return false;
      return true;
    });

    const filters: Array<{ id: AssetFilter; label: string }> = [
      { id: 'all', label: 'All' },
      { id: 'model', label: '3D Models' },
      { id: 'bim', label: 'BIM (.ifc)' },
      { id: 'video', label: 'Video' },
      { id: 'audio', label: 'Audio' },
      { id: 'transcript', label: 'Transcripts' },
      { id: 'image', label: 'Images' },
    ];

    const assetRowsHtml =
      filtered.length > 0
        ? filtered
            .map((a) => {
              let meta = `${a.category.toUpperCase()} • ${formatBytes(a.sizeBytes)}`;
              if (a.category === 'bim' && a.bimSummary) {
                meta = `BIM ${a.bimSummary.schema} • ${a.bimSummary.totalElements} elems • ${a.bimSummary.storeys.length} storeys`;
              } else if (a.category === 'model') {
                const fmt = a.modelStats?.format || '3D';
                const parts: string[] = [fmt];
                if (a.modelStats?.meshCount) parts.push(`${a.modelStats.meshCount} meshes`);
                if (a.animationClipNames?.length) {
                  parts.push(`${a.animationClipNames.length} anim clips`);
                }
                parts.push(formatBytes(a.sizeBytes));
                meta = parts.join(' • ');
              } else if (a.category === 'video') {
                meta = `VIDEO • ${a.width}×${a.height} • ${a.durationSec || 0}s`;
              } else if (a.category === 'audio') {
                meta = `AUDIO • ${a.durationSec || 0}s • ${formatBytes(a.sizeBytes)}`;
              } else if (a.category === 'transcript') {
                meta = `TRANSCRIPT • ${a.transcriptCues?.length || 0} cues`;
              } else if (a.category === 'image') {
                meta = `IMAGE • ${a.width}×${a.height}`;
              }

              const actionBtns =
                a.category === 'audio'
                  ? `<button type="button" class="ws-mini-btn ws-mini-accent" data-asset-play="${escapeHtml(
                      a.id
                    )}">Play</button>`
                  : a.category === 'transcript'
                    ? `<button type="button" class="ws-mini-btn" data-asset-tr-voice="${escapeHtml(
                        a.id
                      )}">-> Voice</button>
                       <button type="button" class="ws-mini-btn ws-mini-accent" data-asset-tr-beats="${escapeHtml(
                         a.id
                       )}">-> Beats</button>`
                    : `<button type="button" class="ws-mini-btn ws-mini-accent" data-asset-place="${escapeHtml(
                        a.id
                      )}">Place 3D</button>`;

              return `
                <div class="ws-asset-row">
                  <div class="ws-asset-info">
                    <span class="ws-asset-name" title="${escapeHtml(a.name)}">${escapeHtml(
                      a.name
                    )}</span>
                    <span class="ws-asset-meta">${escapeHtml(meta)}</span>
                  </div>
                  <div class="ws-row-gap">
                    ${actionBtns}
                    <button type="button" class="ws-mini-btn" data-asset-del="${escapeHtml(
                      a.id
                    )}" title="Remove">×</button>
                  </div>
                </div>
              `;
            })
            .join('')
        : `<span class="ws-muted-note">No imported assets yet. Drop GLB/glTF, BIM (.ifc), OBJ, STL, FBX, DAE, Video, Audio, Transcripts, or Images above.</span>`;

    const slotsHtml =
      this.savedSlots.length > 0
        ? this.savedSlots
            .map(
              (s) => `
              <div class="ws-asset-row">
                <div class="ws-asset-info">
                  <span class="ws-asset-name">${escapeHtml(s.name)}</span>
                  <span class="ws-asset-meta">${s.manifest.beats.length} beats • ${new Date(
                    s.updatedAt
                  ).toLocaleTimeString()}</span>
                </div>
                <div class="ws-row-gap">
                  <button type="button" class="ws-mini-btn ws-mini-accent" data-slot-load="${escapeHtml(
                    s.id
                  )}">Open</button>
                  <button type="button" class="ws-mini-btn" data-slot-del="${escapeHtml(
                    s.id
                  )}">×</button>
                </div>
              </div>
            `
            )
            .join('')
        : `<span class="ws-muted-note">Save snapshots locally or export a portable .samscene.json bundle.</span>`;

    const dropzoneContent = this.ingestProgress?.active
      ? `
        <div class="ws-dropzone-loading" id="wsDropzoneLoading">
          <div class="ws-spinner" aria-hidden="true"></div>
          <div class="ws-dropzone-copy">
            <strong>Parsing ${escapeHtml(this.ingestProgress.currentFile)}</strong>
            <span>${escapeHtml(this.ingestProgress.stage)} (${this.ingestProgress.completed + 1}/${this.ingestProgress.total})</span>
          </div>
        </div>
      `
      : `
        <div class="ws-dropzone-copy">
          <strong>Drag &amp; drop GLB / glTF or BIM (.ifc) files here</strong>
          <span>Click to browse • Parsed into 3D scene &amp; registered in Asset Registry</span>
        </div>
      `;

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Multi-Format Asset Registry (${this.mediaAssets.length})</span>
          <label class="ws-mini-btn ws-mini-accent" style="cursor:pointer;">
            <input type="file" id="wsAssetLibInput" accept="${MULTI_FILE_ACCEPT}" multiple hidden />
            + Import
          </label>
        </div>
        <div class="ws-dropzone ${this.ingestProgress?.active ? 'is-loading' : ''}" id="wsAssetsDropzone" role="button" tabindex="0" aria-label="Drop GLB, glTF, BIM IFC, or studio media files">
          ${dropzoneContent}
        </div>
        <input type="search" class="ws-input" id="wsAssetSearch" value="${escapeHtml(
          this.assetSearch
        )}" placeholder="Search models, BIM, audio, video, transcripts..." />
        <div class="ws-chip-row">
          ${filters
            .map(
              (f) =>
                `<button type="button" class="ws-chip ${
                  this.assetFilter === f.id ? 'is-active' : ''
                }" data-asset-filter="${f.id}">${f.label}</button>`
            )
            .join('')}
        </div>
        <div class="ws-asset-list">${assetRowsHtml}</div>
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">SamScene Projects &amp; Reopen</span>
          <button type="button" class="ws-mini-btn" id="wsBundleExportBtn">.samscene.json</button>
        </div>
        <div class="ws-row-gap">
          <input type="text" class="ws-input ws-flex-1" id="wsProjectNameInput" value="${escapeHtml(
            this.movieTitle
          )}" placeholder="Project title..." />
          <button type="button" class="ws-btn ws-btn-primary" id="wsSaveSlotBtn">Save Slot</button>
        </div>
        <div class="ws-asset-list">${slotsHtml}</div>
      </section>
    `;

    const fileIn = container.querySelector('#wsAssetLibInput') as HTMLInputElement;
    fileIn?.addEventListener('change', async () => {
      const files = Array.from(fileIn.files || []);
      if (files.length > 0) await this.callbacks.onImportFiles(files);
      fileIn.value = '';
    });

    const dropzone = container.querySelector('#wsAssetsDropzone') as HTMLDivElement | null;
    dropzone?.addEventListener('click', () => fileIn?.click());
    dropzone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileIn?.click();
      }
    });
    dropzone?.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-drag-over');
    });
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-drag-over');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('is-drag-over');
    });
    dropzone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('is-drag-over');
      this.setDropOverlayVisible(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) await this.callbacks.onImportFiles(files);
    });

    const searchEl = container.querySelector('#wsAssetSearch') as HTMLInputElement;
    searchEl?.addEventListener('input', () => {
      this.assetSearch = searchEl.value;
      this.renderBody();
      const restored = this.sideBodyEl.querySelector('#wsAssetSearch') as HTMLInputElement | null;
      restored?.focus();
      restored?.setSelectionRange(this.assetSearch.length, this.assetSearch.length);
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.assetFilter = btn.dataset.assetFilter as AssetFilter;
        this.renderBody();
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-place]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.assetPlace) this.callbacks.onPlaceMediaAsset(btn.dataset.assetPlace);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-play]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.assetPlay) this.callbacks.onPlayMediaAudio(btn.dataset.assetPlay);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-tr-voice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.assetTrVoice) this.callbacks.onApplyTranscript(btn.dataset.assetTrVoice, false);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-tr-beats]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.assetTrBeats) this.callbacks.onApplyTranscript(btn.dataset.assetTrBeats, true);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-asset-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.assetDel) this.callbacks.onRemoveMediaAsset(btn.dataset.assetDel);
      });
    });

    const projNameInput = container.querySelector('#wsProjectNameInput') as HTMLInputElement;
    projNameInput?.addEventListener('input', () => {
      this.movieTitle = projNameInput.value;
      this.renderHeaderState();
    });

    container.querySelector('#wsSaveSlotBtn')?.addEventListener('click', () => {
      this.callbacks.onSaveProjectSlot(this.movieTitle);
    });

    container.querySelector('#wsBundleExportBtn')?.addEventListener('click', () => {
      this.callbacks.onExportProjectBundle();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-slot-load]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.slotLoad) this.callbacks.onLoadProjectSlot(btn.dataset.slotLoad);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-slot-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.slotDel) this.callbacks.onDeleteProjectSlot(btn.dataset.slotDel);
      });
    });
  }

  private moveBeat(index: number, direction: -1 | 1): void {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= this.beats.length) return;
    const [moved] = this.beats.splice(index, 1);
    this.beats.splice(nextIdx, 0, moved);
    this.activeBeatIndex = nextIdx;
    this.callbacks.onProjectStateChange();
    this.render();
  }

  private appendBlankBeat(): void {
    const nextNum = this.beats.length + 1;
    const newBeat: MovieBeat = {
      id: `beat-${Date.now()}`,
      title: `${String(nextNum).padStart(2, '0')} • New Scene`,
      script: 'Gliding into the next chapter of our SamScene spatial story.',
      ttsMode: 'single',
      voiceName: this.voiceName,
      voiceStyle: 'Warm cinematic narrator',
      cameraShot: 'hero',
      transitionType: 'glide',
      mood: this.activeMood,
      explodeAmount: 0,
      durationSec: 4,
    };
    this.beats.push(newBeat);
    this.activeBeatIndex = this.beats.length - 1;
    this.callbacks.onProjectStateChange();
    this.render();
  }

  public dispose(): void {
    this.cleanupListeners.forEach((fn) => fn());
    this.cleanupListeners = [];
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.root.remove();
  }
}
