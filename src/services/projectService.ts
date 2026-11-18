import type { SamSceneProjectManifest } from '../types.ts';

const ACTIVE_PROJECT_KEY = 'samscene.activeProject.v1';
const SAVED_SLOTS_KEY = 'samscene.savedSlots.v1';
const MAX_HISTORY = 25;

export interface SavedProjectSlot {
  id: string;
  name: string;
  updatedAt: number;
  manifest: SamSceneProjectManifest;
}

export class ProjectPersistenceService {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastPushedJson = '';

  public pushSnapshot(manifest: SamSceneProjectManifest): void {
    const serialized = JSON.stringify(manifest);
    if (serialized === this.lastPushedJson) return;
    if (this.lastPushedJson) {
      this.undoStack.push(this.lastPushedJson);
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
    }
    this.lastPushedJson = serialized;
    this.redoStack = [];
  }

  public replaceBaseline(manifest: SamSceneProjectManifest): void {
    this.lastPushedJson = JSON.stringify(manifest);
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): SamSceneProjectManifest | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    if (this.lastPushedJson) {
      this.redoStack.push(this.lastPushedJson);
    }
    this.lastPushedJson = prev;
    return JSON.parse(prev) as SamSceneProjectManifest;
  }

  public redo(): SamSceneProjectManifest | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    if (this.lastPushedJson) {
      this.undoStack.push(this.lastPushedJson);
    }
    this.lastPushedJson = next;
    return JSON.parse(next) as SamSceneProjectManifest;
  }

  public saveActiveToStorage(manifest: SamSceneProjectManifest): boolean {
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, JSON.stringify(manifest));
      return true;
    } catch {
      return false;
    }
  }

  public loadActiveFromStorage(): SamSceneProjectManifest | null {
    try {
      const raw = localStorage.getItem(ACTIVE_PROJECT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SamSceneProjectManifest;
      if (parsed && parsed.version === 1) {
        this.replaceBaseline(parsed);
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  public listSavedSlots(): SavedProjectSlot[] {
    try {
      const raw = localStorage.getItem(SAVED_SLOTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedProjectSlot[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public saveNamedSlot(name: string, manifest: SamSceneProjectManifest): SavedProjectSlot {
    const slots = this.listSavedSlots();
    const cleanName = name.trim() || manifest.projectName || 'SamScene Project';
    const updatedManifest: SamSceneProjectManifest = {
      ...manifest,
      projectName: cleanName,
      updatedAt: Date.now(),
    };
    const slot: SavedProjectSlot = {
      id: `proj-${Date.now().toString(36)}`,
      name: cleanName,
      updatedAt: updatedManifest.updatedAt,
      manifest: updatedManifest,
    };
    const next = [slot, ...slots.filter((s) => s.name !== cleanName)].slice(0, 8);
    try {
      localStorage.setItem(SAVED_SLOTS_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota exceeded gracefully
    }
    return slot;
  }

  public deleteSavedSlot(id: string): void {
    const slots = this.listSavedSlots().filter((s) => s.id !== id);
    try {
      localStorage.setItem(SAVED_SLOTS_KEY, JSON.stringify(slots));
    } catch {
      // Ignore storage error
    }
  }

  public downloadProjectBundle(manifest: SamSceneProjectManifest): {
    filename: string;
    byteLength: number;
  } {
    const safeName =
      (manifest.projectName || 'samscene-project')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'samscene-project';
    const json = JSON.stringify(manifest, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const filename = `${safeName}.samscene.json`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { filename, byteLength: blob.size };
  }

  public parseProjectJson(rawText: string): SamSceneProjectManifest {
    const parsed = JSON.parse(rawText) as SamSceneProjectManifest;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.beats)) {
      throw new Error('Invalid .samscene.json project manifest.');
    }
    return parsed;
  }
}
