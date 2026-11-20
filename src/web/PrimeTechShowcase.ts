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
} from '../types.ts';

export type ShowcaseTargetTab =
  | 'sam'
  | 'scenery'
  | 'materials'
  | 'lighting'
  | 'walkthrough'
  | 'assets';

export type ShowcaseWorldPresetId =
  | 'cadmesh-vault'
  | 'p-icon-glb'
  | 'wordmark-glb'
  | 'plinth-vault'
  | 'iamscene-circuit';

export interface ShowcaseWorldPreset {
  id: ShowcaseWorldPresetId;
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
  heroMode: HeroAssetPreviewMode;
  formatNote: string;
  description: string;
}

export const SHOWCASE_GLB_ASSETS: ShowcaseGlbModelAsset[] = [
  {
    id: 'p-icon',
    filename: 'primetech-p-icon.glb',
    url: '/models/primetech-p-icon.glb',
    title: 'Geometric P Icon Emblem',
    heroMode: 'p-icon',
    formatNote: 'glTF 2.0 Binary · 4 Extruded Bevel Facets · ~20 KB',
    description:
      'Four-part beveled brushed-aluminum & chrome geometric P monogram compiled directly to binary glTF 2.0.',
  },
  {
    id: 'wordmark',
    filename: 'primetech-wordmark.glb',
    url: '/models/primetech-wordmark.glb',
    title: 'PRIMETECH 3D Wordmark & Divider',
    heroMode: 'wordmark',
    formatNote: 'glTF 2.0 Binary · 31 Mesh Primitives · ~110 KB',
    description:
      'Wide-stance architectural sans-serif PRIMETECH 3D lettering paired with the luminous hairline vertical separator bar.',
  },
  {
    id: 'plinth-tile',
    filename: 'primetech-plinth-tile.glb',
    url: '/models/primetech-plinth-tile.glb',
    title: 'Ceramic P Monolith Block',
    heroMode: 'plinth-tile',
    formatNote: 'glTF 2.0 Binary · Ceramic + Stainless Bezel · ~182 KB',
    description:
      'Satin ceramic-white rounded emblem block with recessed obsidian geometric P relief and brushed stainless chamfers.',
  },
  {
    id: 'hero-chamber',
    filename: 'primetech-hero-chamber.glb',
    url: '/models/primetech-hero-chamber.glb',
    title: 'Obsidian Aperture Chamber',
    heroMode: 'chamber',
    formatNote: 'glTF 2.0 Binary · 6 Bulkhead Plates & Seams · ~20 KB',
    description:
      'Stepped angular obsidian bulkhead armor plates, lower chamfer sill, cantilevered wing, and backlit white seam beams.',
  },
];

export const SHOWCASE_WORLD_PRESETS: ShowcaseWorldPreset[] = [
  {
    id: 'cadmesh-vault',
    label: 'Full Hero 3D Chamber',
    shortLabel: 'Full Hero Scene',
    environmentId: 'primetech-vault',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'full-hero',
    triggerMode: 'hover-reactive',
    meta: 'World 01 · Real .glb Chamber + P Icon + PRIMETECH Wordmark · Wireframe Mountain Horizon',
    description:
      'Edge-to-edge architectural obsidian chamber loading all binary .glb logo & bulkhead assets above an animated wireframe mountain range.',
  },
  {
    id: 'p-icon-glb',
    label: 'P Icon Emblem (.glb)',
    shortLabel: 'P Icon .glb',
    environmentId: 'primetech-vault',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'p-icon',
    triggerMode: 'hover-reactive',
    meta: 'Asset 01 · /models/primetech-p-icon.glb · Brushed Aluminum 4-Facet Extrusion',
    description:
      'Isolate the standalone binary .glb P emblem inside the lit obsidian spotlight aperture for 360° surface inspection.',
  },
  {
    id: 'wordmark-glb',
    label: 'PRIMETECH Wordmark (.glb)',
    shortLabel: 'Wordmark .glb',
    environmentId: 'primetech-vault',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'wordmark',
    triggerMode: 'hover-reactive',
    meta: 'Asset 02 · /models/primetech-wordmark.glb · 3D Extruded Typography + Seam Bar',
    description:
      'Inspect the standalone wide-stance 3D extruded PRIMETECH typographic lockup and luminous hairline divider.',
  },
  {
    id: 'plinth-vault',
    label: 'Ceramic Monolith Block (.glb)',
    shortLabel: 'Plinth Tile .glb',
    environmentId: 'primetech-vault',
    subjectId: 'primetech-plinth',
    heroAssetMode: 'plinth-tile',
    triggerMode: 'scroll-reactive',
    meta: 'Asset 03 · /models/primetech-plinth-tile.glb · Satin Ceramic + Titanium Datum Tier',
    description:
      'Orbit the satin ceramic-white rounded monolith block with recessed obsidian P relief seated above an illuminated titanium tier.',
  },
  {
    id: 'iamscene-circuit',
    label: 'IAMScene Circuit World',
    shortLabel: 'IAMScene Circuit',
    environmentId: 'iamscene-circuit',
    subjectId: 'primetech-cadmesh',
    heroAssetMode: 'full-hero',
    triggerMode: 'hover-reactive',
    meta: 'World 02 · iamscene.v1 · Hover & Scroll-Driven Circuit Traces',
    description:
      'Real-time 3D implementation of IAMScene circuit worlds with concentric PCB traces, 36 instanced pulse packets, and arched loops.',
  },
];

export interface PrimeTechShowcaseCallbacks {
  onOpenStudio: (options?: {
    worldId?: ShowcaseWorldPresetId;
    subjectId?: StudioSubjectId;
    environmentId?: EnvironmentLevelId;
    tab?: ShowcaseTargetTab;
  }) => void;
  onSelectHeroWorld: (world: ShowcaseWorldPreset) => void;
  onLoadGlbInStudio: (asset: ShowcaseGlbModelAsset) => void;
  onToggleHeroExplode: (exploded: boolean) => void;
  onResetHeroCamera: () => void;
  onChangeHeroTrigger: (mode: SkyTriggerMode) => void;
  onExportIamScene: () => void;
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

/**
 * PrimeTech Full-Bleed 3D Hero World Showcase, Real .glb Model Asset Library,
 * SamScene Studio Case Study, and SQLite-Backed Architecture Ecosystem Inspector.
 */
export class PrimeTechShowcase {
  private callbacks: PrimeTechShowcaseCallbacks;
  private root: HTMLDivElement;
  private heroViewportEl!: HTMLDivElement;
  private ecoPanelEl!: HTMLDivElement;

  private mobileMenuOpen = false;
  private isVisible = true;
  private activeWorldId: ShowcaseWorldPresetId = 'cadmesh-vault';
  private heroExploded = false;
  private heroTriggerMode: SkyTriggerMode = 'hover-reactive';
  private activeEcoTab: EcoInspectorTab = 'packages';
  private ecosystemData: PrimeTechEcosystemSnapshot | null = null;
  private lumberResults: LumberLookupSpec[] = [];
  private activeLumberNominal = '2x4';
  private cleanupListeners: Array<() => void> = [];

  constructor(callbacks: PrimeTechShowcaseCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'pt-showcase';
    this.root.setAttribute('aria-label', 'PrimeTech Full-Bleed 3D Hero Scene & Case Study');
    this.render();
    document.body.appendChild(this.root);
    this.heroViewportEl = this.root.querySelector('#ptHeroViewport') as HTMLDivElement;
    this.ecoPanelEl = this.root.querySelector('#ptEcoPanel') as HTMLDivElement;
    this.attachEvents();
    void this.loadEcosystemData();
  }

  public getHeroViewportElement(): HTMLDivElement {
    return this.heroViewportEl;
  }

  public getScrollRoot(): HTMLDivElement {
    return this.root;
  }

  public getActiveWorld(): ShowcaseWorldPreset {
    return (
      SHOWCASE_WORLD_PRESETS.find((w) => w.id === this.activeWorldId) ||
      SHOWCASE_WORLD_PRESETS[0]
    );
  }

  public show(
    scrollToSection?: 'overview' | 'models' | 'scenes' | 'case-study' | 'cad-builds'
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

  private syncHeroWorldUI(): void {
    const world = this.getActiveWorld();
    const captionSub = this.root.querySelector('#ptHeroWorldMeta');
    if (captionSub) captionSub.textContent = world.meta;

    this.root.querySelectorAll<HTMLButtonElement>('[data-hero-world]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.heroWorld === this.activeWorldId);
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
    const activeWorld = this.getActiveWorld();

    this.root.innerHTML = `
      <header class="pt-topbar">
        <div class="pt-topbar-inner">
          <a href="#pt-overview" class="pt-wordmark" data-pt-anchor="pt-overview">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <polygon points="5,13 10,5 19,5 16,13" fill="#f5f5f7"/>
              <polygon points="20,6 27,13 22,20 17,13" fill="#cbd5e1"/>
              <polygon points="12,18 23,18 19,23 9,23" fill="#94a3b8"/>
              <polygon points="5,14 10,14 10,28 5,23" fill="#f5f5f7"/>
            </svg>
            <span>PrimeTech</span>
          </a>

          <nav class="pt-nav" aria-label="Primary navigation">
            <a href="#pt-overview" class="pt-nav-link" data-pt-anchor="pt-overview">Hero 3D</a>
            <a href="#pt-models" class="pt-nav-link" data-pt-anchor="pt-models">.glb Models</a>
            <a href="#pt-case-study" class="pt-nav-link" data-pt-anchor="pt-case-study">Case Study</a>
            <a href="#pt-cad-builds" class="pt-nav-link" data-pt-anchor="pt-cad-builds">Ecosystem</a>
          </nav>

          <div class="pt-topbar-actions">
            <button type="button" class="pt-cta-primary pt-open-studio-btn" data-launch-studio>
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
          <a href="#pt-overview" class="pt-mobile-link" data-pt-anchor="pt-overview">Hero 3D</a>
          <a href="#pt-models" class="pt-mobile-link" data-pt-anchor="pt-models">.glb Models</a>
          <a href="#pt-case-study" class="pt-mobile-link" data-pt-anchor="pt-case-study">Case Study</a>
          <a href="#pt-cad-builds" class="pt-mobile-link" data-pt-anchor="pt-cad-builds">Ecosystem</a>
          <button type="button" class="pt-cta-primary pt-mobile-studio-btn" data-launch-studio>
            Open 3D Studio
          </button>
        </div>
      </header>

      <main class="pt-main">
        <!-- Edge-to-Edge Full-Bleed Live 3D Hero Full Scene -->
        <section class="pt-hero-fullbleed" id="pt-overview">
          <!-- 100vw x full-height WebGL Stage -->
          <div
            class="pt-hero-stage"
            id="ptHeroViewport"
            aria-label="Full-bleed interactive Three.js 3D PrimeTech Hero Chamber"
          ></div>

          <!-- Directional Dark Scrim preserving readability without obscuring the upper 3D chamber -->
          <div class="pt-hero-scrim" aria-hidden="true"></div>

          <!-- Editorial Overlay + Compact Frosted Control Dock (pointer-events pass-through except buttons) -->
          <div class="pt-hero-overlay">
            <div class="pt-container pt-hero-overlay-inner">
              <div class="pt-hero-headline-block">
                <p class="pt-kicker" id="ptHeroWorldMeta">${esc(activeWorld.meta)}</p>
                <h1 class="pt-hero-title">
                  Full-bleed obsidian CAD chamber &amp; procedural .glb identity.
                </h1>
                <p class="pt-hero-sub">
                  Drag to orbit 360° across real binary <code>.glb</code> aluminum geometry and live hover/scroll wireframe mountains.
                </p>
                <div class="pt-hero-actions">
                  <button type="button" class="pt-cta-primary" data-launch-studio>
                    Enter Full 3D Studio
                  </button>
                  <button type="button" class="pt-cta-secondary" id="ptHeroDownloadIamScene">
                    Export *.iamscene.json
                  </button>
                </div>
              </div>

              <div class="pt-hero-dock">
                <div class="pt-world-tabs" role="tablist" aria-label="Select 3D Hero View">
                  ${SHOWCASE_WORLD_PRESETS.map(
                    (w) => `
                    <button
                      type="button"
                      role="tab"
                      class="pt-world-tab ${w.id === activeWorld.id ? 'is-active' : ''}"
                      data-hero-world="${w.id}"
                    >
                      ${esc(w.shortLabel)}
                    </button>`
                  ).join('')}
                </div>

                <div class="pt-world-actions">
                  <button type="button" class="pt-world-action-btn" id="ptHeroExplodeBtn">Explode</button>
                  <button type="button" class="pt-world-action-btn" id="ptHeroResetCamBtn">Reset Cam</button>
                  <select class="pt-world-select" id="ptHeroTriggerSelect" aria-label="World reactivity trigger mode">
                    <option value="hover-reactive">Hover</option>
                    <option value="scroll-reactive">Scroll</option>
                    <option value="orbit-time">Orbit</option>
                    <option value="audio-reactive">Audio</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Real Binary .glb Model Assets Section -->
        <section class="pt-section pt-border-top" id="pt-models">
          <div class="pt-container">
            <div class="pt-section-head">
              <div>
                <p class="pt-kicker">Compiled Binary glTF 2.0 Assets · /public/models/*.glb</p>
                <h2 class="pt-h2">Every emblem, wordmark, and bulkhead plate exists as a real .glb file.</h2>
              </div>
              <p class="pt-section-note">
                Preview any individual <code>.glb</code> asset inside the full-bleed Hero 3D stage above, import it onto the SamScene workbench, or download the raw binary.
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
                        Preview in Hero 3D
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
                Designed and maintained by PrimeTech to unify architectural intelligence, deterministic FreeCAD/OCCT verification, and portable 3D scene composition.
              </p>
            </div>

            <!-- Verifiable Architecture Metrics Strip -->
            <div class="pt-metrics-strip">
              <div class="pt-metric-cell">
                <span class="pt-metric-val">4</span>
                <span class="pt-metric-label">Compiled .glb Models &amp; Core Packages (v2.6.14)</span>
              </div>
              <div class="pt-metric-cell">
                <span class="pt-metric-val">5 + 12</span>
                <span class="pt-metric-label">Arch Intelligence MCP Tools &amp; AgentSam Skills</span>
              </div>
              <div class="pt-metric-cell">
                <span class="pt-metric-val">7</span>
                <span class="pt-metric-label">Live 3D Worlds (Vault, Circuit, Atrium, Orbital &amp; More)</span>
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
                  <h3 class="pt-h3">Real compiled .glb chamber, P icon &amp; wordmark in full-bleed WebGL</h3>
                  <p class="pt-copy">
                    Every PrimeTech emblem facet, wordmark letterform, ceramic relief monolith, and angular bulkhead baffle is compiled to standard binary <code>.glb</code> assets loaded via <code>GLTFLoader</code>. Rather than duplicating WebGL contexts, the renderer canvas transfers seamlessly between the full-bleed Hero stage and the multi-panel SamScene editor.
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">02</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">Architectural Intelligence MCP · AWC · NCS · IFC 4.3 · IDS</div>
                  <h3 class="pt-h3">Verified dimension lookup &amp; deterministic build procedures</h3>
                  <p class="pt-copy">
                    PrimeTech pairs <code>architectural-intelligence</code> (nominal-to-actual lumber checks, wall/floor/roof assembly thickness summation, CAD layer conventions, and IDS validation) with <code>primetech-procedures</code> (<code>validateProcedureManifest()</code>, SHA-256 receipt logging, and OCCT motor end-plate validation).
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">03</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">Portable Scene Graph · iamscene.v1 · No Executable JS</div>
                  <h3 class="pt-h3">Declarative *.iamscene.json scenes &amp; circuit hover/scroll mechanics</h3>
                  <p class="pt-copy">
                    Every world scene uses a right-handed Y-up metric coordinate space serialized cleanly as <code>*.iamscene.json</code>. Pointer coordinates and scroll depth feed directly into terrain mountain vertex displacement, starfield/galaxy shaders, and instanced PCB signal pulses in <code>iamscene-circuit</code>.
                  </p>
                </div>
              </article>

              <article class="pt-chapter">
                <div class="pt-chapter-num">04</div>
                <div class="pt-chapter-content">
                  <div class="pt-chapter-meta">BIM, Video Keyframes &amp; SamSpeak · Gemini 3.8 Flash TTS</div>
                  <h3 class="pt-h3">Automated video keyframe extraction &amp; synchronized spoken direction</h3>
                  <p class="pt-copy">
                    Drop IFC building models, GLB animations, or reference videos into the studio to extract camera trajectories, PBR textures, and character rigs stored in SQLite (<code>studio_templates</code>), paired with multi-speaker SamSpeak audio driving FFT spectrum feedback.
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
            <a href="#pt-overview" data-pt-anchor="pt-overview">Hero 3D</a>
            <a href="#pt-models" data-pt-anchor="pt-models">.glb Models</a>
            <a href="#pt-case-study" data-pt-anchor="pt-case-study">Case Study</a>
            <button type="button" class="pt-footer-studio-btn" data-launch-studio>Open 3D Studio</button>
          </div>
        </div>
      </footer>
    `;
  }

  private selectWorld(worldId: ShowcaseWorldPresetId, scrollToTop = false): void {
    const preset = SHOWCASE_WORLD_PRESETS.find((w) => w.id === worldId);
    if (!preset) return;
    this.activeWorldId = preset.id;
    this.heroTriggerMode = preset.triggerMode;
    this.syncHeroWorldUI();
    this.callbacks.onSelectHeroWorld(preset);
    if (scrollToTop) {
      this.root.scrollTo({ top: 0, behavior: 'smooth' });
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
        }
      };
      el.addEventListener('click', handler);
      this.cleanupListeners.push(() => el.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-launch-studio]').forEach((btn) => {
      const handler = () => {
        const w = this.getActiveWorld();
        this.callbacks.onOpenStudio({
          worldId: w.id,
          subjectId: w.subjectId,
          environmentId: w.environmentId,
        });
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-hero-world]').forEach((btn) => {
      const handler = () => {
        const worldId = btn.dataset.heroWorld as ShowcaseWorldPresetId;
        if (worldId) this.selectWorld(worldId, false);
      };
      btn.addEventListener('click', handler);
      this.cleanupListeners.push(() => btn.removeEventListener('click', handler));
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-preview-glb]').forEach((btn) => {
      const handler = () => {
        const assetId = btn.dataset.previewGlb;
        const modeMap: Record<string, ShowcaseWorldPresetId> = {
          'p-icon': 'p-icon-glb',
          wordmark: 'wordmark-glb',
          'plinth-tile': 'plinth-vault',
          'hero-chamber': 'cadmesh-vault',
        };
        const worldId = (assetId && modeMap[assetId]) || 'cadmesh-vault';
        this.selectWorld(worldId, true);
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
      this.syncHeroWorldUI();
      this.callbacks.onToggleHeroExplode(this.heroExploded);
    });

    const resetBtn = this.root.querySelector('#ptHeroResetCamBtn');
    resetBtn?.addEventListener('click', () => {
      this.callbacks.onResetHeroCamera();
    });

    const trigSelect = this.root.querySelector('#ptHeroTriggerSelect') as HTMLSelectElement | null;
    trigSelect?.addEventListener('change', () => {
      this.heroTriggerMode = trigSelect.value as SkyTriggerMode;
      this.callbacks.onChangeHeroTrigger(this.heroTriggerMode);
    });

    this.root.querySelector('#ptHeroDownloadIamScene')?.addEventListener('click', () => {
      this.callbacks.onExportIamScene();
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
