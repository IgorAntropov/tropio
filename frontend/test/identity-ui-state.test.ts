import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { identityApi, useIdentityAction } from '../src/shared/api'

afterEach(() => vi.unstubAllGlobals())

it.each([
  [400, 'INVALID_REQUEST', 'invalidRequest'],
  [401, 'INVALID_CREDENTIALS', 'invalidCredentials'],
  [401, 'SESSION_REQUIRED', 'sessionRequired'],
  [403, 'CSRF_REJECTED', 'csrfRejected'],
  [404, 'NOT_FOUND', 'notFound'],
  [422, 'INVALID_AUTH_TOKEN', 'invalidToken'],
  [422, 'AVATAR_UNAVAILABLE', 'avatarUnavailable'],
  [429, 'RATE_LIMITED', 'rateLimited'],
  [503, 'DEPENDENCY_UNAVAILABLE', 'unavailable'],
  [422, 'SESSION_REQUIRED', 'unexpected'],
])('presents the error message for %s %s', async (status, code, key) => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ status, code }), {
      status,
      headers: { 'content-type': 'application/problem+json' },
    })))
  const scope = effectScope()
  const action = scope.run(useIdentityAction)!
  const confirmed = vi.fn()
  try {
    expect(await action.run(identityApi.me, confirmed)).toBe(false)
    expect(action.message.value).toBe(`identity.errors.${key}`)
    expect(action.problem.value).toMatchObject({ status, code })
    expect(confirmed).not.toHaveBeenCalled()
  } finally {
    scope.stop()
  }
})

it('keeps the draft when the network fails and allows retry', async () => {
  const draft = { display_name: 'Алекс Ким', bio: 'Южная тропа' }
  const saved = {
    id: '2d651995-4dde-4f39-aad7-4787e8821fb9',
    ...draft,
    avatar: null,
    csrf_token: 'csrf',
  }
  const request = vi.fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(Response.json(saved))
  vi.stubGlobal('fetch', request)
  const scope = effectScope()
  const action = scope.run(useIdentityAction)!
  const confirmed = vi.fn()
  const submit = () => action.run(signal => identityApi.updateProfile(draft, 'csrf', signal), confirmed)

  try {
    await submit()
    expect(action.message.value).toBe('identity.errors.unavailable')
    expect(confirmed).not.toHaveBeenCalled()
    expect(action.pending.value).toBe(false)
    await submit()
    expect(action.message.value).toBe('')
    expect(confirmed).toHaveBeenCalledWith(saved)
    expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify(draft))
  } finally {
    scope.stop()
  }
})

it('ignores a stale operation when the user leaves the screen', async () => {
  const scope = effectScope()
  const action = scope.run(useIdentityAction)!
  const confirmed = vi.fn()
  const running = action.run(async (signal) => {
    await Promise.resolve()
    expect(signal.aborted).toBe(true)
    return 'stale result'
  }, confirmed)

  scope.stop()
  expect(await running).toBe(false)
  expect(confirmed).not.toHaveBeenCalled()
})
