import {
  fetchPrimeTechEcosystem,
  lookupArchLumber,
  type LumberLookupSpec,
} from '../services/ttsService.ts';
import type { HeroAssetPreviewMode } from '../studio/environmentLevels.ts';
import type {
  EnvironmentLevelId,
  PrimeTechEcosystemSnapshot,
  SkyTriggerMode,
  StudioSubjectId,
  ThemeSceneDefinition,
} from '../types.ts';
import { u } from '../base';

export type ShowcaseTargetTab =
  | 'sam'
  | 'scenery'
  | 'materials'
  | 'lighting'
  | 'walkthrough'
  | 'assets';

export type ShowcaseSceneSlot = 'scene1' | 'scene2';

export type ShowcaseWorldPresetId =
  | 'arch-identity'
  | 'p-icon-glb'
  | 'wordmark-glb'
  | 'chamber-glb'
  | 'sculptural-emblem';

export interface ShowcaseWorldPreset {
  id: ShowcaseWorldPresetId;
  sceneSlot: ShowcaseSceneSlot;
  label: string;
  shortLabel: string;
  environmentId: EnvironmentLevelId;
  subjectId: StudioSubjectId;
  heroAssetMode: HeroAssetPreviewMode;
  triggerMode: SkyTriggerMode;
  description: string;
  meta: string;
}

export interface ShowcaseGlbModelAsset {
  id: string;
  filename: string;
  url: string;
  title: string;
  sceneSlot: ShowcaseSceneSlot;
  heroMode: HeroAssetPreviewMode;
  formatNote: string;
  description: string;
}

export const SHOWCASE_GLB_ASSETS: ShowcaseGlbModelAsset[] = [
  {
    id: 'p-icon',
    filename: 'primetech-p-icon.glb',
    url: u('/models/primetech-p-icon.glb'),
    title: '5-Facet P Icon Emblem',
    sceneSlot: 'scene1',
    heroMode: 'p-icon',
    formatNote: 'glTF 2.0 Binary · 5 Exact Facets · ~24 KB',
    description:
      'Brushed-aluminum five-facet geometric PrimeTech P emblem matching the master orthographic CAD spec with silver chamfers.',
  },
  {
    id: 'wordmark',
    filename: 'primetech-wordmark.glb',
    url: u('/models/primetech-wordmark.glb'),
    title: 'PRIMETECH 3D Wordmark & Divider',
    sceneSlot: 'scene1',
    heroMode: 'wordmark',
    formatNote: 'glTF 2.0 Binary · Wide-Stance Bezier Glyphs · ~329 KB',
    description:
      'Sleek wide-stance geometric PRIMETECH 3D lettering with rounded outer silhouettes, open counters, and metallic vertical divider.',
  },
  {
    id: 'hero-chamber',
    filename: 'primetech-hero-chamber.glb',
    url: u('/models/primetech-hero-chamber.glb'),
    title: 'Scene 01 Obsidian Chamber',
    sceneSlot: 'scene1',
    heroMode: 'full-hero',
    formatNote: 'glTF 2.0 Binary · Stepped Bulkheads & Seams · ~28 KB',
    description:
      'Double-stepped obsidian bulkhead plates, lower-left chamfer sill, cantilevered upper-right knee overhang, and neutral silver-white edge seams.',
  },
  {
    id: 'plinth-tile',
    filename: 'primetech-plinth-tile.glb',
    url: u('/models/primetech-plinth-tile.glb'),
    title: 'Ceramic P Monolith Block',
    sceneSlot: 'scene2',
    heroMode: 'full-hero',
    formatNote: 'glTF 2.0 Binary · Satin Ceramic + Chrome Bevel · ~254 KB',
    description:
      'Satin ceramic-white rounded-square monolith with brushed silver perimeter bevel and recessed dark obsidian 5-facet P mark.',
  },
  {
    id: 'sculptural-stage',
    filename: 'primetech-sculptural-stage.glb',
    url: u('/models/primetech-sculptural-stage.glb'),
    title: 'Scene 02 Sculptural Gallery Stage',
    sceneSlot: 'scene2',
    heroMode: 'full-hero',
    formatNote: 'glTF 2.0 Binary · Canopy, Wall Signature & Pedestal · ~753 KB',
    description:
      'Sweeping curved dark anodized studio canopy, left-wall PRIMETECH™ metallic signature, lower-left foreground tier, and rounded monolith pedestal.',
  },
];

export const SHOWCASE_WORLD_PRESETS: ShowcaseWorldPreset[] = [
  {
    id: 'arch-identity',
    sceneSlot: 'scene1',
    label: 'Scene 01 · Architectural Identity',
    shortLabel: 'Full Scene 01',
    environmentId: 'primetech-arch-identity',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'full-hero',
    triggerMode: 'hover-reactive',
    meta: 'Scene 01 · Obsidian Architectural Chamber + 5-Facet P | PRIMETECH + Wireframe Terrain',
    description:
      'Deep neutral obsidian and graphite chamber housing the brushed aluminum 5-facet P | PRIMETECH lockup above a faceted wireframe mountain horizon.',
  },
  {
    id: 'p-icon-glb',
    sceneSlot: 'scene1',
    label: '5-Facet P Emblem (.glb)',
    shortLabel: 'P Icon .glb',
    environmentId: 'primetech-arch-identity',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'p-icon',
    triggerMode: 'hover-reactive',
    meta: 'Asset 01 · /models/primetech-p-icon.glb · Five-Facet Brushed Aluminum Extrusion',
    description:
      'Isolate the standalone five-facet P emblem inside Scene 01 for close inspection and 360° orbit.',
  },
  {
    id: 'wordmark-glb',
    sceneSlot: 'scene1',
    label: 'PRIMETECH Wordmark (.glb)',
    shortLabel: 'Wordmark .glb',
    environmentId: 'primetech-arch-identity',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'wordmark',
    triggerMode: 'hover-reactive',
    meta: 'Asset 02 · /models/primetech-wordmark.glb · Wide-Stance Bezier Extruded Lockup',
    description:
      'Inspect the standalone wide-stance 3D extruded PRIMETECH typographic lockup and hairline vertical divider.',
  },
  {
    id: 'chamber-glb',
    sceneSlot: 'scene1',
    label: 'Bulkhead Chamber (.glb)',
    shortLabel: 'Chamber .glb',
    environmentId: 'primetech-arch-identity',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'chamber',
    triggerMode: 'hover-reactive',
    meta: 'Asset 03 · /models/primetech-hero-chamber.glb · Bulkhead Framing & Wireframe Mesh',
    description:
      'Examine the angular obsidian architectural bulkhead framing, white chamfer seams, and wireframe terrain geometry.',
  },
  {
    id: 'sculptural-emblem',
    sceneSlot: 'scene2',
    label: 'Scene 02 · Sculptural Emblem',
    shortLabel: 'Full Scene 02',
    environmentId: 'primetech-sculptural-emblem',
    subjectId: 'primetech-plinth',
    heroAssetMode: 'full-hero',
    triggerMode: 'scroll-reactive',
    meta: 'Scene 02 · Anodized Gallery Stage, Left-Wall PRIMETECH™ & Flush Ceramic Monolith',
    description:
      'Three-quarter architectural gallery featuring curved anodized wall seams, left-wall PRIMETECH™ signature, and a ceramic-white monolith seated flush on a rounded pedestal.',
  },
];

export interface PrimeTechShowcaseCallbacks {
  onOpenStudio: (options?: {
    worldId?: ShowcaseWorldPresetId;
    subjectId?: StudioSubjectId;
    environmentId?: EnvironmentLevelId;
    tab?: ShowcaseTargetTab;
  }) => void;
  onActivateSceneSlot: (slot: ShowcaseSceneSlot, heroMode?: HeroAssetPreviewMode) => void;
  onLoadGlbInStudio: (asset: ShowcaseGlbModelAsset) => void;
  onToggleHeroExplode: (exploded: boolean) => void;
  onResetSceneCamera: (slot: ShowcaseSceneSlot) => void;
  onChangeHeroTrigger: (mode: SkyTriggerMode) => void;
  onExportIamScene: (slot: ShowcaseSceneSlot) => void;
  onVisibilityChange: (visible: boolean) => void;
}

type EcoInspectorTab = 'packages' | 'tools' | 'skills' | 'jobs';

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BRAND_5FACET_SVG = `
  <svg width="22" height="26" viewBox="-46 -54 92 108" fill="none" aria-hidden="true">
    <polygon points="-19.61,-27.29 18.79,-27.29 13.24,-49.67 -3.27,-49.67" fill="#f8fafc"/>
    <polygon points="17.97,-49.51 29.41,-13.73 26.47,-6.05 42.32,-6.05 42.32,-26.96" fill="#dbe3ee"/>
    <polygon points="-13.4,21.73 8.82,21.73 39.22,-0.65 1.63,-0.65" fill="#cbd5e1"/>
    <polygon points="-42.48,23.2 -19.77,-13.73 -19.77,-19.93 -42.48,-26.8" fill="#e2e8f0"/>
    <polygon points="-18.79,-3.76 -41.34,32.03 -18.79,49.84" fill="#94a3b8"/>
  </svg>
`;

/**
 * PrimeTech Dual-Scene 3D Landing Page, Compiled .glb Asset Catalog,
 * SamScene Studio Case Study, and SQLite-Backed Ecosystem Inspector.
 */
export class PrimeTechShowcase {
  private callbacks: PrimeTechShowcaseCallbacks;
  private root: HTMLDivElement;
  private scene1ViewportEl!: HTMLDivElement;
  private scene2ViewportEl!: HTMLDivElement;
  private scene1SnapshotEl!: HTMLImageElement;
  private scene2SnapshotEl!: HTMLImageElement;
  private ecoPanelEl!: HTMLDivElement;

  private mobileMenuOpen = false;
  private isVisible = true;
  private activeSlot: ShowcaseSceneSlot = 'scene1';
  private activeScene1PresetId: ShowcaseWorldPresetId = 'arch-identity';
  private heroExploded = false;
  private heroTriggerMode: SkyTriggerMode = 'hover-reactive';
  private activeEcoTab: EcoInspectorTab = 'packages';
  private ecosystemData: PrimeTechEcosystemSnapshot | null = null;
  private themeScenes: ThemeSceneDefinition[] = [];
  private cmsDrawerOpen = false;
  private lumberResults: LumberLookupSpec[] = [];
  private activeLumberNominal = '2x4';
  private cleanupListeners: Array<() => void> = [];

  constructor(callbacks: PrimeTechShowcaseCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'pt-showcase';
    this.root.setAttribute('aria-label', 'PrimeTech Architectural 3D Identity & SamScene Case Study');
    this.render();
    document.body.appendChild(this.root);
    this.scene1ViewportEl = this.root.querySelector('#ptScene1Viewport') as HTMLDivElement;
    this.scene2ViewportEl = this.root.querySelector('#ptScene2Viewport') as HTMLDivElement;
    this.scene1SnapshotEl = this.root.querySelector('#ptScene1Snapshot') as HTMLImageElement;
    this.scene2SnapshotEl = this.root.querySelector('#ptScene2Snapshot') as HTMLImageElement;
    this.ecoPanelEl = this.root.querySelector('#ptEcoPanel') as HTMLDivElement;
    this.attachEvents();
    this.setMountedCanvasSlot('scene1');
    void this.loadEcosystemData();
    void this.loadThemeScenes();
  }

  public getSceneViewportElement(slot: ShowcaseSceneSlot): HTMLDivElement {
    return slot === 'scene2' ? this.scene2ViewportEl : this.scene1ViewportEl;
  }

  public getActiveSlot(): ShowcaseSceneSlot {
    return this.activeSlot;
  }

  public setMountedCanvasSlot(slot: ShowcaseSceneSlot): void {
    this.activeSlot = slot;
    this.scene1ViewportEl?.classList.toggle('has-live-canvas', slot === 'scene1');
    this.scene2ViewportEl?.classList.toggle('has-live-canvas', slot === 'scene2');
    const s1Section = this.root.querySelector('#pt-scene-1');
    const s2Section = this.root.querySelector('#pt-scene-2');
    s1Section?.classList.toggle('is-live-scene', slot === 'scene1');
    s2Section?.classList.toggle('is-live-scene', slot === 'scene2');
  }

  public setSceneSnapshot(slot: ShowcaseSceneSlot, dataUrl: string): void {
    if (!dataUrl) return;
    const img = slot === 'scene2' ? this.scene2SnapshotEl : this.scene1SnapshotEl;
    if (img) {
      img.src = dataUrl;
      img.classList.add('is-ready');
    }
  }

  public getScrollRoot(): HTMLDivElement {
    return this.root;
  }

  public getActiveWorld(): ShowcaseWorldPreset {
    if (this.activeSlot === 'scene2') {
      return (
        SHOWCASE_WORLD_PRESETS.find((w) => w.id === 'sculptural-emblem') ||
        SHOWCASE_WORLD_PRESETS[SHOWCASE_WORLD_PRESETS.length - 1]
      );
    }
    return (
      SHOWCASE_WORLD_PRESETS.find((w) => w.id === this.activeScene1PresetId) ||
      SHOWCASE_WORLD_PRESETS[0]
    );
  }

  public show(
    scrollToSection?: 'scene-1' | 'scene-2' | 'models' | 'case-study' | 'cad-builds'
  ): void {
    const wasHidden = !this.isVisible;
    this.isVisible = true;
    this.root.hidden = false;
    document.body.classList.add('pt-showcase-active');
    if (wasHidden) {
      this.callbacks.onVisibilityChange(true);
    }
    if (scrollToSection) {
      window.requestAnimationFrame(() => {
        const el = this.root.querySelector(`#pt-${scrollToSection}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else {
      this.root.scrollTo({ top: 0 });
    }
  }

  public hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.mobileMenuOpen = false;
    this.syncMobileMenu();
    this.root.hidden = true;
    document.body.classList.remove('pt-showcase-active');
    this.callbacks.onVisibilityChange(false);
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  private syncMobileMenu(): void {
    const drawer = this.root.querySelector('#ptMobileDrawer') as HTMLElement | null;
    const toggle = this.root.querySelector('#ptMenuToggle') as HTMLButtonElement | null;
    if (drawer) drawer.hidden = !this.mobileMenuOpen;
    if (toggle) toggle.setAttribute('aria-expanded', String(this.mobileMenuOpen));
  }

  private async loadThemeScenes(): Promise<void> {
    try {
      const resp = await fetch(u('/api/theme-scenes'));
      if (!resp.ok) return;
      const data = (await resp.json()) as { scenes?: ThemeSceneDefinition[] };
      if (Array.isArray(data.scenes)) {
        this.themeScenes = data.scenes;
        this.renderCmsPreview();
      }
    } catch {
      // Non-fatal fallback
    }
  }

  private renderCmsPreview(): void {
    const drawer = this.root.querySelector('#ptCmsJsonDrawer') as HTMLElement | null;
    const pre = this.root.querySelector('#ptCmsJsonCode') as HTMLElement | null;
    if (!drawer || !pre) return;
    drawer.hidden = !this.cmsDrawerOpen;
    if (this.cmsDrawerOpen) {
      pre.textContent = JSON.stringify(
        { scenes: this.themeScenes },
        null,
        2
      );
    }
  }

  private async loadEcosystemData(): Promise<void> {
    try {
      const [eco, lumber] = await Promise.all([
        fetchPrimeTechEcosystem(),
        lookupArchLumber(this.activeLumberNominal),
      ]);
      this.ecosystemData = eco;
      this.lumberResults = lumber;
      this.renderEcosystemInspector();
    } catch (err) {
      if (this.ecoPanelEl) {
        this.ecoPanelEl.innerHTML = `<div class="pt-eco-empty">${esc(
          err instanceof Error ? err.message : 'Unable to reach /api/primetech/ecosystem.'
        )}</div>`;
      }
    }
  }

  private syncScene1PresetUI(): void {
    const preset =
      SHOWCASE_WORLD_PRESETS.find((w) => w.id === this.activeScene1PresetId) ||
      SHOWCASE_WORLD_PRESETS[0];
    const metaEl = this.root.querySelector('#ptScene1Meta');
    if (metaEl) metaEl.textContent = preset.meta;

    this.root.querySelectorAll<HTMLButtonElement>('[data-scene1-preset]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.scene1Preset === this.activeScene1PresetId);
    });

    const explodeBtn = this.root.querySelector('#ptHeroExplodeBtn') as HTMLButtonElement | null;
    if (explodeBtn) {
      explodeBtn.classList.toggle('is-active', this.heroExploded);
      explodeBtn.textContent = this.heroExploded ? 'Assemble' : 'Explode';
    }

    const trigSelect = this.root.querySelector('#ptHeroTriggerSelect') as HTMLSelectElement | null;
    if (trigSelect) {
      trigSelect.value = this.heroTriggerMode;
    }
  }

  private renderEcosystemInspector(): void {
    if (!this.ecoPanelEl) return;
    if (!this.ecosystemData) {
      this.ecoPanelEl.innerHTML = `<div class="pt-eco-empty">Loading PrimeTech SQLite registry...</div>`;
      return;
    }

    const { packages, tools, skills, cadJobs, workflows, workflowEdges } = this.ecosystemData;

    const lumberWidget = `
      <div class="pt-lumber-bar">
        <div class="pt-lumber-head">
          <code>arch.material.lookup</code>
          <span>AWC NDS Actual vs Nominal Softwood Dimensions</span>
        </div>
        <div class="pt-lumber-btns">
          ${['2x4', '2x6', '2x8', '2x10', '2x12']
            .map(
              (nom) =>
                `<button type="button" class="pt-mini-tab ${
                  this.activeLumberNominal === nom ? 'is-active' : ''
                }" data-lumber-nom="${nom}">${nom}</button>`
            )
            .join('')}
        </div>
        <div class="pt-lumber-readout">
          ${
            this.lumberResults.length > 0
              ? this.lumberResults
                  .map(
                    (s) =>
                      `<strong>${esc(s.nominal)}</strong> → <span>${s.actualThicknessIn}" × ${
                        s.actualWidthIn
                      }"</span> <code>(${s.actualThicknessMm} × ${s.actualWidthMm} mm)</code> · <small>${esc(
                        s.source
                      )}</small>`
                  )
                  .join('')
              : '<span>Select a nominal lumber size to inspect verified dimensions.</span>'
          }
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (this.activeEcoTab === 'packages') {
      bodyHtml = `
        <div class="pt-eco-table-wrap">
          <table class="pt-eco-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Version</th>
                <th>Visibility</th>
                <th>Domain Scope</th>
              </tr>
            </thead>
            <tbody>
              ${packages
                .map(
                  (pkg) => `
                <tr>
                  <td><code>${esc(pkg.name)}</code>${
                    pkg.releaseTrain ? ` <small class="pt-eco-sub">(${esc(pkg.releaseTrain)})</small>` : ''
                  }</td>
                  <td><code>${esc(pkg.version)}</code></td>
                  <td>${esc(pkg.visibility)}</td>
                  <td>${esc(pkg.role)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.activeEcoTab === 'tools') {
      bodyHtml = `
        <div class="pt-eco-table-wrap">
          <table class="pt-eco-table">
            <thead>
              <tr>
                <th>MCP / Procedure Tool</th>
                <th>Category</th>
                <th>Handler</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${tools
                .map(
                  (t) => `
                <tr>
                  <td><code>${esc(t.tool_name)}</code></td>
                  <td>${esc(t.tool_category)}</td>
                  <td><code>${esc(t.handler_type)}</code></td>
                  <td>${esc(t.description)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${lumberWidget}
      `;
    } else if (this.activeEcoTab === 'skills') {
      bodyHtml = `
        <div class="pt-eco-skills-grid">
          ${skills
            .map(
              (sk) => `
            <div class="pt-eco-skill-item">
              <div class="pt-eco-skill-top">
                <code>${esc(sk.slash_trigger)}</code>
                <span>${esc(sk.npm_version)}</span>
              </div>
              <strong>${esc(sk.name)}</strong>
              <p>${esc(sk.description)}</p>
            </div>`
            )
            .join('')}
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="pt-eco-table-wrap">
          <table class="pt-eco-table">
            <thead>
              <tr>
                <th>CAD Job ID</th>
                <th>Engine</th>
                <th>Formats</th>
                <th>Progress</th>
                <th>Task Summary</th>
              </tr>
            </thead>
            <tbody>
              ${cadJobs
                .map(
                  (j) => `
                <tr>
                  <td><code>${esc(j.id)}</code></td>
                  <td>${esc(j.engine)}</td>
                  <td><code>${esc(j.model_formats)}</code></td>
                  <td>${j.progress_pct}% (${esc(j.status)})</td>
                  <td>${esc(j.prompt)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="pt-dag-strip">
          <div class="pt-dag-head">
            <strong>${esc(workflows[0]?.display_name || 'PrimeTech CAD Review Pipeline')}</strong>
            <code>${esc(workflows[0]?.workflow_key || 'primetech.cad-review-pipeline')}</code>
          </div>
          <div class="pt-dag-flow">
            ${workflowEdges
              .map(
                (edge, idx) =>
                  `${idx === 0 ? `<span class="pt-dag-node">${esc(edge.from_node_key)}</span>` : ''}<span class="pt-dag-arrow">→</span><span class="pt-dag-node">${esc(edge.to_node_key)}</span>`
              )
              .join('')}
          </div>
        </div>
      `;
    }

    this.ecoPanelEl.innerHTML = bodyHtml;

    this.ecoPanelEl.querySelectorAll<HTMLButtonElement>('[data-lumber-nom]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const nom = btn.dataset.lumberNom || '2x4';
        this.activeLumberNominal = nom;
        try {
          this.lumberResults = await lookupArchLumber(nom);
          this.renderEcosystemInspector();
        } catch {
          // Keep last valid specs
        }
      });
    });
  }

  private render(): void {
    const scene1Presets = SHOWCASE_WORLD_PRESETS.filter((w) => w.sceneSlot === 'scene1');
    const activeScene1 = scene1Presets[0];

    this.root.innerHTML = `
      <header class="pt-topbar">
        <div class="pt-topbar-inner">
          <a href="#pt-scene-1" class="pt-wordmark" data-pt-anchor="pt-scene-1">
            ${BRAND_5FACET_SVG}
            <span>PrimeTech</span>
          </a>

          <nav class="pt-nav" aria-label="Primary navigation">
            <a href="#pt-scene-1" class="pt-nav-link" data-pt-anchor="pt-scene-1">Scene 01</a>
            <a href="#pt-scene-2" class="pt-nav-link" data-pt-anchor="pt-scene-2">Scene 02</a>
            <a href="#pt-models" class="pt-nav-link" data-pt-anchor="pt-models">.glb Models</a>
            <a href="#pt-case-study" class="pt-nav-link" data-pt-anchor="pt-case-study">Case Study</a>
            <a href="#pt-cad-builds" class="pt-nav-link" data-pt-anchor="pt-cad-builds">Ecosystem</a>
          </nav>

          <div class="pt-topbar-actions">
            <button type="button" class="pt-cta-primary pt-open-studio-btn" data-launch-studio="scene1">
              Open 3D Studio
            </button>
            <button
              type="button"
              class="pt-menu-toggle"
              id="ptMenuToggle"
              aria-label="Toggle navigation menu"
              aria-expanded="false"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="4" y1="7" x2="20" y2="7"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="17" x2="20" y2="17"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="pt-mobile-drawer" id="ptMobileDrawer" hidden>
          <a href="#pt-scene-1" class="pt-mobile-link" data-pt-anchor="pt-scene-1">Scene 01 · Architectural Identity</a>
          <a href="#pt-scene-2" class="pt-mobile-link" data-pt-anchor="pt-scene-2">Scene 02 · Sculptural Emblem</a>
          <a href="#pt-models" class="pt-mobile-link" data-pt-anchor="pt-models">.glb Models</a>
          <a href="#pt-case-study" class="pt-mobile-link" data-pt-anchor="pt-case-study">Case Study</a>
          <a href="#pt-cad-builds" class="pt-mobile-link" data-pt-anchor="pt-cad-builds">Ecosystem</a>
          <button type="button" class="pt-cta-primary pt-mobile-studio-btn" data-launch-studio="scene1">
            Open 3D Studio
          </button>
        </div>
      </header>

      <main class="pt-main">
        <!-- SCENE ONE — PrimeTech Architectural Identity (Full-Bleed Interactive 3D Viewport) -->
        <section class="pt-hero-fullbleed pt-scene-section" id="pt-scene-1">
          <div
            class="pt-scene-viewport"
            id="ptScene1Viewport"
            aria-label="Interactive Three.js Scene 01 — PrimeTech Architectural Identity"
          >
            <img
              id="ptScene1Snapshot"
              class="pt-scene-snapshot"
              alt="PrimeTech Architectural Identity 3D chamber"
            />
          </div>

          <div class="pt-hero-scrim" aria-hidden="true"></div>

          <div class="pt-hero-overlay">
            <div class="pt-container pt-hero-overlay-inner">
              <div class="pt-hero-headline-block">
                <p class="pt-kicker" id="ptScene1Meta">${esc(activeScene1.meta)}</p>
                <h1 class="pt-hero-title">Architectural Identity</h1>
                <p class="pt-hero-sub">
                  Real binary <code>.glb</code> stepped obsidian chamber, five-facet brushed aluminum P lockup, and procedural wireframe terrain. Drag to orbit 360°.
                </p>
              </div>

              <div class="pt-hero-dock">
                <div class="pt-world-tabs" role="tablist" aria-label="Scene 01 Asset Focus">
                  ${scene1Presets
                    .map(
                      (w) => `
                    <button
                      type="button"
                      role="tab"
                      class="pt-world-tab ${w.id === activeScene1.id ? 'is-active' : ''}"
                      data-scene1-preset="${w.id}"
                    >
                      ${esc(w.shortLabel)}
                    </button>`
                    )
                    .join('')}
                </div>

                <div class="pt-world-actions">
                  <button type="button" class="pt-world-action-btn" id="ptHeroExplodeBtn">Explode</button>
                  <button type="button" class="pt-world-action-btn" data-reset-scene-cam="scene1">Reset Cam</button>
                  <select class="pt-world-select" id="ptHeroTriggerSelect" aria-label="World reactivity trigger mode">
                    <option value="hover-reactive">Hover</option>
                    <option value="scroll-reactive">Scroll</option>
                    <option value="orbit-time">Orbit</option>
                    <option value="audio-reactive">Audio</option>
                  </select>
                  <button type="button" class="pt-world-action-btn" data-export-iamscene="scene1">Export *.iamscene</button>
                  <button type="button" class="pt-cta-primary pt-dock-studio-btn" data-launch-studio="scene1">
                    Open Scene 01 in Studio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- SCENE TWO — PrimeTech Sculptural Emblem (Full-Bleed 3/4 Gallery Stage) -->
        <section class="pt-scene2-fullbleed pt-scene-section pt-border-top" id="pt-scene-2">
          <div
            class="pt-scene-viewport"
            id="ptScene2Viewport"
            aria-label="Interactive Three.js Scene 02 — PrimeTech Sculptural Emblem Monolith"
          >
            <img
              id="ptScene2Snapshot"
              class="pt-scene-snapshot"
              alt="PrimeTech Sculptural Emblem ceramic monolith seated on obsidian pedestal"
            />
          </div>

          <div class="pt-scene2-scrim" aria-hidden="true"></div>

          <div class="pt-hero-overlay">
            <div class="pt-container pt-hero-overlay-inner">
              <div class="pt-hero-headline-block">
                <p class="pt-kicker">Scene 02 · Sculptural Emblem · primetech-sculptural-stage.glb + primetech-plinth-tile.glb</p>
                <h2 class="pt-hero-title">Sculptural Monolith Stage</h2>
                <p class="pt-hero-sub">
                  Curated dark anodized studio canopy, brushed-metal left-wall <code>PRIMETECH™</code> signature, and satin ceramic-white monolith seated flush on a rounded obsidian pedestal.
                </p>
              </div>

              <div class="pt-hero-dock">
                <div class="pt-world-tabs">
                  <button type="button" class="pt-world-tab is-active" data-activate-slot="scene2">
                    Orbit Live 3D Stage
                  </button>
                  <button type="button" class="pt-world-action-btn" data-reset-scene-cam="scene2">
                    Reset Cam
                  </button>
                  <button type="button" class="pt-world-action-btn" id="ptToggleCmsJsonBtn">
                    Inspect /api/theme-scenes
                  </button>
                </div>

                <div class="pt-world-actions">
                  <button type="button" class="pt-world-action-btn" data-export-iamscene="scene2">Export *.iamscene</button>
                  <button type="button" class="pt-cta-primary pt-dock-studio-btn" data-launch-studio="scene2">
                    Open Scene 02 in Studio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="pt-cms-drawer" id="ptCmsJsonDrawer" hidden>
          <div class="pt-container">
            <div class="pt-cms-drawer-inner">
              <div class="pt-cms-drawer-head">
                <strong>CMS Registry Contract · <code>GET /api/theme-scenes</code></strong>
                <button type="button" class="pt-world-action-btn" id="ptCloseCmsJsonBtn">Close</button>
              </div>
              <pre class="pt-cms-pre" id="ptCmsJsonCode"></pre>
            </div>
          </div>
        </div>

        <!-- Compiled Binary .glb Model Assets Section -->
        <section class="pt-section pt-border-top" id="pt-models">
          <div class="pt-container">
            <div class="pt-section-head">
              <div>
                <p class="pt-kicker">Compiled Binary glTF 2.0 Assets · /public/models/*.glb</p>
                <h2 class="pt-h2">Both architectural scenes are built from real compiled .glb files.</h2>
              </div>
              <p class="pt-section-note">
                Preview any individual <code>.glb</code> asset inside Scene 01 or Scene 02 above, import it directly onto the SamScene workbench, or download the raw binary.
              </p>
            </div>

            <div class="pt-glb-grid">
              ${SHOWCASE_GLB_ASSETS.map(
                (asset) => `
                <article class="pt-scene-card">
                  <div class="pt-scene-body">
                    <div class="pt-scene-meta">${esc(asset.formatNote)}</div>
                    <h3 class="pt-h3">${esc(asset.title)}</h3>
                    <p class="pt-copy">${esc(asset.description)}</p>
                    <div class="pt-glb-path"><code>${esc(asset.url)}</code></div>
                    <div class="pt-scene-actions">
                      <button type="button" class="pt-cta-primary" data-preview-glb="${esc(asset.id)}">
                        Preview in ${asset.sceneSlot === 'scene2' ? 'Scene 02' : 'Scene 01'}
                      </button>
                      <button type="button" class="pt-cta-secondary" data-studio-glb="${esc(asset.id)}">
                        Load in Studio
                      </button>
                      <a
                        class="pt-cta-secondary"
                        href="${esc(asset.url)}"
                        download="${esc(asset.filename)}"
                      >
                        Download .glb
                      </a>
                    </div>
                  </div>
                </article>`
              ).join('')}
            </div>
          </div>
        </section>

        <!-- Clean SamScene Studio Case Study -->
        <section class="pt-section pt-border-top" id="pt-case-study">
          <div class="pt-container">
            <div class="pt-section-head">
              <div>
                <p class="pt-kicker">Engineering Case Study</p>
                <h2 class="pt-h2">SamScene Studio &amp; PrimeTech Spatial Engineering Stack</h2>
              </div>
              <p class="pt-section-note">
                Built by PrimeTech to unify architectural intelligence, deterministic FreeCAD/OCCT verification, and portable 3D scene composition across desktop and mobile.
              </p>
            </div>

            <div class="pt-metrics-strip">
              <div class="pt-metric-cell">
                <span class="pt-metric-val">5</span>
                <span class="pt-metric-label">Compiled Binary .glb Scene &amp; Emblem Assets</span>
              </div>
              <div class="pt-metric-cell">
                <span class="pt-metric-val">2</span>
                <span class="pt-metric-label">Dedicated CMS Theme Scenes (/api/theme-scenes)</span>
              </div>
              <div class="pt-metric-cell">
                <span class="pt-metric-val">5 + 12</span>
                <span class="pt-metric-label">Arch Intelligence MCP Tools &amp; AgentSam Skills</span>
              </div>
              <div class="pt-metric-cell">
                <span class="pt-metric-val">12</span>
                <span class="pt-metric-label">Procedural Canvas PBR Shaders &amp; 8 Sky Domes</span>
              </div>
            </div>

            <div class="pt-case-chapters">
              <article class="pt-chapter">
                <div class="pt-chapter-num">01</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">Binary glTF 2.0 Pipeline · Single-Context WebGL</div>
                  <h3 class="pt-h3">Dual architectural 3D stages without duplicating WebGL contexts</h3>
                  <p class="pt-copy">
                    Every PrimeTech five-facet emblem, wide-stance Bezier wordmark, ceramic monolith, and studio canopy is compiled to binary <code>.glb</code> assets loaded via <code>GLTFLoader</code>. A single WebGL renderer dynamically switches between Scene 01, Scene 02, and the full SamScene Studio while keeping off-screen sections crisp with live-captured WebGL snapshots.
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">02</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">Architectural Intelligence MCP · AWC · NCS · IFC 4.3 · IDS</div>
                  <h3 class="pt-h3">Verified dimension lookup &amp; deterministic CAD build procedures</h3>
                  <p class="pt-copy">
                    PrimeTech pairs <code>architectural-intelligence</code> (nominal-to-actual lumber checks, wall/floor/roof assembly thickness summation, CAD layer conventions, and IDS validation) with <code>primetech-procedures</code> (<code>validateProcedureManifest()</code>, SHA-256 receipt logging, and OCCT motor end-plate validation).
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">03</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">Portable Scene Graph · iamscene.v1 · /api/theme-scenes</div>
                  <h3 class="pt-h3">Declarative *.iamscene.json scenes &amp; CMS scene contracts</h3>
                  <p class="pt-copy">
                    Both showcase stages use a right-handed Y-up metric coordinate space serialized as <code>*.iamscene.json</code> and served via <code>/api/theme-scenes</code> and SQLite <code>studio_templates</code> (<code>cms_scene_section</code>), complete with frustum-calibrated FOV presets and neutral obsidian lighting overrides.
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">04</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">BIM, Video Keyframes &amp; SamSpeak · Gemini 3.8 Flash TTS</div>
                  <h3 class="pt-h3">Automated video keyframe extraction &amp; synchronized spoken direction</h3>
                  <p class="pt-copy">
                    Drop IFC building models, GLB animations, or reference videos into the SamScene workbench to extract camera trajectories, PBR textures, and character rigs stored in SQLite (<code>studio_templates</code>), paired with multi-speaker SamSpeak audio driving FFT spectrum feedback.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <!-- SQLite-Backed PrimeTech & AgentSam Ecosystem Inspector -->
        <section class="pt-section pt-border-top" id="pt-cad-builds">
          <div class="pt-container">
            <div class="pt-section-head">
              <div>
                <p class="pt-kicker">PrimeTech &amp; AgentSam Ecosystem · SQLite Registry</p>
                <h2 class="pt-h2">Packages, MCP tools, slash skills, and CAD procedure workflows.</h2>
              </div>
              <p class="pt-section-note">
                Live data queried from SQLite tables (<code>agentsam_tools</code>, <code>agentsam_skill</code>, <code>agentsam_cad_jobs</code>, and <code>agentsam_workflows</code>).
              </p>
            </div>

            <div class="pt-eco-tabs" role="tablist" aria-label="Ecosystem registry sections">
              <button type="button" class="pt-eco-tab is-active" data-eco-tab="packages">4 Packages</button>
              <button type="button" class="pt-eco-tab" data-eco-tab="tools">MCP Tools &amp; AWC Lookup</button>
              <button type="button" class="pt-eco-tab" data-eco-tab="skills">12 Arch Skills</button>
              <button type="button" class="pt-eco-tab" data-eco-tab="jobs">CAD Jobs &amp; Workflow DAG</button>
            </div>

            <div class="pt-eco-panel" id="ptEcoPanel"></div>
          </div>
        </section>
      </main>

      <footer class="pt-footer">
        <div class="pt-container pt-footer-inner">
          <div class="pt-footer-brand">
            <strong>PrimeTech</strong>
            <span>Owner &amp; creator of SamScene 3D Studio, PrimeTech Procedures &amp; IAMScene.</span>
          </div>
          <div class="pt-footer-links">
            <a href="#pt-scene-1" data-pt-anchor="pt-scene-1">Scene 01</a>
            <a href="#pt-scene-2" data-pt-anchor="pt-scene-2">Scene 02</a>
            <a href="#pt-models" data-pt-anchor="pt-models">.glb Models</a>
            <a href="#pt-case-study" data-pt-anchor="pt-case-study">Case Study</a>
            <button type="button" class="pt-footer-studio-btn" data-launch-studio="scene1">Open 3D Studio</button>
          </div>
        </div>
      </footer>
    `;
  }

  private selectScene1Preset(presetId: ShowcaseWorldPresetId, scrollToScene = false): void {
    const preset = SHOWCASE_WORLD_PRESETS.find((w) => w.id === presetId);
    if (!preset) return;
    this.activeScene1PresetId = preset.id;
    this.heroTriggerMode = preset.triggerMode;
    this.syncScene1PresetUI();
    this.callbacks.onActivateSceneSlot('scene1', preset.heroAssetMode);
    if (scrollToScene) {
      this.root.querySelector('#pt-scene-1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private attachEvents(): void {
    const menuToggle = this.root.querySelector('#ptMenuToggle') as HTMLButtonElement | null;
    menuToggle?.addEventListener('click', () => {
      this.mobileMenuOpen = !this.mobileMenuOpen;
      this.syncMobileMenu();
    });

    this.root.querySelectorAll<HTMLElement>('[data-pt-anchor]').forEach((el) => {
      const handler = (e: Event) => {
        e.preventDefault();
        const targetId = el.dataset.ptAnchor;
        this.mobileMenuOpen = false;
        this.syncMobileMenu();
        if (targetId) {
          this.root
            .querySelector(`#${targetId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (targetId === 'pt-scene-1') {
            this.callbacks.onActivateSceneSlot('scene1');
          } else if (targetId === 'pt-scene-2') {
            this.callbacks.onActivateSceneSlot('scene2');
          }
        }
      };
      el.addEventListener('click', handler);
      this.cleanupListeners.push(() => el.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-launch-studio]').forEach((btn) => {
      const handler = () => {
        const slot = (btn.dataset.launchStudio as ShowcaseSceneSlot) || this.activeSlot;
        const preset =
          slot === 'scene2'
            ? SHOWCASE_WORLD_PRESETS.find((w) => w.id === 'sculptural-emblem')!
            : SHOWCASE_WORLD_PRESETS.find((w) => w.id === this.activeScene1PresetId) ||
              SHOWCASE_WORLD_PRESETS[0];
        this.callbacks.onOpenStudio({
          worldId: preset.id,
          subjectId: preset.subjectId,
          environmentId: preset.environmentId,
        });
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-scene1-preset]').forEach((btn) => {
      const handler = () => {
        const id = btn.dataset.scene1Preset as ShowcaseWorldPresetId;
        if (id) this.selectScene1Preset(id, false);
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-activate-slot]').forEach((btn) => {
      const handler = () => {
        const slot = btn.dataset.activateSlot as ShowcaseSceneSlot;
        if (slot) {
          this.callbacks.onActivateSceneSlot(slot, 'full-hero');
        }
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-reset-scene-cam]').forEach((btn) => {
      const handler = () => {
        const slot = (btn.dataset.resetSceneCam as ShowcaseSceneSlot) || 'scene1';
        this.callbacks.onResetSceneCamera(slot);
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-export-iamscene]').forEach((btn) => {
      const handler = () => {
        const slot = (btn.dataset.exportIamscene as ShowcaseSceneSlot) || this.activeSlot;
        this.callbacks.onExportIamScene(slot);
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-preview-glb]').forEach((btn) => {
      const handler = () => {
        const assetId = btn.dataset.previewGlb;
        const asset = SHOWCASE_GLB_ASSETS.find((a) => a.id === assetId);
        if (!asset) return;
        if (asset.sceneSlot === 'scene2') {
          this.callbacks.onActivateSceneSlot('scene2', 'full-hero');
          this.root.querySelector('#pt-scene-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          const modeMap: Record<string, ShowcaseWorldPresetId> = {
            'p-icon': 'p-icon-glb',
            wordmark: 'wordmark-glb',
            'hero-chamber': 'arch-identity',
          };
          this.selectScene1Preset(modeMap[asset.id] || 'arch-identity', true);
        }
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-studio-glb]').forEach((btn) => {
      const handler = () => {
        const assetId = btn.dataset.studioGlb;
        const asset = SHOWCASE_GLB_ASSETS.find((a) => a.id === assetId);
        if (asset) {
          this.callbacks.onLoadGlbInStudio(asset);
        }
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    const explodeBtn = this.root.querySelector('#ptHeroExplodeBtn');
    explodeBtn?.addEventListener('click', () => {
      this.heroExploded = !this.heroExploded;
      this.syncScene1PresetUI();
      this.callbacks.onActivateSceneSlot('scene1');
      this.callbacks.onToggleHeroExplode(this.heroExploded);
    });

    const trigSelect = this.root.querySelector('#ptHeroTriggerSelect') as HTMLSelectElement | null;
    trigSelect?.addEventListener('change', () => {
      this.heroTriggerMode = trigSelect.value as SkyTriggerMode;
      this.callbacks.onChangeHeroTrigger(this.heroTriggerMode);
    });

    this.root.querySelector('#ptToggleCmsJsonBtn')?.addEventListener('click', () => {
      this.cmsDrawerOpen = !this.cmsDrawerOpen;
      this.renderCmsPreview();
    });

    this.root.querySelector('#ptCloseCmsJsonBtn')?.addEventListener('click', () => {
      this.cmsDrawerOpen = false;
      this.renderCmsPreview();
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-eco-tab]').forEach((btn) => {
      const handler = () => {
        const next = btn.dataset.ecoTab as EcoInspectorTab;
        if (!next) return;
        this.activeEcoTab = next;
        this.root.querySelectorAll<HTMLButtonElement>('[data-eco-tab]').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.ecoTab === next);
        });
        this.renderEcosystemInspector();
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });
  }

  public dispose(): void {
    this.cleanupListeners.forEach((fn) => fn());
    this.cleanupListeners = [];
    this.root.remove();
  }
}
