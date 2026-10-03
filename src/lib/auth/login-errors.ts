/** Client-safe messages for /login?error=… (codes are set only by the auth routes). */
const MESSAGES: Record<string, string> = {
  atlassian_cancelled: "Atlassian sign-in was cancelled.",
  atlassian_invalid_state: "Your sign-in attempt expired or could not be verified. Please try again.",
  atlassian_expired: "Your sign-in attempt expired. Please try again.",
  atlassian_unavailable: "Atlassian sign-in is temporarily unavailable. Please try again shortly.",
  atlassian_failed: "Atlassian sign-in failed. Please try again.",
  atlassian_no_email: "Your Atlassian account did not provide an email address.",
  atlassian_not_allowed: "You do not have access to this dashboard.",
  atlassian_not_configured: "Atlassian sign-in is not available.",
};

export function loginErrorMessage(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(MESSAGES, code) ? MESSAGES[code]! : null;
}
