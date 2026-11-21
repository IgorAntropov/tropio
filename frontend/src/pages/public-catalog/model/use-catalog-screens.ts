import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import type { Ref } from 'vue';
import type {
  LocationQuery,
  LocationQueryRaw,
} from 'vue-router';

export function catalogQuery(query: LocationQuery): LocationQueryRaw {
  return Object.fromEntries(Object.entries(query).filter(([key]) => key !== 'screen' && key !== 'day'));
}

export function useCatalogScreens(tripId: Ref<string>) {
  const route = useRoute();
  const router = useRouter();
  const mobile = ref(false);
  let viewport: MediaQueryList | undefined;
  const updateViewport = () => {
    mobile.value = viewport?.matches ?? false;
  };
  onMounted(() => {
    viewport = window.matchMedia('(max-width: 699px)');
    updateViewport();
    viewport.addEventListener('change', updateViewport);
  });
  onBeforeUnmount(() => viewport?.removeEventListener('change', updateViewport));

  const mode = computed({
    get: () => mobile.value && route.query.view === 'list' ? 'list' : 'map',
    set: (value) => {
      void router.replace({ path: '/catalog', query: { ...catalogQuery(route.query), view: value === 'list' ? value : undefined } });
    },
  });
  const routeMap = computed(() => mobile.value && !!tripId.value && route.query.screen === 'route' && route.hash !== '#participation');
  const dayNumber = computed(() => typeof route.query.day === 'string' && /^[1-9]\d*$/.test(route.query.day) ? Number(route.query.day) : 1);

  function previous() {
    const path = router.options.history.state.back;
    return typeof path === 'string' && path.startsWith('/catalog') ? router.resolve(path) : undefined;
  }
  function open(id: string, day?: number) {
    const back = previous();
    const path = '/catalog/' + encodeURIComponent(id);
    const query = catalogQuery(route.query);
    const target = day === undefined ? { path, query } : { path, query: { ...query, screen: 'route', day: String(day) } };
    if (back?.path !== path || (back.query.screen === 'route') !== (day !== undefined)) {
      return router.push(target);
    }
    if (router.resolve(target).fullPath !== back.fullPath) {
      const remove = router.afterEach((to, _from, failure) => {
        remove();
        if (!failure && to.fullPath === back.fullPath) {
          void router.replace(target);
        }
      });
    }
    router.back();
  }
  function back() {
    const entry = previous();
    if (entry?.path === '/catalog' || (mobile.value && entry?.path === route.path)) {
      router.back();
    }
    else {
      void router.replace({ path: '/catalog', query: catalogQuery(route.query) });
    }
  }
  return {
    mobile,
    mode,
    routeMap,
    dayNumber,
    open,
    back,
  };
}
