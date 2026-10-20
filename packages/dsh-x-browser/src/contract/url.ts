import { fail } from './errors.ts'

/** Accept only bounded HTTP(S) destinations without embedded credentials. */
export function parseAddress(value: unknown, applicationOrigin?: string | null): string {
  if (typeof value !== 'string' || value.length > 4096 || !value.trim()) throw fail('BROWSER_URL', 'Enter a bounded HTTP(S) URL.')
  let url: URL
  try { url = new URL(value.includes('://') ? value : `https://${value}`) } catch { throw fail('BROWSER_URL', 'Enter a valid HTTP(S) URL.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw fail('BROWSER_URL', 'Only HTTP(S) URLs without embedded credentials are allowed.')
  if (applicationOrigin && applicationOrigin !== 'null') {
    let host: URL | undefined
    try { host = new URL(applicationOrigin) } catch {}
    if (host && ['http:', 'https:'].includes(host.protocol) && url.port === host.port && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw fail('BROWSER_HOST', 'The application host cannot be opened in a browser guest.')
    // Desktop's dsh-app origin is not its HTTP host. The official main-process
    // guest network hook independently blocks the actual authenticated host.
  }
  return url.href
}
