import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './libraryGallery.css';
import { LIBRARY_OPEN_EVENT, type LibraryItem, type LibraryManifest } from './libraryTypes.ts';
import { u } from '../base';

const THUMB_W = 480;
const THUMB_H = 300;

const PLUS_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

/** Renders GLB thumbnails one at a time on a single short-lived renderer. */
class GlbThumbnailer {
  private cache = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly loader = new GLTFLoader();

  render(url: string): Promise<string | null> {
    const hit = this.cache.get(url);
    if (hit) return Promise.resolve(hit);
    this.pending++;
    const job = this.queue.then(() => this.renderOne(url));
    this.queue = job.catch(() => null).finally(() => {
      if (--this.pending === 0) this.release();
    });
    return job.catch(() => null);
  }

  private release(): void {
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }

  private async renderOne(url: string): Promise<string> {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(THUMB_W, THUMB_H, false);
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    const renderer = this.renderer;
    const gltf = await this.loader.loadAsync(url);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a95, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    scene.add(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 0.01, 10000);
    const radius = Math.max(size.x, size.y, size.z, 1e-3);
    const distance = (radius / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * 1.7;
    camera.position.copy(center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(distance));
    camera.lookAt(center);

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    });
    this.cache.set(url, dataUrl);
    return dataUrl;
  }
}

export class LibraryGallery {
  private readonly manifestUrl: string;
  private bar!: HTMLDivElement;
  private button!: HTMLButtonElement;
  private pop!: HTMLDivElement;
  private grid!: HTMLDivElement;
  private loaded = false;
  private readonly thumbnailer = new GlbThumbnailer();

  constructor(options: { manifestUrl?: string } = {}) {
    this.manifestUrl = options.manifestUrl ?? u('/library/library.json');
  }

  mount(parent: HTMLElement): void {
    this.bar = document.createElement('div');
    this.bar.className = 'lib-bar';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'lib-add';
    this.button.title = 'Library';
    this.button.setAttribute('aria-label', 'Open library');
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.innerHTML = PLUS_ICON;
    this.bar.appendChild(this.button);

    this.pop = document.createElement('div');
    this.pop.className = 'lib-pop';
    this.pop.hidden = true;
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-label', 'Library');
    this.grid = document.createElement('div');
    this.grid.className = 'lib-grid';
    this.pop.appendChild(this.grid);

    parent.append(this.bar, this.pop);

    this.button.addEventListener('click', () => (this.pop.hidden ? void this.open() : this.close()));
    document.addEventListener('pointerdown', (e) => {
      if (this.pop.hidden) return;
      const target = e.target as Node;
      if (!this.pop.contains(target) && !this.bar.contains(target)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.pop.hidden) {
        this.close();
        this.button.focus();
      }
    });
  }

  private async open(): Promise<void> {
    this.pop.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    if (!this.loaded) {
      this.loaded = true;
      try {
        const resp = await fetch(this.manifestUrl);
        if (!resp.ok) throw new Error(String(resp.status));
        const manifest = (await resp.json()) as LibraryManifest;
        this.renderItems(manifest.items);
      } catch {
        this.loaded = false;
        this.grid.textContent = 'The library could not be loaded. Close it and try again.';
        return;
      }
    }
    (this.grid.querySelector('.lib-card') as HTMLButtonElement | null)?.focus();
  }

  private close(): void {
    this.pop.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
  }

  private renderItems(items: LibraryItem[]): void {
    this.grid.textContent = '';
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lib-card';
      card.dataset.id = item.id;

      const thumb = document.createElement('span');
      thumb.className = 'lib-thumb';
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      thumb.appendChild(img);

      const label = document.createElement('span');
      label.className = 'lib-label';
      label.textContent = item.title;
      card.append(thumb, label);
      this.grid.appendChild(card);

      if (item.thumb.image) {
        img.loading = 'lazy';
        img.src = item.thumb.image;
      } else if (item.thumb.glb) {
        thumb.classList.add('lib-thumb--model', 'lib-thumb--loading');
        void this.thumbnailer.render(item.thumb.glb).then((dataUrl) => {
          thumb.classList.remove('lib-thumb--loading');
          if (dataUrl) img.src = dataUrl;
        });
      }

      card.addEventListener('click', () => this.activate(item));
    }
  }

  private activate(item: LibraryItem): void {
    this.close();
    if (item.action.type === 'page') {
      window.open(item.action.href, '_blank', 'noopener');
      return;
    }
    window.dispatchEvent(new CustomEvent<LibraryItem>(LIBRARY_OPEN_EVENT, { detail: item }));
  }
}
