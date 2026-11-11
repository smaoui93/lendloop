# LendLoop

**Borrow what you need. Lend what you don't.** A neighborhood tool-lending board built with
Next.js (App Router) · Clerk · Convex · n8n · TypeScript.

- **Public page** (`/`): tagline, read-only list of tools (name + category only), "Sign in to lend or borrow".
- **Signed in**: browse tools with availability + category filter, list/edit/delete your tools,
  request a date range, approve/decline incoming requests, mark loans returned.
  Views: **Tools**, **My listings**, **My requests**, **Incoming**, and **Admin** for admins.
- **Admin**: remove any listing, see all loans, toggle **Trusted Lender**, and see failed automations (with a retry button).
- **Automation (n8n)**: signed request notifications, daily overdue reminders with idempotent write-back,
  an error workflow, and automation activity shown on each loan ("Reminder sent 2 days ago").

## Architecture

- **Next.js** is a thin client. Pages call Convex through `useQuery`/`useMutation`, and Clerk handles sign-in.
  `proxy.ts` only redirects signed-out visitors away from app routes. It does no authorization.
- **Convex** owns all data and every rule. The Clerk JWT is verified by Convex (`convex/auth.config.ts`), and each
  function resolves the caller from it before checking role, ownership and the allowed state transition.
- **Convex → n8n** uses a transactional outbox. A loan change and its `webhookDeliveries` row commit together.
  A scheduled action then signs and POSTs the event, retrying with backoff. n8n never needs to poll for new requests.
- **n8n → Convex** goes only through three signed HTTP actions (`convex/http.ts`). n8n has no Convex admin key
  and cannot call queries or mutations directly, so it can only do what those endpoints allow.

```
Browser ──Clerk JWT──▶ Convex queries/mutations ── RBAC enforced here (convex/lib/auth.ts)
                         │ loan state change + outbox row (same transaction)
                         ▼
                 scheduled action ──HMAC-signed POST──▶ n8n "Request Notification" webhook
                         ▲  retries 30s/2m/10m/1h            │ verify sig → notify → signed write-back
                         │                                    ▼
 Convex HTTP actions ◀──HMAC-signed──  n8n "Overdue Reminders" (daily)   POST /api/automation-events
   GET  /api/overdue-loans                                               (idempotent by key)
   POST /api/automation-events      n8n "Error Handler" ──▶ POST /api/automation-errors
```

## Project layout

| Path | What |
|---|---|
| `convex/schema.ts` | `users`, `tools`, `loans`, `webhookDeliveries` (outbox), `automationEvents` |
| `convex/lib/auth.ts` | `userQuery`/`userMutation`/`adminQuery`/`adminMutation` builders. Identity always comes from the JWT |
| `convex/tools.ts`, `loans.ts`, `admin.ts`, `users.ts` | Business logic plus ownership and role checks |
| `convex/automation.ts` | Outbox, signed delivery with retries/backoff, overdue query, idempotent `recordEvent` |
| `convex/http.ts` | Signed inbound endpoints for n8n |
| `convex/lib/hmac.ts` | HMAC-SHA256 sign/verify (Web Crypto, constant-time compare, 5-minute replay window) |
| `convex/lendloop.test.ts` | 16 tests covering RBAC, transitions, signatures, retries, idempotency |
| `app/`, `components/` | UI (`proxy.ts` is Next 16's renamed middleware) |
| `n8n/build-workflows.mjs` → `n8n/workflows/*.json` | Source and generated n8n workflows |
| `n8n/docker-compose.yml` | Self-hosted n8n |

## Setup

### 1. Install and start Convex
```bash
npm install
npx convex dev          # pick a cloud project, or "local" to run the backend on your machine
```
This writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` to `.env.local`.

### 2. Clerk
1. Create a Clerk app. In **Integrations → Convex**, activate the integration, or create a JWT template named `convex`.
2. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `.env.local`. See `.env.example`.
3. Tell Convex who issues the tokens, and who the first admin is:
```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
npx convex env set ADMIN_EMAILS you@example.com
```
Admins are stored in the Convex `users` table, never sent by the client. A user is promoted when they sign in
with a verified email listed in `ADMIN_EMAILS`. You can also promote someone later:
`npx convex run users:setRole '{"email":"x@y.z","role":"admin"}'`.

### 3. n8n
```bash
cp n8n/.env.example n8n/.env        # fill in the secrets (see the comments in the file)
docker compose -f n8n/docker-compose.yml up -d
# Git Bash on Windows: prefix the next commands with MSYS_NO_PATHCONV=1
docker compose -f n8n/docker-compose.yml exec n8n n8n import:workflow --separate --input=/workflows
for id in lendloopErrorWf1 lendloopNotifyW1 lendloopOverdue1; do
  docker compose -f n8n/docker-compose.yml exec n8n n8n publish:workflow --id=$id
done
```
Or import the three JSON files in the n8n UI and publish/activate them. The two main workflows already
point to **LendLoop – Error Handler** as their error workflow.

Give Convex the same secrets, and the URL of the webhook:
```bash
npx convex env set N8N_WEBHOOK_SECRET  <same as LENDLOOP_WEBHOOK_SECRET>
npx convex env set N8N_INBOUND_SECRET  <same as LENDLOOP_INBOUND_SECRET>
npx convex env set N8N_REQUEST_WEBHOOK_URL http://localhost:5678/webhook/lendloop-request
```
> **Networking:** a **cloud** Convex deployment cannot reach `localhost:5678`. Expose n8n with a tunnel
> (`cloudflared tunnel --url http://localhost:5678`) and use that URL, or run Convex **locally**
> (`npx convex dev` → local). With local Convex, n8n reaches it at `http://host.docker.internal:3211`,
> which is already the default in `n8n/.env.example`.

### 4. Run
```bash
npm run dev               # http://localhost:3000
npx convex run seed:demo  # optional: demo tools from a "Demo Neighbor"
```

## Environment variables

Secrets live in three places, and none of them is committed.

| Variable | Where | Purpose |
|---|---|---|
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | `.env.local` | Written by `npx convex dev` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | `.env.local` | Clerk keys for Next.js |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex env | Issuer Convex trusts for JWTs |
| `ADMIN_EMAILS` | Convex env | Comma-separated verified emails promoted to admin on sign-in |
| `N8N_REQUEST_WEBHOOK_URL` | Convex env | n8n "Request Notification" webhook URL |
| `N8N_WEBHOOK_SECRET` | Convex env | Signs Convex → n8n. Same value as `LENDLOOP_WEBHOOK_SECRET` |
| `N8N_INBOUND_SECRET` | Convex env | Verifies n8n → Convex. Same value as `LENDLOOP_INBOUND_SECRET` |
| `N8N_ENCRYPTION_KEY` | `n8n/.env` | Encrypts n8n credentials at rest |
| `LENDLOOP_WEBHOOK_SECRET`, `LENDLOOP_INBOUND_SECRET` | `n8n/.env` | The two HMAC secrets, read by Code nodes via `$env` |
| `LENDLOOP_CONVEX_SITE_URL` | `n8n/.env` | Base URL of the Convex HTTP actions |
| `DISCORD_WEBHOOK_URL` | `n8n/.env` | Optional. Used by the Discord nodes, which ship disabled |
| `N8N_VERSION` | shell / `n8n/.env` | Optional override of the pinned n8n image tag |

Convex env vars are set with `npx convex env set NAME value`. Convex functions do not read `.env.local`.

## Security design

- **RBAC in Convex, not the UI.** Every public function except `tools.listPublic` is built with
  `userQuery`/`userMutation`/`admin*`, which load the caller from `ctx.auth`. On top of that, handlers check
  ownership (`tool.ownerId`, `loan.lenderId`/`borrowerId`) and run state changes through a transition table.
  `listPublic` returns only `{_id, name, category}`, and owner emails are never sent to non-admins.
  `proxy.ts` (Clerk) only redirects signed-out visitors.
- **Both directions are signed with HMAC-SHA256**, using a different secret for each direction.
  - Convex → n8n: `sha256=HMAC(N8N_WEBHOOK_SECRET, ts + "." + rawBody)`.
  - n8n → Convex: `HMAC(N8N_INBOUND_SECRET, ts + "." + METHOD + "." + path + "." + rawBody)`.
  - The receiver checks the timestamp is within 5 minutes and compares in constant time. Bad requests get 401.
    In n8n, they also fail the run, so the error workflow fires.
  - A captured request could be replayed inside that 5-minute window. Every write is idempotent, so a replay
    changes nothing, but production should also reject reused event IDs (see below).
- **Minimal payloads.** The webhook carries `eventId`, `eventType`, `loanId`, `toolName`, the dates, and the
  recipient's name and email. Nothing else.
- **No secrets in code or workflow JSON.** Code nodes read `$env.*`, set from `n8n/.env`, which is gitignored.
  Optional Discord nodes ship disabled. Check with:
  `grep -rniE "sha256=[0-9a-f]{8}|[0-9a-f]{40,}" n8n/workflows || echo clean`.
- **Idempotent write-backs.** `automationEvents.idempotencyKey` is unique (checked through the `by_key` index):
  - Notifications use `notify:<eventId>` and reminders use `overdue:<loanId>:<YYYY-MM-DD>`.
  - A repeat of a `sent` key does nothing. A `failed` key is updated in place, so a successful retry changes it to `sent`.
  - `/api/overdue-loans` leaves out loans already reminded today, so a re-run sends nothing.
- **Failures are always visible.**
  - The outbox row is written in the same transaction as the loan change.
  - Delivery retries with backoff (5 attempts), and after that the row is marked `failed`.
  - n8n HTTP nodes retry 3× and send-failures go to an error branch that records `failed`.
  - Any run that fails anyway fires **Error Handler**, which posts to `/api/automation-errors`.
  - All of this shows up in **Admin → Automation** and on each loan card.

## Testing

```bash
npx vitest run       # 16 backend tests (convex-test)
npx tsc --noEmit && npm run lint && npm run build
```

Manual end-to-end test, using local Convex and n8n in Docker:
1. Two users: A lists a tool and B requests it. The n8n execution log shows `[LendLoop notify] to=A…`, and B's
   card shows "Notification sent just now".
2. A approves the loan. Run `npx convex run seed:backdateLoan '{"loanId":"<id>","daysAgo":2}'`, then in n8n open
   **Overdue Reminders** and click **Execute workflow**. The card shows "Reminder sent just now", and a second run adds nothing.
3. Send a forged webhook. You get a 401, and a `workflow_error` appears under Admin → Automation.
4. Stop n8n and create a request. Admin → Automation shows a delivery retrying, and it is delivered once n8n is back.
   A borrower email ending in `@fail.test` simulates a failed reminder send.

## Running this in production

What I would change before real users depend on it:

- **Real notifications.** Replace the mock send with an email provider (Resend, Postmark, SES) configured
  as an n8n credential. Add per-user notification preferences and an unsubscribe link.
- **Replay protection.** Store each verified `eventId` or nonce for the length of the timestamp window and reject
  repeats, on both sides. Today only idempotency protects against replays.
- **Secret management.** Keep the HMAC secrets in a secret manager, rotate them on a schedule, and accept two
  active secrets during a rotation so it needs no downtime.
- **n8n hardening.** Run n8n in queue mode with Postgres and Redis instead of the default SQLite. Put it behind
  TLS, enable SSO/MFA for the editor, and expose only `/webhook/*` publicly. Keep the image pinned and
  upgrade deliberately.
- **Alerting, not just a dashboard.** Send Error Handler runs and permanently failed deliveries to on-call
  (Slack, PagerDuty). Alert when the daily reminder run did not happen at all, not only when it failed.
- **Scale.** Paginate `listAll`, `listIncoming` and the admin lists, and stop computing availability per tool
  on every read (store it on the tool, or index loans by date). Add rate limits on borrow requests.
- **Data lifecycle.** Prune delivered outbox rows and old automation events after a retention period. Let users
  export and delete their data, and hard-delete it when they close their Clerk account (via a Clerk webhook).
- **Admin audit log.** Record who removed a listing or changed a role or Trusted Lender status, and when.
- **Delivery pipeline.** CI running typecheck, lint, tests and build on each PR. Separate dev, staging and prod
  Convex deployments and n8n instances, each with its own secrets. Workflow JSON is promoted through git, not
  edited by hand in production.
- **Time zones.** Overdue checks use UTC dates. Store the neighborhood's time zone so "due today" matches what
  users expect.
