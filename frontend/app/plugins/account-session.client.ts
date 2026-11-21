import {
  browserSession,
  identityApi,
  sessionEvents,
} from '@fsd/shared/api';
import {
  workspaceConfirmedKey,
  workspaceMemberKey,
  workspaceMemberOf,
} from '@fsd/shared/session';
import type { WorkspaceMember } from '@fsd/shared/session';

export default defineNuxtPlugin(() => {
  if (!browserSession) {
    return;
  }
  const router = useRouter();
  const member = useState<WorkspaceMember | null>(workspaceMemberKey, () => null);
  const confirmed = useState<boolean | null>(workspaceConfirmedKey, () => null);
  watch(browserSession.profile, (profile) => {
    if (profile !== undefined) {
      confirmed.value = !!profile;
    }
    member.value = profile ? workspaceMemberOf(profile) : null;
  }, { flush: 'sync' });

  function sessionExpired() {
    const { path, query, hash, meta } = router.currentRoute.value;
    if (meta.layout === 'workspace' && !meta.publicWorkspace) {
      void router.replace({
        path,
        query,
        hash,
        force: true,
      });
    }
  }

  const key = 'trulala-session-change';
  const profileKey = 'trulala-profile-change';
  const overviewKey = 'trulala-overview-change';
  function marker(name: string) {
    try {
      return localStorage.getItem(name);
    }
    catch {
      return null;
    }
  }
  let lastMarker = marker(key);
  let lastProfileMarker = marker(profileKey);
  let lastOverviewMarker = marker(overviewKey);
  function writeMarker(name: string) {
    try {
      const next = crypto.randomUUID();
      localStorage.setItem(name, next);
      return next;
    }
    catch {
      return null;
    }
  }
  function changedHere() {
    lastMarker = writeMarker(key);
  }
  function profileUpdated() {
    lastProfileMarker = writeMarker(profileKey);
  }
  function overviewUpdated() {
    lastOverviewMarker = writeMarker(overviewKey);
  }
  function changedElsewhere() {
    if (lastMarker !== marker(key)) {
      browserSession?.replace(undefined);
      window.location.reload();
      return;
    }
    const next = marker(profileKey);
    if (next !== lastProfileMarker) {
      lastProfileMarker = next;
      if (browserSession?.profile.value) {
        browserSession.invalidateProfile();
        void identityApi.me(new AbortController().signal).catch(() => undefined);
      }
    }
    const nextOverview = marker(overviewKey);
    if (nextOverview !== lastOverviewMarker) {
      lastOverviewMarker = nextOverview;
      sessionEvents.dispatchEvent(new Event('overview-invalidated'));
    }
  }
  function storage(event: StorageEvent) {
    if (event.key === key || event.key === profileKey || event.key === overviewKey) {
      changedElsewhere();
    }
  }
  sessionEvents.addEventListener('expired', sessionExpired);
  sessionEvents.addEventListener('changed', changedHere);
  sessionEvents.addEventListener('profile-updated', profileUpdated);
  sessionEvents.addEventListener('overview-changed', overviewUpdated);
  window.addEventListener('storage', storage);
  window.addEventListener('pageshow', changedElsewhere);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      sessionEvents.removeEventListener('expired', sessionExpired);
      sessionEvents.removeEventListener('changed', changedHere);
      sessionEvents.removeEventListener('profile-updated', profileUpdated);
      sessionEvents.removeEventListener('overview-changed', overviewUpdated);
      window.removeEventListener('storage', storage);
      window.removeEventListener('pageshow', changedElsewhere);
    });
  }
});
