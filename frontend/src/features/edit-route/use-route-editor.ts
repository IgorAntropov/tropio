import {
  computed,
  ref,
  shallowRef,
} from 'vue';
import {
  editorApi,
  EditorResponseError,
} from '@fsd/shared/api';
import type {
  Position,
  ReadableRouteDraft,
  RouteDraft,
  RouteTrackPreview,
} from '@fsd/shared/api';
import {
  describeEditorError,
  editorProblemCode,
  routeErrorState,
} from './editor-errors';
import {
  addPoint,
  applyPreview,
  draftType,
  emptyRoute,
  fromServer,
  movePoint,
  removePoint,
  samePosition,
  toReplaceCommand,
  updateTrack,
} from './route-draft';
import type {
  BuildMode,
  TrackPatch,
  TransportMode,
  WorkingRoute,
} from './route-draft';

export type EditMode = 'view' | 'draw' | 'move' | 'split' | 'poi';
export type EditSelection = { type: 'point' | 'track'; id: string };
type Status = 'idle' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
type PreviewPlan = { route: WorkingRoute; remaining: number[] };
type OfferedPreview = { result: RouteTrackPreview; plan: PreviewPlan; index: number };
type RouteResult = Promise<ReadableRouteDraft>;
type RetryAction = () => Promise<void>;
type History = { previous: (string | null)[]; next: (string | null)[] };

export function useRouteEditor(routeId: () => string, csrf: () => string, refreshCsrf?: () => Promise<string>) {
  const saved = shallowRef<ReadableRouteDraft | null>(null);
  const working = shallowRef<WorkingRoute>(emptyRoute);
  const mode = ref<EditMode>('view');
  const selection = shallowRef<EditSelection | null>(null);
  const editing = ref(false);
  const readonlyRoute = ref(false);
  const buildMode = ref<BuildMode>('automatic');
  const transportMode = ref<TransportMode>('car');
  const status = ref<Status>('idle');
  const issue = ref<string | null>(null);
  const busy = ref(false);
  const changed = ref(false);
  const signInRequired = ref(false);
  const preview = shallowRef<OfferedPreview | null>(null);
  const retryAction = shallowRef<RetryAction | null>(null);
  const history = shallowRef<History>({ previous: [], next: [] });
  const serverVersion = shallowRef<WorkingRoute | null>(null);
  const localVersion = shallowRef<WorkingRoute | null>(null);
  const reviewingLocal = ref(false);
  const comparison = ref<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const comparisonError = ref<string | null>(null);
  let compareRequest: AbortController | null = null;
  let checkpoint: { route: WorkingRoute; changed: boolean; status: Status } | null = null;
  let alive = true;

  const visible = computed(() => reviewingLocal.value && localVersion.value ? localVersion.value : working.value);
  const draft = computed(() => ({
    ...visible.value,
    trip_type: changed.value || reviewingLocal.value ? draftType(visible.value) : (saved.value?.trip_type ?? draftType(visible.value)),
  }));
  const readOnly = computed(() => readonlyRoute.value || reviewingLocal.value);
  const canEdit = computed(() => !readOnly.value && !busy.value && !preview.value && !retryAction.value && status.value !== 'conflict');
  const canUndo = computed(() => canEdit.value && !changed.value && history.value.previous.length > 0);
  const canRedo = computed(() => canEdit.value && !changed.value && history.value.next.length > 0);
  function availableAlternatives(item: OfferedPreview) {
    const last = item.index === item.plan.route.tracks.length - 1;
    const finish = item.plan.route.points[item.index + 1];
    return item.result.alternatives.filter(option => !option.connection || (last && !finish?.poi_id));
  }

  const stagedPreview = computed(() => {
    const item = preview.value;
    if (!item) {
      return null;
    }
    const track = item.plan.route.tracks[item.index];
    return {
      ...item.result,
      alternatives: availableAlternatives(item),
      canKeepUnbuilt: item.result.status === 'unavailable' && Boolean(saved.value?.tracks.some(savedTrack => savedTrack.track_id === track?.track_id)),
      label: `Точка ${item.index + 1} → Точка ${item.index + 2}`,
    };
  });
  const conflict = computed(() => status.value === 'conflict' || reviewingLocal.value
    ? {
        status: comparison.value,
        server: serverVersion.value,
        local: (reviewingLocal.value ? localVersion.value : null) ?? working.value,
        error: comparisonError.value,
      }
    : null);

  function resetDraft(route: RouteDraft) {
    readonlyRoute.value = route.availability === 'geometry_restricted';
    saved.value = route.availability === 'available' ? route : null;
    working.value = saved.value ? fromServer(saved.value) : emptyRoute;
    changed.value = false;
    signInRequired.value = false;
    issue.value = readonlyRoute.value ? 'Доступ к геометрии ограничен. Связанные координаты скрыты.' : null;
    status.value = saved.value?.route_revision_id ? 'saved' : 'idle';
    retryAction.value = null;
    preview.value = null;
    selection.value = null;
    checkpoint = null;
    editing.value = false;
    mode.value = 'view';
  }

  function closeEditor() {
    editing.value = false;
  }

  function select(item: EditSelection, openDetails = true) {
    if (busy.value || mode.value === 'move' || mode.value === 'split') {
      return;
    }
    selection.value = item;
    editing.value = openDetails && !readOnly.value;
  }

  function setMode(next: EditMode) {
    if (!canEdit.value && next !== 'view') {
      return;
    }
    mode.value = next;
    if (next !== 'view') {
      closeEditor();
    }
  }

  function runFailure(error: unknown, retry?: RetryAction) {
    if (!alive) {
      return;
    }
    const code = editorProblemCode(error);
    signInRequired.value = code === 'SESSION_REQUIRED';
    issue.value = describeEditorError(error);
    status.value = routeErrorState(error);
    if (code === 'ROUTE_GEOMETRY_RESTRICTED') {
      readonlyRoute.value = true;
      working.value = emptyRoute;
      saved.value = null;
      localVersion.value = null;
      serverVersion.value = null;
      newHead = null;
      preview.value = null;
      checkpoint = null;
      selection.value = null;
      editing.value = false;
      changed.value = false;
      reviewingLocal.value = false;
      mode.value = 'view';
    }
    if (status.value === 'offline' || signInRequired.value || code === 'CSRF_REJECTED'
      || (error instanceof EditorResponseError && error.status >= 500)) {
      retryAction.value = retry ?? null;
    }
    else {
      retryAction.value = null;
    }
    if (status.value === 'conflict') {
      serverVersion.value = null;
      comparison.value = 'idle';
    }
  }

  function applySaved(route: ReadableRouteDraft, revisionHistory: History) {
    if (!alive) {
      return;
    }
    saved.value = route;
    working.value = fromServer(route);
    status.value = 'saved';
    signInRequired.value = false;
    issue.value = null;
    changed.value = false;
    retryAction.value = null;
    history.value = revisionHistory;
    checkpoint = null;
    if (selection.value && ![...route.points.map(point => point.point_id), ...route.tracks.map(track => track.track_id)]
      .includes(selection.value.id)) {
      selection.value = null;
    }
    if (mode.value === 'move' || mode.value === 'split') {
      mode.value = 'view';
    }
  }

  async function requestWithSession<T>(send: (token: string) => Promise<T>): Promise<T> {
    try {
      return await send(csrf());
    }
    catch (error) {
      if (editorProblemCode(error) !== 'CSRF_REJECTED' || !refreshCsrf) {
        throw error;
      }
      return await send(await refreshCsrf());
    }
  }

  async function execute(command: () => RouteResult, finish: (route: ReadableRouteDraft) => void) {
    const run = async () => {
      busy.value = true;
      status.value = 'saving';
      issue.value = null;
      retryAction.value = null;
      try {
        finish(await command());
      }
      catch (error) {
        runFailure(error, run);
      }
      finally {
        busy.value = false;
      }
    };
    await run();
  }

  async function save(next: WorkingRoute) {
    const value = toReplaceCommand(next, saved.value);
    const key = crypto.randomUUID();
    const previous = [...history.value.previous, saved.value?.route_revision_id ?? null];
    await execute(() => requestWithSession(token => editorApi.replaceRoute(routeId(), value, { csrf: token, key })),
      route => applySaved(route, { previous, next: [] }));
  }

  async function advance(plan: PreviewPlan) {
    working.value = plan.route;
    const [index, ...remaining] = plan.remaining;
    if (index === undefined) {
      if (plan.route.tracks.length === 0 && !saved.value?.route_revision_id) {
        status.value = 'idle';
        issue.value = null;
        changed.value = plan.route.points.length > 0;
        return;
      }
      await save(plan.route);
      return;
    }

    const track = plan.route.tracks[index];
    const start = plan.route.points[index];
    const finish = plan.route.points[index + 1];
    if (!track || !start || !finish) {
      return;
    }
    if (track.build_mode === 'straight') {
      await advance({ route: plan.route, remaining });
      return;
    }

    busy.value = true;
    status.value = 'saving';
    issue.value = null;
    retryAction.value = null;
    try {
      const from = start.requested_position ?? start.position;
      const to = finish.requested_position ?? finish.position;
      const result = await requestWithSession(token => editorApi.preview({
        from,
        to,
        build_mode: 'automatic',
        transport_mode: track.transport_mode,
      }, { csrf: token }));
      if (!alive) {
        return;
      }
      signInRequired.value = false;
      if (result.status === 'available') {
        const startOnRoad = result.from.snapped;
        const finishOnRoad = result.to.snapped;
        if (!startOnRoad || !finishOnRoad || !result.geometry || !result.graph_version) {
          throw new EditorResponseError(503, { code: 'DEPENDENCY_UNAVAILABLE' });
        }
        if (samePosition(startOnRoad, start.position) && samePosition(finishOnRoad, finish.position)) {
          await advance({ route: applyPreview(plan.route, index, result), remaining });
          return;
        }
      }
      preview.value = { result, index, plan: { route: plan.route, remaining } };
      status.value = 'idle';
    }
    catch (error) {
      runFailure(error, () => advance(plan));
    }
    finally {
      busy.value = false;
    }
  }

  async function updateDraft(next: WorkingRoute, candidates: number[] = []) {
    if (!canEdit.value) {
      return;
    }
    checkpoint = { route: working.value, changed: changed.value, status: status.value };
    editing.value = false;
    changed.value = true;
    const indices = [...new Set(candidates)].filter(index => index >= 0 && index < next.tracks.length);
    await advance({ route: next, remaining: indices });
  }

  async function add(position: Position) {
    if (working.value.points.at(-1) && samePosition(working.value.points.at(-1)!.position, position)) {
      return;
    }
    const next = addPoint(working.value, position, crypto.randomUUID(), crypto.randomUUID(), buildMode.value, transportMode.value);
    await updateDraft(next, [next.tracks.length - 1]);
  }

  async function updatePoint(input: { id: string; position: Position; name: string; description: string }) {
    const index = working.value.points.findIndex(point => point.point_id === input.id);
    const before = working.value.points[index];
    if (!before) {
      return;
    }
    const moved = !samePosition(before.position, input.position);
    const next = moved ? movePoint(working.value, input.id, input.position) : working.value;
    await updateDraft({
      ...next,
      points: next.points.map(point => point.point_id === input.id ? { ...point, name: input.name, description: input.description } : point),
    }, moved ? [index - 1, index] : []);
  }

  async function move(id: string, coordinate: Position) {
    const point = working.value.points.find(point => point.point_id === id);
    if (!point) {
      return;
    }
    await updatePoint({
      id,
      position: coordinate,
      name: point.name ?? '',
      description: point.description ?? '',
    });
  }

  async function changeTrack(input: TrackPatch & { id: string }) {
    const index = working.value.tracks.findIndex(track => track.track_id === input.id);
    const track = working.value.tracks[index];
    if (!track) {
      return;
    }
    const changed = track.build_mode !== input.build_mode || track.transport_mode !== input.transport_mode;
    const { id, ...patch } = input;
    await updateDraft(updateTrack(working.value, id, patch), changed ? [index] : []);
  }

  async function dropPoint(id: string) {
    const index = working.value.points.findIndex(point => point.point_id === id);
    if (index < 0) {
      return;
    }
    await updateDraft(removePoint(working.value, id, crypto.randomUUID()), index > 0 ? [index - 1] : []);
  }

  async function clearRoute() {
    if (!canEdit.value || !working.value.points.length) {
      return;
    }
    selection.value = null;
    await updateDraft(emptyRoute);
  }

  async function split(trackId: string, position: Position) {
    const revision = saved.value?.route_revision_id;
    if (!canEdit.value || !revision || changed.value) {
      return;
    }
    const key = crypto.randomUUID();
    changed.value = true;
    const pending = { route_id: routeId(), route_revision_id: revision, split_position: position };
    let splitRevision: string | undefined;
    await execute(async () => {
      if (!splitRevision) {
        const result = await requestWithSession(token => editorApi.splitTrack(trackId, pending, { csrf: token, key }));
        splitRevision = result.route_revision_id;
      }
      const response = await editorApi.getRoute(routeId());
      if (response.availability !== 'available') {
        throw new EditorResponseError(422, { code: 'ROUTE_GEOMETRY_RESTRICTED' });
      }
      return response;
    }, (route) => {
      const wasRevised = route.route_revision_id !== splitRevision;
      applySaved(route, { previous: wasRevised ? [] : [...history.value.previous, revision], next: [] });
      if (wasRevised) {
        issue.value = 'Маршрут обновился после деления. Открыта актуальная версия.';
      }
    });
    if (status.value === 'error' && !retryAction.value && !splitRevision) {
      changed.value = false;
    }
  }

  async function reverse(direction: 'undo' | 'redo') {
    if (direction === 'undo' ? !canUndo.value : !canRedo.value) {
      return;
    }
    const { previous, next } = history.value;
    const target = direction === 'undo' ? previous.at(-1) : next.at(-1);
    if (target === undefined) {
      return;
    }
    const current = saved.value?.route_revision_id ?? null;
    const key = crypto.randomUUID();
    changed.value = true;
    await execute(() => requestWithSession(token => target === null
      ? editorApi.replaceRoute(routeId(), toReplaceCommand(emptyRoute, saved.value), { csrf: token, key })
      : editorApi.restoreRoute(routeId(), { route_revision_id: current, target_revision_id: target }, { csrf: token, key })),
    route => applySaved(route, direction === 'undo'
      ? { previous: previous.slice(0, -1), next: [...next, current] }
      : { previous: [...previous, current], next: next.slice(0, -1) }));
  }

  async function acceptPreview() {
    const item = preview.value;
    if (!item) {
      return;
    }
    const track = item.plan.route.tracks[item.index];
    if (item.result.status === 'unavailable' && !saved.value?.tracks.some(savedTrack => savedTrack.track_id === track?.track_id)) {
      return;
    }
    preview.value = null;
    await advance({ ...item.plan, route: applyPreview(item.plan.route, item.index, item.result) });
  }

  async function chooseAlternative(index: number) {
    const item = preview.value;
    const option = item && availableAlternatives(item)[index];
    if (!item || !option) {
      return;
    }
    const { route, remaining } = item.plan;
    const track = route.tracks[item.index];
    if (!track) {
      return;
    }
    preview.value = null;
    if (option.connection === 'snapped_finish' && item.result.to.snapped && item.index === route.tracks.length - 1) {
      const withRoadEnd = movePoint(route, track.end_point_id, item.result.to.snapped);
      const connected = addPoint(withRoadEnd, item.result.to.requested, crypto.randomUUID(), crypto.randomUUID(),
        option.build_mode, option.transport_mode);
      await advance({ route: connected, remaining: [item.index, item.index + 1, ...remaining] });
      return;
    }
    const replaced = updateTrack(route, track.track_id, { ...track, build_mode: option.build_mode, transport_mode: option.transport_mode });
    await advance({ route: replaced, remaining: [item.index, ...remaining] });
  }

  function cancelPreview() {
    preview.value = null;
    if (checkpoint) {
      working.value = checkpoint.route;
      changed.value = checkpoint.changed;
      status.value = checkpoint.status;
      checkpoint = null;
    }
  }

  async function retry() {
    if (busy.value) {
      return;
    }
    if (retryAction.value) {
      await retryAction.value();
    }
    else if (changed.value && status.value === 'error' && !readOnly.value) {
      const pending = working.value.tracks.flatMap((track, index) => track.status ? [] : [index]);
      await advance({ route: working.value, remaining: pending });
    }
  }

  async function loadServer() {
    compareRequest?.abort();
    const request = new AbortController();
    compareRequest = request;
    comparison.value = 'loading';
    comparisonError.value = null;
    try {
      const result = await editorApi.getRoute(routeId(), request.signal);
      if (request.signal.aborted) {
        return;
      }
      if (result.availability === 'geometry_restricted') {
        runFailure(new EditorResponseError(422, { code: 'ROUTE_GEOMETRY_RESTRICTED' }));
        return;
      }
      newHead = result;
      serverVersion.value = fromServer(result);
      comparison.value = 'ready';
    }
    catch (error) {
      if (request.signal.aborted) {
        return;
      }
      comparisonError.value = describeEditorError(error);
      comparison.value = 'error';
    }
  }

  let newHead: ReadableRouteDraft | null = null;

  function cancelServer() {
    compareRequest?.abort();
    comparison.value = 'idle';
  }

  function useServer() {
    if (reviewingLocal.value) {
      reviewingLocal.value = false;
      return;
    }
    if (!newHead) {
      return;
    }
    localVersion.value = working.value;
    history.value = { previous: [], next: [] };
    resetDraft(newHead);
  }

  function keepLocal() {
    if (status.value === 'conflict') {
      cancelServer();
      return;
    }
    if (localVersion.value) {
      reviewingLocal.value = true;
      editing.value = false;
    }
  }

  function dispose() {
    alive = false;
    compareRequest?.abort();
  }

  return {
    draft,
    mode,
    selection,
    editing,
    status,
    issue,
    busy,
    changed,
    readOnly,
    buildMode,
    transportMode,
    canEdit,
    canUndo,
    canRedo,
    localVersion,
    reviewingLocal,
    signInRequired,
    preview: stagedPreview,
    conflict,
    resetDraft,
    add,
    select,
    setMode,
    closeEditor,
    updatePoint,
    changeTrack,
    move,
    dropPoint,
    clearRoute,
    split,
    requestWithSession,
    undo: () => reverse('undo'),
    redo: () => reverse('redo'),
    retry,
    acceptPreview,
    chooseAlternative,
    cancelPreview,
    loadServer,
    cancelServer,
    useServer,
    keepLocal,
    dispose,
  };
}
