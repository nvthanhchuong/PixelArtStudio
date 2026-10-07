import { create } from 'zustand';
import type { Family } from './colors';
export type Tool = 'pencil' | 'eraser' | 'eyedropper' | 'pan';
export type Panel = 'colors' | 'grid' | 'new' | 'export' | 'project' | 'help' | null;
// Keep wheelBehavior in files for V2 compatibility; interaction always uses two-finger pan.
export type Preferences = { color: string; recent: string[]; family: Family; gridSize: number; gridVisible: boolean; centerAxesVisible: boolean; wheelBehavior: 'pan' | 'zoom'; theme: 'light' | 'dark'; zoom: number };
type EditorState = Preferences & {
  tool: Tool; panel: Panel; revision: number; width: number; height: number;
  saveStatus: 'loading' | 'saving' | 'saved' | 'error';
  hydrated: boolean; storageMode: 'indexeddb' | 'localStorage' | null;
  set: (patch: Partial<Omit<EditorState, 'set' | 'chooseColor' | 'changed'>>) => void;
  chooseColor: (color: string) => void; changed: () => void;
};
export const useEditor = create<EditorState>((set) => ({
  color: '#8061DB', recent: ['#8061DB', '#27243D', '#F5CC77', '#79BCA3', '#FAFAFC'],
  family: 'Purple', gridSize: 1, gridVisible: true, centerAxesVisible: false, wheelBehavior: 'pan', theme: 'light', zoom: 1,
  tool: 'pencil', panel: null, revision: 0, width: 32, height: 32, saveStatus: 'loading',
  hydrated: false, storageMode: null,
  set: patch => set(patch),
  chooseColor: color => set(state => ({ color, recent: [color, ...state.recent.filter(c => c !== color)].slice(0, 20) })),
  changed: () => set(state => ({ revision: state.revision + 1 })),
}));
export function preferences(): Preferences {
  const { color, recent, family, gridSize, gridVisible, centerAxesVisible, wheelBehavior, theme, zoom } = useEditor.getState();
  return { color, recent, family, gridSize, gridVisible, centerAxesVisible, wheelBehavior, theme, zoom };
}
