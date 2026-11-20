<script setup lang="ts">
import '@fsd/shared/ui/kit/kit.css';
import WorkspaceAccount from './WorkspaceAccount.vue';
import './workspace-shell.css';

const props = defineProps<{ immersive?: boolean }>();
const route = useRoute();
const { t } = useI18n();
const sidebarStorageKey = 'tropio:sidebar-collapsed';
const sidebarPreference = ref<boolean>();
const compactSidebar = ref(false);
const animateSidebar = ref(false);
const sidebarCollapsed = computed(() => sidebarPreference.value ?? compactSidebar.value);
let compactMedia: MediaQueryList | undefined;

function syncSidebar() {
  compactSidebar.value = compactMedia?.matches ?? false;
}

function toggleSidebar() {
  animateSidebar.value = true;
  sidebarPreference.value = !sidebarCollapsed.value;
  try {
    localStorage.setItem(sidebarStorageKey, sidebarPreference.value ? '1' : '0');
  }
  catch {
    return;
  }
}

onMounted(() => {
  compactMedia = window.matchMedia('(max-width: 1039px)');
  syncSidebar();
  compactMedia.addEventListener('change', syncSidebar);
  try {
    const stored = localStorage.getItem(sidebarStorageKey);
    if (stored === '0' || stored === '1') {
      sidebarPreference.value = stored === '1';
    }
  }
  catch {
    return;
  }
});

onBeforeUnmount(() => compactMedia?.removeEventListener('change', syncSidebar));

const entries = [
  {
    id: 'feed',
    path: '/feed',
    label: 'workspace.feed.title',
    compactLabel: 'workspace.feed.title',
    icon: 'M5 3h11l3 3v15H5z M8 8h7 M8 12h8 M8 16h8',
  },
  {
    id: 'catalog',
    path: '/catalog',
    label: 'catalog.short',
    compactLabel: 'catalog.short',
    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M16 8l-2.5 5.5L8 16l2.5-5.5z',
  },
  {
    id: 'map',
    path: '/map',
    label: 'workspace.map',
    compactLabel: 'workspace.map',
    icon: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
  },
  {
    id: 'trips',
    path: '/trips',
    label: 'workspace.trips',
    compactLabel: 'workspace.tripsCompact',
    icon: 'M5 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M8 11v6 M16 11v6',
  },
] as const;

const active = computed(() => {
  if (props.immersive && route.path.startsWith('/trips/') && route.query.from === 'map') {
    return 'map';
  }
  return entries.find(entry => route.path === entry.path || route.path.startsWith(entry.path + '/'))?.id;
});
</script>

<template>
  <div
    class="workspace-shell"
    :class="{ 'workspace-shell--immersive': immersive, 'workspace-shell--animate-sidebar': animateSidebar }"
    :data-sidebar-collapsed="sidebarPreference"
  >
    <a class="workspace-skip" href="#workspace-content">{{ t('workspace.skipToContent') }}</a>

    <aside id="workspace-sidebar" class="workspace-sidebar">
      <NuxtLink :aria-label="t('workspace.openFeed')" class="workspace-brand" to="/feed">
        <img
          alt=""
          height="34"
          src="/logo.png"
          width="34"
        >
        <span aria-hidden="true" class="workspace-sidebar-label">{{ t('productName') }}</span>
      </NuxtLink>

      <nav :aria-label="t('workspace.navigation')">
        <ul class="workspace-nav">
          <li v-for="entry in entries" :key="entry.id">
            <NuxtLink
              :aria-current="active === entry.id ? (route.path === entry.path ? 'page' : 'location') : undefined"
              :aria-label="t(entry.label)"
              class="workspace-nav-link"
              :data-active="active === entry.id"
              :title="sidebarCollapsed ? t(entry.label) : undefined"
              :to="entry.path"
            >
              <svg
                aria-hidden="true"
                fill="none"
                focusable="false"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.7"
                viewBox="0 0 24 24"
              >
                <path :d="entry.icon" />
              </svg>
              <span aria-hidden="true" class="workspace-sidebar-label">{{ t(entry.label) }}</span>
              <span aria-hidden="true" class="workspace-nav-label-compact">{{ t(entry.compactLabel) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </nav>

      <button
        aria-controls="workspace-sidebar"
        :aria-expanded="!sidebarCollapsed"
        :aria-label="t(sidebarCollapsed ? 'workspace.expandSidebar' : 'workspace.collapseSidebar')"
        class="workspace-nav-link workspace-sidebar-toggle"
        :title="t(sidebarCollapsed ? 'workspace.expandSidebar' : 'workspace.collapseSidebar')"
        type="button"
        @click="toggleSidebar"
      >
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.7"
          viewBox="0 0 24 24"
        >
          <path d="m14 6-6 6 6 6" />
        </svg>
        <span aria-hidden="true" class="workspace-sidebar-label">{{ t('workspace.collapseSidebarShort') }}</span>
      </button>
    </aside>

    <div class="workspace-main">
      <header class="workspace-header">
        <NuxtLink :aria-label="t('workspace.openFeed')" class="workspace-brand workspace-header-brand" to="/feed">
          <img
            alt=""
            height="30"
            src="/logo.png"
            width="30"
          >
          <span>{{ t('productName') }}</span>
        </NuxtLink>
        <div class="workspace-header-actions">
          <NuxtLink :aria-label="t('workspace.createTrip')" class="tk-button tk-button-primary workspace-create" :to="{ path: '/trips', query: { new: '1' } }">
            <svg
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.9"
              viewBox="0 0 24 24"
            >
              <path d="M12 5v14 M5 12h14" />
            </svg>
            <span>{{ t('workspace.createTrip') }}</span>
          </NuxtLink>
          <WorkspaceAccount />
        </div>
      </header>
      <div id="workspace-content" class="workspace-content" tabindex="-1">
        <slot />
      </div>
    </div>
  </div>
</template>
