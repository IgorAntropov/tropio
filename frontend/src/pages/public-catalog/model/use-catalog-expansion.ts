import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

const fadeDuration = 300
const travelDelay = fadeDuration * .3
const travelDuration = 460
const totalDuration = travelDelay + travelDuration
const travelStart = travelDelay / totalDuration
const travelEasing = 'cubic-bezier(.25,.65,.24,1)'

export function useCatalogExpansion(tripId: Ref<string>, selectedId: Ref<string>, list: Ref<HTMLElement | undefined>, mobile: Ref<boolean>, back: () => void) {
  const router = useRouter()
  const stage = ref<HTMLElement>()
  let origin: { id: string, link?: HTMLElement, box: DOMRect, boardTop: number, listTop: number, scrollY: number } | undefined
  let motion: { element: Element, animations: Animation[], entering: boolean } | undefined
  let returningFocus: MutationObserver | undefined
  let focusTimeout: ReturnType<typeof setTimeout> | undefined
  let closing = false
  let removeNavigationHook: (() => void) | undefined

  function remember(event: MouseEvent) {
    if (event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const control = event.target instanceof Element ? event.target.closest<HTMLElement>('.catalog-card-link, .catalog-view-trip') : null
    const link = control?.closest('.catalog-card')?.querySelector<HTMLAnchorElement>('.catalog-card-link')
    const card = link?.closest('.catalog-card')
    const board = card?.closest('.catalog-board')
    if (link && card && board) {
      const id = link.pathname.split('/').pop() ?? ''
      origin = { id, link: control ?? link, box: card.getBoundingClientRect(), boardTop: board.getBoundingClientRect().top, listTop: list.value?.scrollTop ?? 0, scrollY: window.scrollY }
    }
  }

  function forgetLink() {
    if (origin) origin.link = undefined
  }

  function close() {
    if (!tripId.value || closing) return
    closing = true
    back()
  }

  function outside(event: MouseEvent) {
    if (mobile.value || !tripId.value || !(event.target instanceof Element) || event.target.closest('.catalog-expanded .catalog-card, .catalog-expanded-map, .catalog-detail-issue')) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  function escape(event: KeyboardEvent) {
    if (!tripId.value || event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    close()
  }

  function restoreScroll() {
    if (!origin) return
    if (list.value) list.value.scrollTop = origin.listTop
    window.scrollTo({ top: origin.scrollY, behavior: 'instant' })
  }

  function stopMotion() {
    for (const animation of motion?.animations ?? []) animation.cancel()
    motion = undefined
    stage.value?.removeAttribute('data-card-motion')
  }

  function animate(element: Element, done: () => void, entering: boolean) {
    const frame = stage.value
    const board = frame?.querySelector<HTMLElement>('.catalog-board')
    const card = element.querySelector<HTMLElement>('.catalog-card-expanded')
    element.classList.toggle('catalog-expanded-leaving', !entering)

    function finish() {
      if (!entering && !tripId.value) {
        restoreScroll()
        frame?.removeAttribute('data-present-days')
      }
      stopMotion()
      done()
    }

    if (mobile.value || !frame || !card || matchMedia('(prefers-reduced-motion: reduce)').matches) return finish()
    if (entering && origin?.id !== tripId.value) origin = undefined
    if (entering) frame.setAttribute('data-present-days', '')

    let animations: Animation[]
    if (motion?.element === element && motion.entering !== entering) {
      animations = motion.animations
      for (const animation of animations) animation.reverse()
    } else {
      stopMotion()
      frame.setAttribute('data-card-motion', entering ? 'entering' : 'leaving')
      if (entering && frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ block: 'start', behavior: 'instant' })
      if (list.value && origin) list.value.scrollTop = origin.listTop
      const box = card.getBoundingClientRect()
      const source = origin?.link?.isConnected ? origin.box : undefined
      const compact = {
        minHeight: '0px',
        width: (source?.width ?? box.width) + 'px',
        height: (source?.height ?? Math.min(box.height, 220)) + 'px',
        transform: 'translate(' + (source ? source.left - box.left : 0) + 'px, ' + (source ? source.top - box.top : 8) + 'px)',
      }
      const full = { minHeight: '0px', width: box.width + 'px', height: box.height + 'px', transform: 'translate(0, 0)' }
      const direction = entering ? 'normal' : 'reverse'
      const timing: KeyframeAnimationOptions = { duration: totalDuration, fill: 'both', direction }
      animations = [card.animate([
        { ...compact, opacity: 0, offset: 0 },
        { ...compact, opacity: 0, offset: travelStart },
        { ...compact, opacity: 1, offset: travelStart, easing: travelEasing },
        { ...full, opacity: 1, offset: 1 },
      ], timing)]
      if (board && source && origin) {
        const shift = origin.boardTop - board.getBoundingClientRect().top
        if (Math.abs(shift) > 1) {
          const offset = { transform: 'translateY(' + shift + 'px)' }
          animations.push(board.animate([offset, offset], timing))
        }
        const sourceCard = origin.link?.closest('.catalog-card')
        const peers = board.querySelectorAll<HTMLElement>('.catalog-row, .catalog-more')
        for (const peer of peers) {
          if (!peer.getClientRects().length) continue
          animations.push(peer.animate(peer.contains(sourceCard ?? null) ? [
            { opacity: 1, offset: 0 }, { opacity: 1, offset: travelStart },
            { opacity: 0, offset: travelStart }, { opacity: 0, offset: 1 },
          ] : [
            { opacity: 1, offset: 0 }, { opacity: 0, offset: fadeDuration / totalDuration }, { opacity: 0, offset: 1 },
          ], timing))
        }
      }
    }
    frame.setAttribute('data-card-motion', entering ? 'entering' : 'leaving')
    const current = { element, animations, entering }
    motion = current
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (motion === current) finish()
      else done()
    })
  }

  function stopFocusRestore() {
    returningFocus?.disconnect()
    returningFocus = undefined
    clearTimeout(focusTimeout)
  }

  async function restore() {
    await nextTick()
    if (tripId.value || !stage.value) return
    stopFocusRestore()
    restoreScroll()
    const frame = stage.value
    const originLink = origin?.link
    if (originLink?.isConnected && originLink.getClientRects().length) {
      originLink.focus({ preventScroll: true })
      return
    }
    const toggle = frame.querySelector<HTMLElement>('.catalog-view input:checked')
    const search = frame.closest('.catalog-page')?.querySelector<HTMLElement>('.catalog-search input')
    const fallback = toggle?.getClientRects().length ? toggle : search
    const map = frame.querySelector<HTMLElement>('.catalog-map')
    if (!map?.getClientRects().length || !selectedId.value) {
      fallback?.focus({ preventScroll: true })
      return
    }
    const clusterSelector = '.route-map-cluster[data-cluster-trip="' + CSS.escape(selectedId.value) + '"]'
    function returnTarget() {
      const marker = map?.querySelector<HTMLElement>('.route-map-marker--trip[aria-pressed="true"]:not(:disabled)')
      if (marker?.getClientRects().length) return marker
      const group = map?.querySelector<HTMLElement>(clusterSelector)
      return group?.getClientRects().length ? group : undefined
    }
    const target = returnTarget()
    const control = target ?? fallback
    control?.focus({ preventScroll: true })
    if (target || !mobile.value) return
    returningFocus = new MutationObserver(() => {
      if (tripId.value || document.activeElement !== fallback) return stopFocusRestore()
      const active = returnTarget()
      if (!active) return
      active.focus({ preventScroll: true })
      stopFocusRestore()
    })
    returningFocus.observe(map, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'data-cluster-trip'] })
    focusTimeout = setTimeout(stopFocusRestore, 1600)
  }

  onMounted(() => {
    removeNavigationHook = router.afterEach(() => { closing = false })
    document.addEventListener('click', outside, true)
    document.addEventListener('keydown', escape)
  })
  onBeforeUnmount(() => {
    removeNavigationHook?.()
    stopMotion()
    stopFocusRestore()
    if (import.meta.client) {
      document.removeEventListener('click', outside, true)
      document.removeEventListener('keydown', escape)
    }
  })
  return { stage, remember, close, animate, restore, forgetLink }
}
