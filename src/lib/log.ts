/**
 * Minimal structured server logging (one JSON line per event).
 * Keys that look sensitive are redacted defensively; callers must still never pass secrets.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /token|secret|password|passwd|authorization|cookie|session|credential|apikey|api_key/i;

export function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) out[key] = "[redacted]";
    else if (value instanceof Error) out[key] = { name: value.name, message: value.message };
    else out[key] = value;
  }
  return out;
}

export function log(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redact(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
