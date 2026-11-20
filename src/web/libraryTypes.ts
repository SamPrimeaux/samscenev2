export type LibraryAction =
  | { type: 'model'; url: string; filename: string }
  | { type: 'page'; href: string };

export interface LibraryItem {
  id: string;
  title: string;
  kind: 'model' | 'story' | 'scene';
  thumb: { image?: string; glb?: string };
  action: LibraryAction;
}

export interface LibraryManifest {
  version: number;
  items: LibraryItem[];
}

export const LIBRARY_OPEN_EVENT = 'samscene:library-open';
