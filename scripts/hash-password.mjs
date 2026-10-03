#!/usr/bin/env node
/**
 * Generates a DASHBOARD_USERS password hash (same format as src/lib/auth/password.ts):
 *   scrypt.<N>.<r>.<p>.<salt>.<hash>
 *
 * Usage:  npm run auth:hash-password            (prompts, input hidden)
 *         printf '%s' "$PASSWORD" | npm run -s auth:hash-password
 * The password is never logged or written to disk.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout, stderr } from "node:process";

const N = 16384, r = 8, p = 1, KEY = 32;

function readHidden(prompt) {
  return new Promise((resolve) => {
    if (!stdin.isTTY) {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
      return;
    }
    stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    stdin.on("data", (char) => {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stderr.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.exit(130);
      } else if (char === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    });
  });
}

const password = await readHidden("Password for dashboard user: ");
if (password.length < 12) {
  stderr.write("Use at least 12 characters.\n");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, KEY, { N, r, p, maxmem: 64 * 1024 * 1024 });
stdout.write(["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(".") + "\n");
