/**
 * Content-Security-Policy (per request, nonce-based — see docs/deployment.md).
 * - Scripts: only same-origin + this request's nonce ('strict-dynamic' lets Next load its chunks).
 * - Styles: 'unsafe-inline' is required for React/Recharts inline style attributes.
 * - No framing, no plugins, forms post only to this origin.
 */
export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function createNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
