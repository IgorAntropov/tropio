import type { RegionPosition } from './history-entry';

const regionSelector = '[data-scroll-region]';
const anchorSelector = '[data-scroll-anchor]';

export function capturePositions(outstanding: RegionPosition[] = []): RegionPosition[] {
  const positions: RegionPosition[] = [{ name: '', left: window.scrollX, top: window.scrollY }];
  for (const region of document.querySelectorAll<HTMLElement>(regionSelector)) {
    if (!region.clientHeight || (!region.scrollTop && !region.scrollLeft && region.scrollHeight <= region.clientHeight)) {
      continue;
    }
    const position: RegionPosition = { name: region.dataset.scrollRegion!, left: region.scrollLeft, top: region.scrollTop };
    if (position.top > 0) {
      const top = region.getBoundingClientRect().top;
      for (const item of region.querySelectorAll<HTMLElement>(anchorSelector)) {
        const box = item.getBoundingClientRect();
        if (box.height && box.bottom > top && box.top < top + region.clientHeight) {
          position.anchor = { id: item.dataset.scrollAnchor!, offset: box.top - top };
          break;
        }
      }
    }
    positions.push(position);
  }
  const unfinished = new Set(outstanding.map(position => position.name));
  return [...positions.filter(position => !unfinished.has(position.name)), ...outstanding];
}

function restorePosition(position: RegionPosition) {
  const selector = '[data-scroll-region="' + CSS.escape(position.name) + '"]';
  const region = position.name ? document.querySelector<HTMLElement>(selector) : document.scrollingElement;
  if (!region?.clientHeight || region.closest('[data-scroll-pending="true"]') || region.querySelector('[data-scroll-pending="true"]')) {
    return false;
  }
  let top = position.top;
  const { anchor } = position;
  if (anchor) {
    const item = region.querySelector('[data-scroll-anchor="' + CSS.escape(anchor.id) + '"]');
    if (item?.getClientRects().length) {
      top = region.scrollTop + item.getBoundingClientRect().top - region.getBoundingClientRect().top - anchor.offset;
    }
  }
  region.scrollTo({ top, left: position.left, behavior: 'instant' });
  return !!anchor || (Math.abs(region.scrollTop - top) < 1 && Math.abs(region.scrollLeft - position.left) < 1);
}

export function restorePositions(positions: RegionPosition[]) {
  let pending = positions;
  let frame = 0;
  const events = new AbortController();
  const mutations = new MutationObserver(schedule);
  const resize = new ResizeObserver(schedule);
  function stop() {
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resize.disconnect();
    events.abort();
    return pending;
  }
  function userScroll() {
    pending = [];
    stop();
  }
  function keyboard(event: KeyboardEvent) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '].includes(event.key)) {
      userScroll();
    }
  }
  function apply() {
    frame = 0;
    pending = pending.filter(position => !restorePosition(position));
    if (!pending.length) {
      stop();
    }
    else {
      for (const region of document.querySelectorAll(regionSelector)) {
        resize.observe(region);
        if (region.firstElementChild) {
          resize.observe(region.firstElementChild);
        }
      }
    }
  }
  function schedule() {
    if (!frame && !events.signal.aborted) {
      frame = requestAnimationFrame(apply);
    }
  }
  mutations.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-scroll-pending', 'data-scroll-region'],
  });
  resize.observe(document.body);
  for (const event of ['wheel', 'touchmove']) {
    window.addEventListener(event, userScroll, { capture: true, passive: true, signal: events.signal });
  }
  window.addEventListener('keydown', keyboard, { capture: true, signal: events.signal });
  schedule();
  return stop;
}
