const loopbackHost = /^(?:127\.0\.0\.1|\[::1\]|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)*localhost)(?::\d+)?$/i;

export function isLoopbackHost(host = '') {
  return host === '::1' || loopbackHost.test(host);
}
