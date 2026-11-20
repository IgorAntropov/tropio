import { createRenderer, defineComponent, h } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { provideTripParticipation, useTripParticipation } from '../src/features/trip-participation/use-trip-participation'
import { editorApi, EditorResponseError, identityApi } from '../src/shared/api'

vi.mock('@fsd/shared/api', () => import('../src/shared/api'))

const renderer = createRenderer<object, object>({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}), patchProp() {},
  setText() {}, setElementText() {}, insert() {}, remove() {}, parentNode: () => null, nextSibling: () => null,
})
const tripId = '8453a675-756b-4ae4-aa3b-e84ad0745ded'
const first = 'a8a0d384-85b4-40fc-b77a-c0db34686a15'
const second = '0672d20f-93b4-4c8b-8d0d-e94200d97bf2'
let unmount: (() => void) | undefined

async function setup() {
  let viewer = first
  const result = () => ({ viewer_id: viewer, trip_ids: [], joined_trip_ids: [] })
  const read = vi.spyOn(editorApi, 'getCatalogParticipation').mockImplementation(async () => result())
  const profile = (id: string) => ({ id, csrf_token: 'csrf', display_name: 'Турист', avatar: null, bio: null })
  const me = vi.spyOn(identityApi, 'me').mockImplementation(async () => profile(viewer))
  const send = vi.spyOn(editorApi, 'requestTripParticipation')
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }))
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('useNuxtApp', () => ({ runWithContext: (action: () => void) => action() }))
  const navigate = vi.fn()
  vi.stubGlobal('navigateTo', navigate)
  const refreshTrips = vi.fn()
  let model!: ReturnType<typeof useTripParticipation>
  const Child = defineComponent({ setup() { model = useTripParticipation(); return () => h('div') } })
  const app = renderer.createApp(defineComponent({ setup() {
    provideTripParticipation(() => [tripId], refreshTrips)
    return () => h(Child)
  } }))
  app.mount({})
  unmount = () => app.unmount()
  await vi.waitFor(() => expect(model.viewer.value).toBe(first))
  async function changeAccount() {
    viewer = second
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(model.viewer.value).toBe(second))
  }
  return { model, me, profile, send, read, refreshTrips, navigate, changeAccount }
}

afterEach(() => { unmount?.(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each(['pending', 'joined', 401, 403, 409] as const)('ignores a delayed response from the previous account (%s)', async outcome => {
  const { model, send, refreshTrips, navigate, changeAccount } = await setup()
  const pending = Promise.withResolvers<{ status: 'pending' | 'joined' }>()
  send.mockReturnValue(pending.promise)
  const applying = model.apply(tripId, outcome === 'joined' ? 'open' : 'request')
  await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
  await changeAccount()
  if (typeof outcome === 'string') pending.resolve({ status: outcome })
  else pending.reject(new EditorResponseError(outcome, { code: 'SESSION_REQUIRED' }))
  await applying
  expect(model.sent.value.size + model.joined.value.size).toBe(0)
  expect(model.errors.value[tripId]).toBeFalsy()
  expect(refreshTrips).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})

it('does not submit with a different account after refreshing its session', async () => {
  const { model, me, send, profile, changeAccount } = await setup()
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof identityApi.me>>>()
  me.mockReturnValue(pending.promise)
  const applying = model.apply(tripId, 'open')
  await changeAccount()
  pending.resolve(profile(second))
  await applying
  expect(send).not.toHaveBeenCalled()
})

it.each([
  [400, 'INVALID_REQUEST', 'participation.unavailable'], [403, 'CSRF_REJECTED', 'participation.sessionChanged'],
  [404, 'NOT_FOUND', 'catalog.unavailableTrip'], [409, 'TRIP_APPLICATION_UNAVAILABLE', 'participation.changed'],
  [503, 'DEPENDENCY_UNAVAILABLE', 'participation.unavailable'],
] as const)('presents an unsuccessful application with %s %s', async (status, code, message) => {
  const { model, send } = await setup()
  send.mockRejectedValue(new EditorResponseError(status, { code }))
  await model.apply(tripId, 'request')
  expect(model.errors.value[tripId]).toBe(message)
  expect(model.sent.value.size + model.joined.value.size).toBe(0)
})
