# Deployment guide

The dashboard is a standard Next.js 16 Node.js app. Vercel is the preferred host; any Node.js
20.9+ host works (`npm run build` → `npm run start`).

## 1. Jira prerequisites

- Use a dedicated, **read-only** Jira account (e.g. `dashboard-bot@…`) with **Browse Projects**
  on project `SCRUM` and access to board `1`. The dashboard never writes to Jira.
- Create an API token for that account at
  <https://id.atlassian.com/manage-profile/security/api-tokens> (set an expiry, rotate it).

## 2. Environment variables

All variables are server-side only — never prefix with `NEXT_PUBLIC_`. See `.env.example`.

| Variable | Required (prod) | Notes |
|---|---|---|
| `JIRA_BASE_URL` | yes | `https://<site>.atlassian.net` (https only) |
| `JIRA_EMAIL` | yes | Jira account that owns the token |
| `JIRA_API_TOKEN` | yes | Jira API token |
| `JIRA_PROJECT_KEY` | yes | `SCRUM` |
| `JIRA_BOARD_ID` | yes | `1` |
| `DASHBOARD_USERS` | yes* | `email:hash` password users (fallback/admin; also allowlisted for Atlassian) |
| `DASHBOARD_ALLOWED_EMAILS` | with Atlassian | emails allowed to sign in with Atlassian |
| `DASHBOARD_JIRA_PROJECT_ACCESS` | no | `true` = anyone with access to the Jira project may sign in with Atlassian |
| `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` / `ATLASSIAN_CALLBACK_URL` | optional | Atlassian OAuth app (all three or none; callback = exact registered https URL) |
| `DASHBOARD_SESSION_SECRET` | yes | ≥ 32 random chars (`npm run auth:session-secret`) |
| `DASHBOARD_TIME_ZONE` | yes | IANA zone, e.g. `Asia/Manila`, `America/New_York` |
| `DASHBOARD_SESSION_HOURS` | no | Default 168 (7 days), max 720 |
| `DASHBOARD_JIRA_LINKS` | no | `true` (default) / `false` to hide "SCRUM-14 ↗" links |
| `JIRA_STORY_POINTS_FIELD`, `JIRA_RISK_FIELD`, `JIRA_EPIC_LINK_FIELD`, `JIRA_BLOCKED_STATUSES` | no | Overrides; blank = auto |
| `APP_VERSION` | no | Overrides the version label (default: `package.json` version + commit SHA) |
| `DASHBOARD_AUTH_DISABLED` | never in prod | Local development only; ignored when `NODE_ENV=production` |

Missing/invalid required values are logged by **name** at startup (`config.invalid` event),
`/api/health` returns `503`, and all pages fail closed (sign-in shows "not available").

### Sign-in methods

| Method | Who | Configured by |
|---|---|---|
| **Sign in with Atlassian** (primary for clients) | anyone whose Atlassian email is allowlisted | `ATLASSIAN_CLIENT_ID`, `ATLASSIAN_CLIENT_SECRET`, `ATLASSIAN_CALLBACK_URL`, `DASHBOARD_ALLOWED_EMAILS` |
| Email + password (fallback / admin) | users in `DASHBOARD_USERS` | `npm run auth:hash-password` |

Both create the same session; the lowercased email is the identity, so one person can use
either method. The allowlist is `DASHBOARD_ALLOWED_EMAILS` **plus** every `DASHBOARD_USERS`
email.

**Jira project access (`DASHBOARD_JIRA_PROJECT_ACCESS=true`).** Atlassian users who are not on
the allowlist may also sign in if their Atlassian account has access (Browse Projects) to the
Jira project. Invite people to the project in Jira — they can sign in immediately (the member
list is re-read at sign-in). Removing someone from the project ends dashboard access within
~5 minutes (the member list is cached for 5 minutes and re-checked on every page and API
request; if Jira cannot be reached and nothing is cached, access is denied). The check uses the
Jira **service account** and the Atlassian account ID — never the user's own token — so the
service account needs the "Browse users and groups" global permission. App/bot accounts never
count. **Important:** if the project's permission scheme grants Browse Projects to every user
with Jira access (an "open" team-managed project), everyone on the site can sign in;
`/admin/readiness` warns about this. Set the project to *Private* in Jira to limit sign-in to
invited people. Being able to sign in to Atlassian never grants access by itself. Removing an email
from the allowlist revokes that user's Atlassian sessions on their next request.
`DASHBOARD_ADMIN_EMAILS` applies whichever method is used.

Keep at least one password admin in `DASHBOARD_USERS` so operators can sign in if Atlassian is
unavailable.

### Creating the Atlassian OAuth app

1. Go to <https://developer.atlassian.com/console/myapps/> → **Create** → **OAuth 2.0 integration**.
   Name it e.g. "Jira Custom Dashboard".
2. **Permissions** → add **User identity API** → scope **`read:me`** only. Do **not** add Jira
   API scopes: dashboard data comes from the server's Jira service account.
3. **Authorization** → OAuth 2.0 (3LO) → **Callback URL**:
   `https://<your-dashboard-domain>/api/auth/atlassian/callback` (exact match; https).
   For local testing you may add `http://localhost:3000/api/auth/atlassian/callback`
   (http is accepted only for localhost outside production).
4. **Settings** → copy the **Client ID** and **Secret** into `ATLASSIAN_CLIENT_ID` and
   `ATLASSIAN_CLIENT_SECRET` (Vercel: mark the secret *Sensitive*). Set
   `ATLASSIAN_CALLBACK_URL` to the same callback URL.
5. Distribution: keep the app private unless clients outside your Atlassian organization must
   sign in — then enable sharing/distribution in the console so their accounts can consent.

**Flow:** `/api/auth/atlassian/start` creates a random `state` bound to the browser by a signed,
HttpOnly, 10-minute cookie and redirects to `auth.atlassian.com/authorize` (scope `read:me`).
`/api/auth/atlassian/callback` checks the state, exchanges the code server-side with the client
secret, calls `GET https://api.atlassian.com/me`, requires an active Atlassian account with an
email, checks the allowlist, then creates the normal dashboard session. The OAuth access token
is used for that single `/me` call and discarded — it is never stored, logged, placed in a
cookie or session, or used for Jira data. Atlassian does not document PKCE for 3LO, so the
confidential client secret + `state` provide the protection.

### Adding a client user

```bash
npm run auth:hash-password        # prompts for the password (hidden), prints the hash
```

With Atlassian sign-in, add the client's Atlassian email to `DASHBOARD_ALLOWED_EMAILS` and
redeploy — no password needed. For password access, append `client@company.com:<hash>` to
`DASHBOARD_USERS` and redeploy. Send the password to the
client over a separate channel. Remove the entry to revoke access — it takes effect on the next
request (sessions are re-checked against the allowlist every time). Changing a user's hash
signs that user out everywhere; rotating `DASHBOARD_SESSION_SECRET` signs everyone out.

## 3. Vercel

1. Import the repository; framework preset **Next.js** (build `npm run build`, output default).
2. **Settings → Environment Variables**: add every required variable for **Production**
   (and Preview if previews should work). Mark tokens/secrets as *Sensitive*.
3. Deploy. Vercel provides HTTPS; `VERCEL_GIT_COMMIT_SHA` feeds the footer build label.
4. Optionally restrict Preview deployments with Vercel Deployment Protection.

## 4. Other Node.js hosts

```bash
npm ci
npm run build
NODE_ENV=production npm run start   # listens on $PORT (default 3000)
```

Terminate TLS in front of the app (HTTPS is required: session cookies are `Secure` and
`__Host-`-prefixed in production). Forward `X-Forwarded-For` for login rate limiting.

## 5. Health endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Liveness: `200 {"status":"ok","version":…}` or `503 {"status":"misconfigured"}`. No Jira data, no variable names. Use for uptime checks. |
| `GET /api/jira/health` | session | Jira connectivity: credentials, project, board, sprints, story-point field (names variables when misconfigured). |
| `GET /api/jira/dashboard` | session | Full dashboard DTO. Unauthenticated → `401`. |
| `GET /api/jira/history` | session | Historical analytics DTO (changelog-based). Unauthenticated → `401`. |

## 6. Caching & refresh

- The whole dashboard payload (all Jira requests + metrics) is cached as **one unit** for
  **60 seconds** (`unstable_cache`, stale-while-revalidate). Jira is read at most about once per
  minute per server instance, no matter how many users or clicks.
- "Last synced" is the time Jira was actually read. The **Refresh** button re-renders the page
  and reports either "Updated with new Jira data" or "Showing the latest cached Jira data".
- A Jira change appears within ~1–2 minutes (cache window + stale-while-revalidate).
- **History** (activity, burndown, trends) is cached separately as one unit for **300 seconds**:
  one bulk changelog request per refresh (≤ 1000 issues per request) plus the status catalog.
  Measured against the live project: ~1.1–1.3 s cold, a few ms warm.

## 7. Time zone

`DASHBOARD_TIME_ZONE` controls every displayed timestamp (Intl.DateTimeFormat; no manual
offsets). Jira date-only values (`YYYY-MM-DD`, e.g. due dates) are calendar dates and never
shift. The footer states the zone in use.

## 8. Security

### Authentication
- Sign in with Atlassian (OAuth 2.0 3LO, `read:me`, state-bound CSRF protection, server-side
  code exchange, token discarded) and/or allowlisted email + per-user password (scrypt hashes
  in `DASHBOARD_USERS`). Both are gated by the same allowlist.
- Session: HMAC-SHA256-signed cookie containing only email, display name, sign-in method, a
  password-version fingerprint (password sign-in) and timestamps — no OAuth tokens or account IDs. `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `__Host-` prefix (prod).
- Login is a Server Action (Next.js origin check), generic error messages, constant-time
  comparison, dummy hashing for unknown emails, 8 attempts / 15 min per IP+email (in memory,
  per instance).
- `src/proxy.ts` redirects unauthenticated pages to `/login` and returns `401` for APIs; the
  dashboard layout and API routes re-check the session.

### Response headers

Per request (proxy):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<random>' 'strict-dynamic';
  style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self';
  connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; upgrade-insecure-requests
```

`style-src 'unsafe-inline'` is required for React/Recharts inline style attributes; scripts are
nonce-only. Development adds `'unsafe-eval'` and websocket `connect-src` for React tooling.

Static (`next.config.ts`): `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()…`,
`Cross-Origin-Opener-Policy: same-origin`,
`Strict-Transport-Security: max-age=63072000; includeSubDomains`. `X-Powered-By` is disabled.

### Secrets
- Jira credentials are read only by `server-only` modules; they never enter sessions, DTOs,
  logs or the browser bundle (verified by build scans — see the launch checklist).
- The Jira **site URL** is intentionally visible in "SCRUM-14 ↗" links
  (`https://<site>/browse/KEY`). It is not a secret; set `DASHBOARD_JIRA_LINKS=false` to hide it.

### Logging
One JSON line per event on stdout/stderr, e.g. `auth.login_failed`, `auth.login_rate_limited`,
`jira.rate_limited`, `dashboard.refresh_failed`, `dashboard.dto_build_failed`, `config.invalid`.
Emails are logged only as a short SHA-256 fingerprint; keys resembling tokens, passwords,
cookies or authorization are redacted. Error pages show an opaque reference (Next.js digest)
that matches server logs.

## 9. Known limitations (sign-in)

- Atlassian's `/me` returns no `email_verified` flag; the dashboard requires an active
  Atlassian-managed account with an email and relies on the allowlist.
- Signing out ends the dashboard session only (not the user's Atlassian session).
- Sessions are stateless: removing a user from the allowlist (or changing a password) revokes
  access on the next request; rotating `DASHBOARD_SESSION_SECRET` signs everyone out.
- Same-origin redirects from the auth routes use relative `Location` headers, so the dashboard
  works behind reverse proxies; the callback URL itself must still be the public https URL.
