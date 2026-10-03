# Client launch checklist

Work through this before sharing the dashboard URL with the client. Deployment details:
[`deployment.md`](./deployment.md).

## Application

- [ ] Production build passes (`npm run lint && npm run typecheck && npm run test && npm run build`)
- [ ] Authentication enabled (`DASHBOARD_SESSION_SECRET` set; `/api/health` returns `ok`)
- [ ] Atlassian OAuth app created (scope `read:me` only; callback = exact production URL)
- [ ] `ATLASSIAN_CLIENT_ID` / `ATLASSIAN_CLIENT_SECRET` / `ATLASSIAN_CALLBACK_URL` set (secret marked sensitive)
- [ ] Client emails in `DASHBOARD_ALLOWED_EMAILS` **or** `DASHBOARD_JIRA_PROJECT_ACCESS=true` with clients invited to the Jira project; at least one password admin in `DASHBOARD_USERS`
- [ ] If using project access: project set to *Private* in Jira so only invited people can sign in (`/admin/readiness` → "Sign-in through Jira project access")
- [ ] "Sign in with Atlassian" tested by an allowlisted client and refused for a non-listed account
- [ ] Allowed users tested (each client account can sign in; a non-listed email cannot)
- [ ] Mobile tested (375px phone: overview, sprint detail, risks)
- [ ] 404 tested (`/sprints/999` shows "Sprint not found" with HTTP 404)
- [ ] Jira links tested ("SCRUM-14 ↗" opens the issue in a new tab)
- [ ] Time zone verified (footer shows the intended `DASHBOARD_TIME_ZONE`; "Last synced" tooltip matches local time)
- [ ] Health endpoint verified (`/api/health` → 200; `/api/jira/health` all checks `ok` when signed in)
- [ ] Cache behavior verified (change a Jira status → visible within ~2 minutes; Refresh reports cached vs updated)

## Jira

Do these in Jira (the dashboard is read-only and never changes Jira). `/admin/readiness`
shows the live status of each item:

- [ ] Active sprint correct (MIG S1 is the sprint in progress)
- [ ] Empty sample sprint closed if unused (`SCRUM Sprint 0`)
- [ ] `exclude-from-progress` labels reviewed — decide whether `SCRUM-3` ("Task 3") and
      `SCRUM-50` (acceptance controls) belong in delivery progress; label them if not
- [ ] S2–S8 dates reviewed (set start/end dates once planning is known; until then the
      dashboard shows "Schedule not set")
- [ ] Risk links reviewed ("blocks" links from I-01…I-10 to the right stories)
- [ ] Story point estimation begun (progress switches to story points automatically once every
      work item is estimated)
- [ ] Milestone hierarchy reviewed (each story's parent is the right M1–M8 epic)

## Security

- [ ] Secrets server-side (set in the host's secret store, never `NEXT_PUBLIC_`, never committed)
- [ ] No secrets in browser bundle (search `.next/static` for `JIRA_API_TOKEN`, `JIRA_EMAIL`,
      `Authorization`, `Basic `, the real Jira email, token and session secret — expect no matches)
- [ ] Production HTTPS
- [ ] Secure cookies (`__Host-jira_dashboard_session`, `HttpOnly`, `Secure`, `SameSite=Lax`)
- [ ] Security headers present (CSP with nonce, `X-Frame-Options: DENY`, `nosniff`, HSTS)
- [ ] Unauthorized API access rejected (`curl /api/jira/dashboard` without a session → 401)
- [ ] Jira API token belongs to a read-only service account and has an expiry/rotation plan

## Client

- [ ] Client login tested (by the client, on their device, with "Sign in with Atlassian")
- [ ] Overview understandable (health, progress, current sprint, blockers read correctly)
- [ ] Risks understandable (P0/P1, what each risk blocks)
- [ ] Jira link permissions confirmed (links open Jira; clients without Jira access will see a
      Jira login page)
- [ ] Client has appropriate Jira access if deep links are provided — otherwise set
      `DASHBOARD_JIRA_LINKS=false`
