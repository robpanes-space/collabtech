import { normalizeEmail, type AuthConfig } from "./config";
import { DUMMY_HASH, verifyPassword } from "./password";

export type LoginResult =
  | { ok: true; email: string; passwordHash: string }
  | { ok: false; reason: "invalid_credentials" | "not_configured" };

/**
 * Checks credentials against the allowlist. Unknown emails still run scrypt against a dummy
 * hash so response time does not reveal which emails are allowed.
 */
export async function authenticate(email: string, password: string, config: AuthConfig): Promise<LoginResult> {
  if (config.status !== "enabled") return { ok: false, reason: "not_configured" };
  const user = config.users.get(normalizeEmail(email));
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid || password.length === 0) return { ok: false, reason: "invalid_credentials" };
  return { ok: true, email: user.email, passwordHash: user.passwordHash };
}
