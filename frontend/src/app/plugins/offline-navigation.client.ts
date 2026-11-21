export default defineNuxtPlugin(() => {
  const { baseURL, buildId } = useRuntimeConfig().app;
  if (window.isSecureContext && 'serviceWorker' in navigator) {
    onNuxtReady(async () => {
      try {
        await navigator.serviceWorker.register(`${baseURL}navigation-worker.js?build=${encodeURIComponent(buildId)}`);
      }
      catch {
        return;
      }
    });
  }
});
