import { beginWorkspaceNavigation } from '../composables/useWorkspaceSession';

export default defineNuxtRouteMiddleware((to) => {
  beginWorkspaceNavigation(to);
});
