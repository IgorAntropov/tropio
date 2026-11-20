import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { editorApi, EditorResponseError, IdentityResponseError, identityApi } from '@fsd/shared/api'
import type { PublicationOperation, PublishCommand, TravelDraft, UnpublishCommand, UpdateTripDraftRequest } from '@fsd/shared/api'

type Action =
  | { kind: 'visibility' | 'admission'; body: UpdateTripDraftRequest; key: string }
  | { kind: 'publish'; body: PublishCommand; key: string }
  | { kind: 'unpublish'; body: UnpublishCommand; key: string }

export function useTripPublication(getDraft: () => TravelDraft, onDraft: (value: TravelDraft) => void, onDenied: (error: unknown) => void) {
  const tripId = getDraft().trip_id
  const busy = ref(false)
  const issue = ref('')
  const notice = ref('')
  const conflict = ref(false)
  const prepared = shallowRef<Omit<PublishCommand, 'poi_ids'> | null>(null)
  const pois = ref<{ id: string; name: string }[]>([])
  const selected = ref<string[]>([])
  const nextPois = ref<string | null>(null)
  const operation = ref<string | null>(null)
  const action = shallowRef<Action | null>(null)
  const needsRead = ref(false)
  const unavailable = ref(false)
  const publishedState = ref<'checking' | 'current' | 'changed' | 'unverified'>('checking')
  const missingPois = ref(false)
  const previousPois = shallowRef<string[]>([])
  const lifetime = new AbortController()
  let inspection: AbortController | undefined
  let pollRequest: AbortController | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined

  const locked = computed(() => busy.value || !!action.value || !!operation.value || needsRead.value || unavailable.value)
  const unchanged = computed(() => {
    const manifest = getDraft().published_manifest
    if (publishedState.value !== 'current' || !manifest || !prepared.value) return false
    const checked = new Set(selected.value)
    return !missingPois.value && checked.size === previousPois.value.length && previousPois.value.every(id => checked.has(id))
  })

  async function routeHeads(draft: TravelDraft, signal: AbortSignal) {
    const routes: PublishCommand['routes'] = []
    for (const day of draft.days) {
      if (!day.route_id) break
      const route = await editorApi.getRoute(day.route_id, signal)
      if (route.availability !== 'available' || !route.route_revision_id) break
      routes.push({ day_id: day.day_id, route_id: day.route_id, route_revision_id: route.route_revision_id })
    }
    return routes
  }

  function compare(draft: TravelDraft, routes: PublishCommand['routes']) {
    const manifest = draft.published_manifest
    if (!manifest) return 'unverified'
    const current = manifest.trip_revision_id === draft.trip_revision_id && manifest.routes.length === routes.length
      && routes.length === draft.days.length && routes.every((route, i) => {
        const previous = manifest.routes[i]
        return previous?.day_id === route.day_id && previous.route_id === route.route_id && previous.route_revision_id === route.route_revision_id
      })
    return current ? 'current' : 'changed'
  }

  async function inspect(draft?: TravelDraft) {
    inspection?.abort()
    const request = new AbortController()
    inspection = request
    publishedState.value = 'checking'
    try {
      const fresh = draft ?? await editorApi.getTrip(tripId, request.signal)
      if (request.signal.aborted) return
      if (!draft) onDraft(fresh)
      if (!fresh.publication_id) return
      if (!fresh.published_manifest) {
        publishedState.value = 'unverified'
        return
      }
      const heads = await routeHeads(fresh, request.signal)
      if (!request.signal.aborted) publishedState.value = compare(fresh, heads)
    } catch (error) {
      if (request.signal.aborted) return
      publishedState.value = 'unverified'
      if (error instanceof EditorResponseError && [401, 403, 404].includes(error.status)) fail(error)
    }
  }

  function verifyOnFocus() {
    if (!locked.value && !prepared.value && !conflict.value) void inspect()
  }
  function stopPoll() {
    clearTimeout(timeout)
    pollRequest?.abort()
    pollRequest = undefined
  }

  function fail(error: unknown) {
    if (lifetime.signal.aborted) return
    const response = error instanceof EditorResponseError || error instanceof IdentityResponseError ? error : undefined
    const code = response?.code ?? ''
    if (response && [401, 403, 404].includes(response.status)) {
      onDenied(error)
      unavailable.value = true
      prepared.value = null
      pois.value = []
      selected.value = []
      action.value = null
      operation.value = null
    }
    if (response && response.status < 500) {
      conflict.value = response.status === 409
      if (conflict.value) operation.value = null
      action.value = null
      prepared.value = null
    }
    issue.value = code || 'NETWORK'
  }

  async function readDraft() {
    busy.value = true
    issue.value = ''
    needsRead.value = true
    try {
      const fresh = await editorApi.getTrip(tripId, lifetime.signal)
      if (lifetime.signal.aborted) return
      onDraft(fresh)
      unavailable.value = false
      conflict.value = false
      needsRead.value = false
      await inspect(fresh)
    } catch (error) {
      fail(error)
    } finally {
      busy.value = false
    }
  }

  async function loadPois(cursor?: string) {
    const page = await editorApi.listPois({ scope: 'trip', trip_id: tripId, limit: 100, ...(cursor ? { cursor } : {}) }, lifetime.signal)
    if (lifetime.signal.aborted) return
    const eligible = page.items.filter(poi => !poi.visibility || (poi.visibility === 'global' && poi.moderation_status === 'approved'))
    pois.value = [...(cursor ? pois.value : []), ...eligible.map(poi => ({ id: poi.poi_id, name: poi.name }))]
    nextPois.value = page.next_cursor
  }

  async function morePois() {
    if (locked.value || !nextPois.value) return
    busy.value = true
    issue.value = ''
    try { await loadPois(nextPois.value) } catch (error) { fail(error) }
    finally { busy.value = false }
  }

  async function publicationSelection() {
    for (let attempt = 0; attempt < 2; attempt++) {
      const draft = await editorApi.getTrip(tripId, lifetime.signal)
      if (!draft.publication_id) return { draft, ids: [], hidden: false }
      try {
        const active = await editorApi.getPublicTrip(tripId, lifetime.signal)
        if (active.publication_id === draft.publication_id) return { draft, ids: active.pois.map(poi => poi.poi_id), hidden: false }
      } catch (error) {
        if (!(error instanceof EditorResponseError) || error.status !== 404) throw error
        const fresh = await editorApi.getTrip(tripId, lifetime.signal)
        if (fresh.publication_id === draft.publication_id) return { draft: fresh, ids: [], hidden: true }
      }
    }
    throw new EditorResponseError(409, { code: 'TRIP_REVISION_CONFLICT' })
  }

  async function prepare() {
    if (locked.value || conflict.value) return
    inspection?.abort()
    busy.value = true
    issue.value = ''
    notice.value = ''
    prepared.value = null
    try {
      const { draft, ids, hidden } = await publicationSelection()
      if (lifetime.signal.aborted) return
      onDraft(draft)
      if (draft.visibility !== 'public') return
      const routes = await routeHeads(draft, lifetime.signal)
      if (draft.publication_id) publishedState.value = compare(draft, routes)
      if (!routes.length || routes.length !== draft.days.length) {
        issue.value = 'ROUTE_NOT_READY'
        return
      }
      await loadPois()
      const previous = new Set(ids)
      while (!lifetime.signal.aborted && nextPois.value && previous.size > pois.value.filter(poi => previous.has(poi.id)).length) {
        await loadPois(nextPois.value)
      }
      selected.value = pois.value.map(poi => poi.id).filter(id => previous.has(id))
      previousPois.value = ids
      missingPois.value = hidden || selected.value.length < (draft.published_manifest?.poi_count ?? previous.size)
      if (!lifetime.signal.aborted) prepared.value = { trip_revision_id: draft.trip_revision_id, routes }
    } catch (error) { fail(error) }
    finally { busy.value = false }
  }

  async function receive(result: PublicationOperation) {
    if (lifetime.signal.aborted) return
    if (result.status === 'pending') {
      operation.value = result.operation_id
      timeout = setTimeout(poll, 800)
      return
    }
    stopPoll()
    operation.value = null
    prepared.value = null
    await readDraft()
    if (result.status === 'succeeded') {
      if (!needsRead.value && getDraft().publication_id === result.publication_id) notice.value = 'published'
    } else {
      issue.value ||= result.code
      conflict.value ||= ['TRIP_REVISION_CONFLICT', 'ROUTE_REVISION_CONFLICT'].includes(result.code)
    }
  }

  async function poll() {
    if (!operation.value || lifetime.signal.aborted) return
    stopPoll()
    issue.value = ''
    const request = new AbortController()
    pollRequest = request
    try {
      const result = await editorApi.getPublicationOperation(tripId, operation.value, request.signal)
      if (!request.signal.aborted) await receive(result)
    } catch (error) {
      if (!request.signal.aborted) fail(error)
    }
  }

  async function send(command: Action) {
    if (busy.value || lifetime.signal.aborted) return
    inspection?.abort()
    stopPoll()
    busy.value = true
    issue.value = ''
    notice.value = ''
    action.value = command
    try {
      const { csrf_token: csrf } = await identityApi.me(lifetime.signal)
      const options = { csrf, key: command.key, signal: lifetime.signal }
      if (command.kind === 'publish') {
        const result = await editorApi.publishTrip(tripId, command.body, options)
        action.value = null
        await receive(result)
      } else {
        if (command.kind === 'unpublish') {
          await editorApi.unpublishTrip(tripId, command.body, options)
          operation.value = null
        } else {
          await editorApi.updateTrip(tripId, command.body, options)
        }
        action.value = null
        prepared.value = null
        await readDraft()
        if (!needsRead.value) {
          notice.value = { visibility: 'visibilitySaved', admission: 'admissionSaved', unpublish: 'withdrawn' }[command.kind]
        }
      }
    } catch (error) { fail(error) }
    finally { busy.value = false }
  }

  function setVisibility(visibility: 'public' | 'private') {
    if (locked.value || conflict.value) return
    return send({ kind: 'visibility', key: crypto.randomUUID(), body: { visibility, trip_revision_id: getDraft().trip_revision_id } })
  }
  function setAdmissionMode(mode: string) {
    if (locked.value || conflict.value || prepared.value || (mode !== 'request' && mode !== 'open')) return
    const draft = getDraft()
    if (mode === (draft.admission_mode ?? 'request')) return
    return send({ kind: 'admission', key: crypto.randomUUID(), body: { admission_mode: mode, trip_revision_id: draft.trip_revision_id } })
  }
  function publish() {
    if (!prepared.value || locked.value || conflict.value || unchanged.value || selected.value.length > 500) return
    return send({ kind: 'publish', key: crypto.randomUUID(), body: { ...prepared.value, poi_ids: [...selected.value] } })
  }
  function withdraw() {
    if (busy.value || action.value || needsRead.value || conflict.value || unavailable.value) return
    const { trip_revision_id, publication_id } = getDraft()
    return send({ kind: 'unpublish', key: crypto.randomUUID(), body: { trip_revision_id, publication_id } })
  }
  function retry() {
    if (busy.value) return
    if (action.value) return send(action.value)
    if (needsRead.value || unavailable.value || conflict.value) return readDraft()
    if (operation.value) return poll()
    return prepare()
  }

  onMounted(() => {
    if (getDraft().publication_id) void inspect(getDraft())
    window.addEventListener('focus', verifyOnFocus)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', verifyOnFocus)
    inspection?.abort()
    stopPoll()
    lifetime.abort()
  })
  return { action, busy, conflict, issue, locked, missingPois, needsRead, nextPois, notice, operation, pois, prepared, publishedState, selected, unavailable, unchanged,
    morePois, prepare, publish, retry, setAdmissionMode, setVisibility, withdraw }
}
