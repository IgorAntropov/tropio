import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

export function useCatalogLocation(autoAllowed: () => boolean) {
  const near = shallowRef<string>()
  const located = shallowRef<string>()
  const issue = ref(false)
  const locating = ref(false)
  let permission: PermissionStatus | undefined
  let generation = 0
  function cancel() {
    generation++
    locating.value = false
  }
  async function locate(auto = false) {
    const version = ++generation
    locating.value = true
    issue.value = false
    try {
      if (!navigator.geolocation) throw new Error()
      const result = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60_000 })
      })
      if (version !== generation) return false
      located.value = [result.coords.longitude.toFixed(5), result.coords.latitude.toFixed(5)].join(',')
      if (auto && autoAllowed()) near.value = located.value
      return true
    } catch {
      if (version === generation) issue.value = true
      return false
    } finally {
      if (version === generation) locating.value = false
    }
  }
  function permissionChanged() {
    if (permission?.state === 'granted') return
    cancel()
    near.value = undefined
    located.value = undefined
    issue.value = permission?.state === 'denied'
  }
  onMounted(async () => {
    if (!navigator.permissions) return
    const version = generation
    permission = await navigator.permissions.query({ name: 'geolocation' }).catch(() => undefined)
    if (version !== generation) return
    permission?.addEventListener('change', permissionChanged)
    if (autoAllowed() && permission?.state === 'granted') await locate(true)
  })
  onBeforeUnmount(() => {
    cancel()
    permission?.removeEventListener('change', permissionChanged)
  })
  return { near, located, locating, issue, locate, cancel }
}
