<script setup lang="ts">
import type { PublicProfileOverview } from '@fsd/shared/api';
import {
  UiImage,
  UiSegmented,
  UiSkeleton,
} from '@fsd/shared/ui/kit';

const props = defineProps<{ overview?: Pick<PublicProfileOverview, 'achievements' | 'level'>; visitor?: boolean }>();
const { t, n, locale } = useI18n();
const { baseURL } = useRuntimeConfig().app;
const groups = ['travel', 'friends', 'cartography', 'organizing'] as const;
const selected = ref<string>('travel');
const options = computed(() => (props.overview?.achievements?.map(item => item.group) ?? groups)
  .map(value => ({ value, label: t('profileOverview.groups.' + value) })));
watch(options, (available) => {
  if (available.length && !available.some(item => item.value === selected.value)) {
    selected.value = available[0]!.value;
  }
}, { immediate: true });
const earnedCounts = computed(() => new Map<string, string>(props.overview?.achievements?.map(item => [item.group, n(item.earned.length)])));
const group = computed(() => props.overview?.achievements?.find(item => item.group === selected.value));
const level = computed(() => props.overview?.level);
const nextLevelLabel = computed(() => {
  if (!level.value?.next_at) {
    return '';
  }
  const remaining = level.value.next_at - level.value.completed;
  return t('profileOverview.toNextLevel.' + new Intl.PluralRules(locale.value).select(remaining), { count: n(remaining) });
});
const noAwards = computed(() => props.overview?.achievements?.every(item => !item.earned.length));
const emptyLabel = computed(() => {
  if (!noAwards.value) {
    return 'profileOverview.noGroupAwards';
  }
  return props.visitor ? 'profileOverview.noPublicAwards' : 'profileOverview.noAwards';
});
const symbols = {
  travel: 'M2 20l7-14 4.5 9 2.5-5 6 10ZM6.5 11l2.7 1.5 2.3-1.5',
  friends: 'M15.5 19v-2a5.5 5.5 0 0 0-11 0v2m12-7.6a4.5 4.5 0 0 1 3.5 4.4V18M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3-2.3a2.7 2.7 0 0 1 0 5.1',
  cartography: 'm2 6 6-3 8 3 6-3v15l-6 3-8-3-6 3ZM8 3v15m8-12v15',
  organizing: 'M6 21V3m0 1c4-2 7 2 12 0v10c-5 2-8-2-12 0',
};
</script>

<template>
  <section :aria-label="t('profileOverview.achievements')" class="profile-achievements">
    <div v-if="!overview || level" class="profile-level">
      <div class="profile-level-heading">
        <span aria-hidden="true" class="profile-level-symbol">
          <svg viewBox="0 0 32 32"><path d="m3 26 10-19 4.5 8.5 3-5.5L29 26Zm6.8-13 3.2 1.8 3-1.8" /></svg>
        </span>
        <div>
          <p>{{ t('profileOverview.level') }}</p>
          <strong v-if="level">{{ t('profileOverview.levels.' + level.code) }}</strong>
          <UiSkeleton v-else class="profile-word-skeleton" />
        </div>
      </div>
      <template v-if="level">
        <template v-if="level.next_at !== null">
          <progress :aria-label="t('profileOverview.levelProgress')" :max="level.next_at" :value="level.completed" />
          <small>{{ nextLevelLabel }}</small>
        </template>
        <small v-else>{{ t('profileOverview.maxLevel') }}</small>
      </template>
      <UiSkeleton v-else class="profile-line-skeleton" />
    </div>
    <UiSegmented
      v-if="!overview || overview.achievements?.length"
      v-model="selected"
      class="profile-achievement-tabs"
      :label="t('profileOverview.achievementGroups')"
      :options="options"
    >
      <template #suffix="{ value }">
        <span v-if="earnedCounts.has(value)" class="profile-achievement-count">
          <span class="tk-sr-only">{{ t('profileOverview.earned') + ' ' }}</span>{{ earnedCounts.get(value) }}
        </span>
        <UiSkeleton v-else class="profile-count-skeleton" />
      </template>
    </UiSegmented>
    <div v-if="group" class="profile-awards">
      <ul v-if="group.earned.length" class="profile-earned-list">
        <li v-for="grade in group.earned" :key="grade.code">
          <span aria-hidden="true" class="profile-award-symbol"><svg viewBox="0 0 24 24"><path :d="symbols[group.group]" /></svg></span>
          <div>
            <small class="profile-earned-caption">{{ t('profileOverview.earned') }}</small>
            <strong>{{ t('profileOverview.grades.' + grade.code) }}</strong>
            <p>{{ t('profileOverview.criteria.' + group.group, { count: n(grade.threshold) }) }}</p>
          </div>
        </li>
      </ul>
      <div v-else class="profile-empty-awards">
        <UiImage
          alt=""
          class="profile-album"
          fit="contain"
          :src="baseURL + 'achievement-album.webp'"
        />
        <p>{{ t(emptyLabel) }}</p>
      </div>
      <div v-if="group.next" class="profile-next-grade">
        <small>{{ t('profileOverview.nextGrade') }}</small>
        <div class="profile-grade-heading">
          <strong>{{ t('profileOverview.grades.' + group.next.code) }}</strong>
          <span>{{ n(group.progress) }} / {{ n(group.next.threshold) }}</span>
        </div>
        <progress :aria-label="t('profileOverview.grades.' + group.next.code)" :max="group.next.threshold" :value="group.progress" />
        <p>{{ t('profileOverview.criteria.' + group.group, { count: n(group.next.threshold) }) }}</p>
      </div>
    </div>
    <div
      v-else-if="!overview"
      :aria-label="t('identity.loading')"
      class="profile-awards-loading"
      role="status"
    ><UiSkeleton /><UiSkeleton /></div>
  </section>
</template>

<style scoped>
.profile-achievements { display: flex; flex-direction: column; gap: var(--tk-space-4); min-inline-size: 0; container-type: inline-size; }
.profile-level { display: grid; gap: var(--tk-space-2); padding: var(--tk-space-4); border-radius: var(--tk-radius); background: var(--tk-selected); color: var(--tk-accent); }
.profile-level-heading, .profile-earned-list li { display: flex; align-items: center; gap: var(--tk-space-3); }
.profile-level-heading p { margin: 0 0 .15rem; font-size: var(--tk-text-sm); }
.profile-level-heading strong { font-size: var(--tk-text-lg); }
.profile-level-symbol, .profile-award-symbol { display: grid; flex: none; place-items: center; inline-size: 2.75rem; block-size: 2.75rem; border: 1px solid color-mix(in srgb, var(--tk-accent) 28%, transparent); border-radius: 50%; }
.profile-level-symbol svg, .profile-award-symbol svg { inline-size: 1.65rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.profile-achievements progress { display: block; inline-size: 100%; block-size: .38rem; overflow: hidden; border: 0; border-radius: 1rem; background: var(--tk-line); appearance: none; }
.profile-achievements progress::-webkit-progress-bar { background: var(--tk-line); }
.profile-achievements progress::-webkit-progress-value { border-radius: inherit; background: var(--tk-accent); }
.profile-achievements progress::-moz-progress-bar { border-radius: inherit; background: var(--tk-accent); }
.profile-level small, .profile-next-grade small, .profile-grade-heading span, .profile-earned-list p, .profile-next-grade p { font-size: var(--tk-text-sm); }
.profile-achievement-tabs { display: grid; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; }
.profile-achievement-tabs :deep(.tk-segment > span) { display: flex; justify-content: center; align-items: center; gap: .375rem; min-width: 0; padding-inline: .35rem; font-size: var(--tk-text-sm); }
.profile-achievement-count, .profile-count-skeleton { flex: none; min-inline-size: 1.4rem; block-size: 1.4rem; border-radius: 100vmax; }
.profile-achievement-count { display: inline-grid; place-items: center; padding-inline: .25rem; background: color-mix(in srgb, currentColor 12%, transparent); font-size: .75rem; font-variant-numeric: tabular-nums; }
.profile-awards { display: flex; flex-direction: column; gap: var(--tk-space-4); flex-grow: 1; }
.profile-empty-awards { display: grid; flex-grow: 1; place-content: center; justify-items: center; gap: var(--tk-space-2); padding: var(--tk-space-3); border: 1px dashed var(--tk-line); border-radius: var(--tk-radius); }
.profile-empty-awards p { margin: 0; text-align: center; color: var(--tk-muted); font-size: var(--tk-text-base); }
.profile-album { inline-size: clamp(7.5rem, 34cqi, 12rem); aspect-ratio: 1.5; }
.profile-earned-list { display: grid; gap: var(--tk-space-2); margin: 0; padding: 0; list-style: none; }
.profile-earned-list li { gap: var(--tk-space-4); padding: var(--tk-space-4); border: 1px solid var(--tk-line); border-radius: var(--tk-radius); }
.profile-earned-list li > div { display: grid; gap: .2rem; }
.profile-earned-caption { color: var(--tk-accent); font-size: var(--tk-text-sm); }
.profile-award-symbol { position: relative; inline-size: 3.7rem; block-size: auto; aspect-ratio: 1; margin-block-end: .45rem; border: 2px solid var(--tk-accent); outline: 1px dashed color-mix(in srgb, var(--tk-accent) 55%, transparent); outline-offset: -5px; background: var(--tk-selected); color: var(--tk-accent); }
.profile-award-symbol::after { position: absolute; inset: 100% 20% auto; block-size: .55rem; background: var(--tk-accent); clip-path: polygon(0 0, 100% 0, 100% 100%, 61% 65%, 48% 99%, 34% 60%, 0 100%); content: ''; }
.profile-award-symbol svg { inline-size: 1.85rem; }
.profile-earned-list p, .profile-next-grade p { margin: 0; color: var(--tk-muted); }
.profile-next-grade { display: grid; gap: .4rem; }
.profile-next-grade small { color: var(--tk-muted); }
.profile-grade-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--tk-space-3); }
.profile-grade-heading span { flex: none; font-variant-numeric: tabular-nums; color: var(--tk-muted); }
.profile-word-skeleton { margin-block: .35rem; inline-size: 6rem; }
.profile-awards-loading { display: grid; gap: var(--tk-space-3); }
.profile-awards-loading > :first-child { block-size: 10rem; }
.profile-awards-loading > :last-child { inline-size: 62%; }
@container (min-width: 30rem) {
  .profile-earned-list { grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
}
@container (max-width: 32rem) {
  .profile-achievement-tabs { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); border-radius: var(--tk-radius-panel); }
  .profile-achievement-tabs :deep(.tk-segment:last-of-type:nth-of-type(odd)) { grid-column: 1 / -1; }
}
</style>
