import type { RouterConfig } from 'nuxt/schema';
import CatalogPage from './pages/catalog/[[tripId]].vue';

export default {
  routes: routes => routes.map(route => route.name === 'catalog-tripId' && route.component ? { ...route, component: CatalogPage } : route),
} satisfies RouterConfig;
