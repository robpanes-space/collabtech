import packageJson from "../../package.json";

/**
 * Non-secret build identifier: package version plus a short commit hash when the platform
 * provides one (Vercel: VERCEL_GIT_COMMIT_SHA; otherwise APP_COMMIT_SHA).
 */
export function appVersion(env: NodeJS.ProcessEnv = process.env): { version: string; commit: string | null; label: string } {
  const version = env.APP_VERSION?.trim() || packageJson.version;
  const sha = (env.VERCEL_GIT_COMMIT_SHA || env.APP_COMMIT_SHA || "").trim();
  const commit = /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : null;
  return { version, commit, label: commit ? `v${version} (${commit})` : `v${version}` };
}
