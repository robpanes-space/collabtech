"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { log } from "@/lib/log";
import { authenticate } from "./authenticate";
import { emailFingerprint, getAuthConfig } from "./config";
import { loginLimiter } from "./rate-limit";
import { createSessionToken, safeNextPath } from "./session";
import { clearSessionCookie, setSessionCookie } from "./server";

export type LoginState = { error: string | null; email: string };

const GENERIC_ERROR = "Email or password is incorrect.";

/** Server Action (Next.js verifies the request origin). Only generic errors reach the browser. */
export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").slice(0, 254);
  const password = String(formData.get("password") ?? "").slice(0, 256);
  const next = safeNextPath(formData.get("next"));

  const config = getAuthConfig();
  if (config.status !== "enabled") {
    log("error", "auth.login_unavailable", { status: config.status });
    return { error: "Sign-in is not available right now. Please contact your project team.", email };
  }

  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const limiterKey = `${ip}|${emailFingerprint(email)}`;
  if (!loginLimiter.attempt(limiterKey)) {
    log("warn", "auth.login_rate_limited", { user: emailFingerprint(email) });
    return { error: "Too many sign-in attempts. Please wait 15 minutes and try again.", email };
  }

  const result = await authenticate(email, password, config);
  if (!result.ok) {
    log("warn", "auth.login_failed", { user: emailFingerprint(email), reason: result.reason });
    return { error: GENERIC_ERROR, email };
  }

  loginLimiter.reset(limiterKey);
  const token = createSessionToken(
    { provider: "password", email: result.email, passwordHash: result.passwordHash },
    config.sessionSecret,
    new Date(),
    config.sessionMaxAgeSeconds,
  );
  await setSessionCookie(token, config.sessionMaxAgeSeconds);
  log("info", "auth.login_succeeded", { user: emailFingerprint(result.email), provider: "password" });
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
