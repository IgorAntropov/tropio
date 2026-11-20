export default defineEventHandler(event => {
  const origin = new URL(useRuntimeConfig(event).public.siteUrl).origin
  setResponseHeader(event, 'content-type', 'text/plain; charset=UTF-8')
  return ['User-agent: *', 'Allow: /catalog', 'Disallow: /api/', 'Disallow: /trips', 'Disallow: /profile', 'Sitemap: ' + origin + '/sitemap.xml', ''].join('\n')
})
