export default defineEventHandler(async (event) => {
  let health: unknown;

  try {
    const url = new URL('/api/v1/health', useRuntimeConfig(event).bffBaseUrl);
    const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
    health = response.ok ? await response.json() : null;
  }
  catch {
    health = null;
  }

  if (health && typeof health === 'object' && 'status' in health && health.status === 'ok') {
    return { status: health.status } as const;
  }

  throw createError({ statusCode: 502, statusMessage: 'BFF unavailable' });
});
