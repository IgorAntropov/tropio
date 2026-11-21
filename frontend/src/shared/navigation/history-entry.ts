export type RegionPosition = {
  name: string;
  left: number;
  top: number;
  anchor?: { id: string; offset: number };
};

type ViewEntry = {
  path: string;
  id: number;
  depths: Map<string, number>;
  positions?: RegionPosition[];
};

const entries = new Map<number, ViewEntry>();
let sequence = 0;

export function historyEntry(path: string) {
  if (typeof window === 'undefined') {
    return;
  }
  const state = window.history.state;
  if (state?.current !== path || typeof state.position !== 'number') {
    return;
  }
  const entry = entries.get(state.position);
  if (entry && entry.id === state.trulalaView && entry.path === path) {
    return entry;
  }
  const next: ViewEntry = { path, id: ++sequence, depths: new Map() };
  window.history.replaceState({ ...state, trulalaView: next.id }, '');
  entries.set(state.position, next);
  return next;
}

export function readListDepth(fullPath: string, listKey: string) {
  return historyEntry(fullPath)?.depths.get(listKey) ?? 1;
}

export function writeListDepth(fullPath: string, listKey: string, depth: number) {
  if (Number.isSafeInteger(depth) && depth >= 1) {
    historyEntry(fullPath)?.depths.set(listKey, depth);
  }
}

export function clearNavigationHistory() {
  entries.clear();
}
