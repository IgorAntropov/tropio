import { workspaceReturnPath } from '@fsd/shared/session';
import { verifyWorkspaceSession } from '../composables/useWorkspaceSession';

export default defineNuxtRouteMiddleware(async (to) => {
  const status = await verifyWorkspaceSession(to);
  if (status === 'guest') {
    const returnTo = workspaceReturnPath(to.fullPath);
    return navigateTo({ path: '/login', query: returnTo ? { returnTo } : {} }, { replace: true });
  }
});
