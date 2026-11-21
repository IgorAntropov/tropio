import { sessionEvents } from '@fsd/shared/api';
import {
  capturePositions,
  clearNavigationHistory,
  historyEntry,
  restorePositions,
} from '@fsd/shared/navigation';

export default defineNuxtPlugin((app) => {
  const router = useRouter();
  const rendered = useRoute();
  let active = historyEntry(router.currentRoute.value.fullPath);
  let pending: typeof active;
  let stopRestore: ReturnType<typeof restorePositions> | undefined;
  let frame = 0;

  function stop() {
    cancelAnimationFrame(frame);
    const unfinished = stopRestore?.() ?? pending?.positions;
    stopRestore = undefined;
    pending = undefined;
    return unfinished;
  }
  function schedule() {
    if (!pending) {
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (pending?.positions && rendered.fullPath === pending.path) {
        stopRestore = restorePositions(pending.positions);
        pending = undefined;
      }
    });
  }
  const before = router.beforeEach((to, from) => {
    if (to.fullPath !== from.fullPath && active?.path === from.fullPath) {
      const unfinished = stop();
      if (rendered.fullPath === from.fullPath) {
        active.positions = capturePositions(unfinished);
      }
    }
  });
  const after = router.afterEach((to, from, failure) => {
    if (failure) {
      return;
    }
    active = historyEntry(to.fullPath);
    if (to.fullPath !== from.fullPath && active?.positions) {
      pending = active;
      schedule();
    }
  });
  const ready = app.hook('page:finish', schedule);
  const loaded = app.hook('page:loading:end', schedule);
  function reset() {
    stop();
    clearNavigationHistory();
    active = undefined;
  }
  sessionEvents.addEventListener('changed', reset);
  sessionEvents.addEventListener('expired', reset);
  function dispose() {
    stop();
    before();
    after();
    ready();
    loaded();
    sessionEvents.removeEventListener('changed', reset);
    sessionEvents.removeEventListener('expired', reset);
  }
  app.vueApp.onUnmount(dispose);
  if (import.meta.hot) {
    import.meta.hot.dispose(dispose);
  }
});
