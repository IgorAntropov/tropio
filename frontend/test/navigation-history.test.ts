import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  capturePositions,
  clearNavigationHistory,
  historyEntry,
  readListDepth,
  writeListDepth,
} from '../src/shared/navigation';

type State = { current: string; position: number; trulalaView?: number };

function browserHistory() {
  const history = {
    state: { current: '/catalog', position: 1 } as State,
    replaceState(state: State) {
      history.state = state;
    },
  };
  vi.stubGlobal('window', { history });
  return history;
}

afterEach(() => {
  clearNavigationHistory();
  vi.unstubAllGlobals();
});

it('retains the unread list position when leaving a loading screen during a history traversal', () => {
  vi.stubGlobal('window', { scrollX: 0, scrollY: 50 });
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  const list = {
    name: 'workspace-panel',
    top: 1900,
    left: 0,
    anchor: { id: 'trip-18', offset: 40 },
  };
  expect(capturePositions([list])).toEqual([{ name: '', left: 0, top: 50 }, list]);
});

it('restores each visit to an identical list URL and starts a new forward branch at its first page', () => {
  const history = browserHistory();
  writeListDepth('/catalog', 'catalog', 3);
  const original = history.state;
  history.state = { current: '/catalog', position: 3 };
  expect(readListDepth('/catalog', 'catalog')).toBe(1);
  writeListDepth('/catalog', 'catalog', 5);
  const second = history.state;
  history.state = original;
  expect(readListDepth('/catalog', 'catalog')).toBe(3);
  history.state = second;
  expect(readListDepth('/catalog', 'catalog')).toBe(5);
  history.state = { current: '/catalog', position: 3 };
  expect(readListDepth('/catalog', 'catalog')).toBe(1);
});

it('isolates replaced filters and discards earlier session data', () => {
  const history = browserHistory();
  writeListDepth('/catalog', 'catalog', 2);
  history.state = { ...history.state, current: '/catalog?view=list' };
  writeListDepth('/catalog', 'catalog', 7);
  expect(readListDepth(history.state.current, 'catalog')).toBe(1);
  const entry = historyEntry(history.state.current)!;
  entry.positions = [{ name: 'catalog-board', top: 780, left: 0 }];
  writeListDepth(history.state.current, 'catalog', 3);
  clearNavigationHistory();
  expect(readListDepth(history.state.current, 'catalog')).toBe(1);
  expect(historyEntry(history.state.current)?.positions).toBeUndefined();
});
