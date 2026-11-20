import { describe, expect, it } from 'vitest'
import { getWorkspaceSessionStatus, mayCheckWorkspaceSession, workspaceReturnPath } from '../src/shared/session'

describe('workspace sessions', () => {
  it('distinguishes a verified BFF session, a guest, and a dependency failure', () => {
    expect(getWorkspaceSessionStatus(200, { id: 'account-id' })).toBe('authenticated')
    expect(getWorkspaceSessionStatus(401, { code: 'SESSION_REQUIRED' })).toBe('guest')
    expect(getWorkspaceSessionStatus(401, { code: 'INVALID_CREDENTIALS' })).toBe('unavailable')
    expect(getWorkspaceSessionStatus(503, { code: 'DEPENDENCY_UNAVAILABLE' })).toBe('unavailable')
    expect(getWorkspaceSessionStatus(200, {})).toBe('unavailable')
  })

  it('only probes SSR requests carrying the scoped BFF cookie', () => {
    expect(mayCheckWorkspaceSession('other=1; tropio_session=present')).toBe(true)
    expect(mayCheckWorkspaceSession('tropio_session=')).toBe(false)
    expect(mayCheckWorkspaceSession('tropio_registration=present')).toBe(false)
    expect(mayCheckWorkspaceSession('old_tropio_session=present')).toBe(false)
    expect(mayCheckWorkspaceSession(undefined)).toBe(false)
  })

  it('retains only an implemented, local workspace destination', () => {
    const trip = 'dfa44e21-dd34-4c96-89f4-2b3c50bdd428'
    const day = '549502be-2927-4a52-a1f8-272836a0413a'
    const route = `/trips/${trip}/days/${day}/route?from=map#current`

    expect(workspaceReturnPath(route)).toBe(route)
    expect(workspaceReturnPath('/trips?new=1')).toBe('/trips?new=1')
    expect(workspaceReturnPath('/map')).toBe('/map')
    expect(workspaceReturnPath(`/catalog/${trip}#participation`)).toBe(`/catalog/${trip}#participation`)
    expect(workspaceReturnPath('/catalog/no-id#participation')).toBeUndefined()
    expect(workspaceReturnPath(`/catalog/${trip}?next=/login#participation`)).toBeUndefined()
    expect(workspaceReturnPath(`https://other.test/catalog/${trip}#participation`)).toBeUndefined()
    expect(workspaceReturnPath('/login')).toBeUndefined()
    expect(workspaceReturnPath('/api/v1/me')).toBeUndefined()
    expect(workspaceReturnPath('/trips/not-a-uuid')).toBeUndefined()
    expect(workspaceReturnPath('https://other.test/feed')).toBeUndefined()
    expect(workspaceReturnPath('//other.test/feed')).toBeUndefined()
    expect(workspaceReturnPath('/\\other.test/feed')).toBeUndefined()
    expect(workspaceReturnPath(['/map'])).toBeUndefined()
  })
})
