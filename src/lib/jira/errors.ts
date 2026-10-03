export type JiraErrorCode =
  | "CONFIG_MISSING"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "JIRA_UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

/** Client-friendly messages. Never include credentials, headers, or raw Jira bodies. */
const FRIENDLY_MESSAGES: Record<JiraErrorCode, string> = {
  CONFIG_MISSING: "The dashboard is not configured to connect to Jira yet.",
  INVALID_CREDENTIALS: "Jira rejected the dashboard's credentials.",
  FORBIDDEN: "The dashboard's Jira account does not have access to this project or board.",
  NOT_FOUND: "The requested Jira project, board, or sprint could not be found.",
  RATE_LIMITED: "Jira is temporarily limiting requests. Data will refresh shortly.",
  JIRA_UNAVAILABLE: "Jira is currently unavailable. Please try again shortly.",
  TIMEOUT: "Jira took too long to respond.",
  NETWORK_ERROR: "The dashboard could not reach Jira.",
  INVALID_RESPONSE: "Jira returned data in an unexpected format.",
  UNKNOWN: "An unexpected error occurred while loading Jira data.",
};

export class JiraApiError extends Error {
  readonly code: JiraErrorCode;
  readonly status: number | null;
  /** Path only (no host, no query string) — safe to log. */
  readonly path: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: JiraErrorCode,
    options: {
      status?: number | null;
      path?: string | null;
      retryAfterSeconds?: number | null;
      detail?: string;
      cause?: unknown;
    } = {},
  ) {
    super(options.detail ?? FRIENDLY_MESSAGES[code], { cause: options.cause });
    this.name = "JiraApiError";
    this.code = code;
    this.status = options.status ?? null;
    this.path = options.path ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  get friendlyMessage(): string {
    return FRIENDLY_MESSAGES[this.code];
  }

  /** Serializable, client-safe representation. */
  toJSON(): { code: JiraErrorCode; message: string; status: number | null } {
    return { code: this.code, message: this.friendlyMessage, status: this.status };
  }
}

export function codeForStatus(status: number): JiraErrorCode {
  if (status === 401) return "INVALID_CREDENTIALS";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "JIRA_UNAVAILABLE";
  return "UNKNOWN";
}

export function isJiraApiError(error: unknown): error is JiraApiError {
  return error instanceof JiraApiError;
}

export function toJiraApiError(error: unknown): JiraApiError {
  if (isJiraApiError(error)) return error;
  return new JiraApiError("UNKNOWN", { cause: error });
}

/** HTTP status for API routes that surface a JiraApiError to the browser. */
export function httpStatusForJiraError(code: JiraErrorCode): number {
  switch (code) {
    case "CONFIG_MISSING":
    case "RATE_LIMITED":
    case "JIRA_UNAVAILABLE":
      return 503;
    case "TIMEOUT":
      return 504;
    case "UNKNOWN":
      return 500;
    default:
      return 502;
  }
}
