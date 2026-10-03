import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with Node's scrypt. Encoded format (no "$", so it is safe in .env files):
 *   scrypt.<N>.<r>.<p>.<salt base64url>.<hash base64url>
 */

const DEFAULTS = { N: 16384, r: 8, p: 1, keyLength: 32, saltLength: 16 } as const;
const MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keyLength, { ...options, maxmem: MAX_MEM }, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export type ParsedHash = { N: number; r: number; p: number; salt: Buffer; hash: Buffer };

export function parsePasswordHash(encoded: string): ParsedHash | null {
  const parts = encoded.trim().split(".");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  const valid =
    Number.isInteger(N) && N >= 1024 && N <= 1048576 && (N & (N - 1)) === 0 &&
    Number.isInteger(R) && R >= 1 && R <= 32 &&
    Number.isInteger(P) && P >= 1 && P <= 16 &&
    /^[A-Za-z0-9_-]{16,}$/.test(salt) && /^[A-Za-z0-9_-]{32,}$/.test(hash);
  if (!valid) return null;
  return { N, r: R, p: P, salt: Buffer.from(salt, "base64url"), hash: Buffer.from(hash, "base64url") };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(DEFAULTS.saltLength);
  const hash = await scryptAsync(password, salt, DEFAULTS.keyLength, { N: DEFAULTS.N, r: DEFAULTS.r, p: DEFAULTS.p });
  return ["scrypt", DEFAULTS.N, DEFAULTS.r, DEFAULTS.p, salt.toString("base64url"), hash.toString("base64url")].join(".");
}

/** Constant-time verification. Malformed hashes never verify. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parsed = parsePasswordHash(encoded);
  if (!parsed) return false;
  const candidate = await scryptAsync(password, parsed.salt, parsed.hash.length, { N: parsed.N, r: parsed.r, p: parsed.p });
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** A fixed, valid hash used to spend equal time when the email is unknown. */
export const DUMMY_HASH =
  "scrypt.16384.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
