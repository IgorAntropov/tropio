import { guestHome, loginReadyKey, workspaceHome, workspaceReturnPath } from '@fsd/shared/session'
import { verifyWorkspaceSession } from '../composables/useWorkspaceSession'

export default defineNuxtRouteMiddleware(async (to) => {
  const loginReady = useState(loginReadyKey, () => false)
  const login = to.path === '/login' || to.path === '/login/'

  const status = await verifyWorkspaceSession(to)
  if (!status) return

  if (status === 'authenticated') {
    loginReady.value = false
    return navigateTo(login ? workspaceReturnPath(to.query.returnTo) ?? workspaceHome : workspaceHome, { replace: true })
  }

  if (!login) return navigateTo(guestHome, { replace: true })
  loginReady.value = true
})
