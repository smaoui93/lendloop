// Generates the importable n8n workflow JSON files in ./workflows.
// Run: node n8n/build-workflows.mjs
//
// No secrets live here: Code nodes read them from $env (set in n8n/.env, which
// is gitignored), so the exported JSON is safe to commit.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "workflows");
mkdirSync(OUT, { recursive: true });

const IDS = {
  notify: "lendloopNotifyW1",
  overdue: "lendloopOverdue1",
  error: "lendloopErrorWf1",
};

const RETRY = { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 };

let seq = 0;
function node(name, type, typeVersion, position, parameters, extra = {}) {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    name,
    type,
    typeVersion,
    position,
    parameters,
    ...extra,
  };
}
const code = (name, position, jsCode, extra = {}, mode = "runOnceForAllItems") =>
  node(name, "n8n-nodes-base.code", 2, position, { mode, jsCode: jsCode.trim() }, extra);

/** HTTP Request that sends a pre-signed raw JSON body prepared by the previous Code node. */
const signedPost = (name, position) =>
  node(
    name,
    "n8n-nodes-base.httpRequest",
    4.2,
    position,
    {
      method: "POST",
      url: "={{ $json.url }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Content-Type", value: "application/json" },
          { name: "X-LendLoop-Timestamp", value: "={{ $json.ts }}" },
          { name: "X-LendLoop-Signature", value: "={{ $json.signature }}" },
        ],
      },
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/json",
      body: "={{ $json.rawBody }}",
      options: { timeout: 10000 },
    },
    RETRY,
  );

function connect(pairs) {
  const c = {};
  for (const [from, to, outputIndex = 0] of pairs) {
    c[from] ??= { main: [] };
    while (c[from].main.length <= outputIndex) c[from].main.push([]);
    c[from].main[outputIndex].push({ node: to, type: "main", index: 0 });
  }
  return c;
}

function workflow(id, name, nodes, connections, settings = {}) {
  return {
    id,
    name,
    active: false,
    nodes,
    connections,
    settings: { executionOrder: "v1", saveDataErrorExecution: "all", saveDataSuccessExecution: "all", ...settings },
    pinData: {},
    meta: { templateCredsSetupCompleted: true },
    tags: [],
  };
}

// Shared JS snippet: signs an n8n -> Convex request.
// Canonical string: `${ts}.${METHOD}.${path}.${rawBody}` (see convex/lib/hmac.ts)
const SIGN_FN = `
const crypto = require('crypto');
function signForConvex(method, path, rawBody) {
  const secret = $env.LENDLOOP_INBOUND_SECRET;
  const base = ($env.LENDLOOP_CONVEX_SITE_URL || '').replace(/\\/$/, '');
  if (!secret) throw new Error('LENDLOOP_INBOUND_SECRET is not set');
  if (!base) throw new Error('LENDLOOP_CONVEX_SITE_URL is not set');
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(ts + '.' + method + '.' + path + '.' + rawBody)
    .digest('hex');
  return { url: base + path, ts, signature, rawBody };
}
`;

// ---------------------------------------------------------------------------
// 1. Request notification (Convex -> n8n webhook)
// ---------------------------------------------------------------------------
{
  seq = 0;
  const nodes = [
    node("Webhook (from Convex)", "n8n-nodes-base.webhook", 2, [0, 300], {
      httpMethod: "POST",
      path: "lendloop-request",
      responseMode: "responseNode",
      options: { rawBody: true },
    }, { webhookId: "6f1c2a52-6d0e-4a4b-9a57-1e4d1009a001" }),

    code("Verify signature", [220, 300], `
// Verifies X-LendLoop-Signature = sha256=HMAC(secret, ts + "." + rawBody)
const crypto = require('crypto');
const secret = $env.LENDLOOP_WEBHOOK_SECRET;
const item = $input.first();
const headers = item.json.headers || {};
const ts = String(headers['x-lendloop-timestamp'] || '');
const sig = String(headers['x-lendloop-signature'] || '');

let raw;
if (item.binary && item.binary.data) {
  raw = Buffer.from(await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
} else {
  raw = JSON.stringify(item.json.body); // fallback if raw body is unavailable
}

function check() {
  if (!secret) return 'LENDLOOP_WEBHOOK_SECRET not set';
  if (!/^\\d{1,12}$/.test(ts)) return 'missing/invalid timestamp';
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return 'stale timestamp';
  const m = /^sha256=([0-9a-f]{64})$/.exec(sig);
  if (!m) return 'missing/malformed signature';
  const expected = crypto.createHmac('sha256', secret).update(ts + '.' + raw).digest();
  const given = Buffer.from(m[1], 'hex');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return 'signature mismatch';
  return null;
}

const reason = check();
if (reason) return [{ json: { valid: false, reason } }];
const p = JSON.parse(raw);
// Keep only the fields the notification needs.
return [{
  json: {
    valid: true,
    eventId: p.eventId,
    eventType: p.eventType,
    loanId: p.loanId,
    toolName: p.toolName,
    startDate: p.startDate,
    endDate: p.endDate,
    recipientName: p.recipient && p.recipient.name,
    recipientEmail: p.recipient && p.recipient.email,
  },
}];
`),

    node("Signature valid?", "n8n-nodes-base.if", 2.2, [440, 300], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: "c0ffee00-0000-4000-8000-000000000001",
            leftValue: "={{ $json.valid }}",
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    }),

    node("Respond 202", "n8n-nodes-base.respondToWebhook", 1.1, [660, 200], {
      respondWith: "json",
      responseBody: '={{ { "accepted": true, "eventId": $json.eventId } }}',
      options: { responseCode: 202 },
    }),

    node("Respond 401", "n8n-nodes-base.respondToWebhook", 1.1, [660, 440], {
      respondWith: "json",
      responseBody: '={{ { "error": "invalid signature" } }}',
      options: { responseCode: 401 },
    }),

    node("Fail run (bad signature)", "n8n-nodes-base.stopAndError", 1, [880, 440], {
      errorMessage: "={{ 'Rejected webhook: ' + $('Verify signature').first().json.reason }}",
    }),

    code("Build message", [880, 200], `
const t = {
  'loan.requested': (j) => ['New borrow request', \`Hi \${j.recipientName}, a neighbor wants to borrow your \${j.toolName} from \${j.startDate} to \${j.endDate}. Open LendLoop › Incoming to approve or decline.\`],
  'loan.approved':  (j) => ['Request approved', \`Good news \${j.recipientName}! Your request for the \${j.toolName} (\${j.startDate} → \${j.endDate}) was approved.\`],
  'loan.declined':  (j) => ['Request declined', \`Sorry \${j.recipientName}, your request for the \${j.toolName} was declined.\`],
  'loan.cancelled': (j) => ['Request cancelled', \`Hi \${j.recipientName}, the request for your \${j.toolName} was cancelled by the borrower.\`],
  'loan.returned':  (j) => ['Thanks for returning', \`Thanks \${j.recipientName}! The \${j.toolName} has been marked as returned.\`],
};
return $input.all().map(({ json: j }) => {
  const f = t[j.eventType];
  if (!f) throw new Error('Unknown eventType: ' + j.eventType);
  const [subject, text] = f(j);
  return { json: { ...j, to: j.recipientEmail, subject, text } };
});
`),

    code("Send notification (mock)", [1100, 200], `
// Mock channel: logs the message. Replace with Email/Slack/Discord as needed.
for (const { json } of $input.all()) {
  console.log('[LendLoop notify] to=%s subject=%s :: %s', json.to, json.subject, json.text);
}
return $input.all().map(({ json }) => ({ json: { ...json, channel: 'mock', status: 'sent' } }));
`, { onError: "continueErrorOutput" }),

    node("Discord (optional)", "n8n-nodes-base.httpRequest", 4.2, [1100, 0], {
      method: "POST",
      url: "={{ $env.DISCORD_WEBHOOK_URL }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody: '={{ { "content": "**" + $json.subject + "** — " + $json.text } }}',
      options: {},
    }, { disabled: true, ...RETRY }),

    code("Mark failed", [1320, 340], `
return $input.all().map((item, i) => {
  const base = $('Build message').all()[i]?.json ?? {};
  return { json: { ...base, channel: 'mock', status: 'failed', detail: String(item.json.error?.message ?? item.json.error ?? 'send failed') } };
});
`),

    code("Sign write-back", [1540, 200], SIGN_FN + `
const path = '/api/automation-events';
return $input.all().map(({ json: j }) => {
  const rawBody = JSON.stringify({
    idempotencyKey: 'notify:' + j.eventId,   // same event => same key => no duplicates
    loanId: j.loanId,
    kind: 'request_notification',
    status: j.status,
    channel: j.channel,
    n8nExecutionId: String($execution.id),
    detail: j.detail ?? (j.subject + ' → ' + j.to),
  });
  return { json: signForConvex('POST', path, rawBody) };
});
`),

    signedPost("Write back to Convex", [1760, 200]),
  ];

  const connections = connect([
    ["Webhook (from Convex)", "Verify signature"],
    ["Verify signature", "Signature valid?"],
    ["Signature valid?", "Respond 202", 0],
    ["Signature valid?", "Respond 401", 1],
    ["Respond 401", "Fail run (bad signature)"],
    ["Respond 202", "Build message"],
    ["Build message", "Send notification (mock)"],
    ["Build message", "Discord (optional)"],
    ["Send notification (mock)", "Sign write-back", 0],
    ["Send notification (mock)", "Mark failed", 1],
    ["Mark failed", "Sign write-back"],
    ["Sign write-back", "Write back to Convex"],
  ]);

  writeFileSync(
    join(OUT, "request-notification.json"),
    JSON.stringify(
      workflow(IDS.notify, "LendLoop – Request Notification", nodes, connections, { errorWorkflow: IDS.error }),
      null,
      2,
    ) + "\n",
  );
}

// ---------------------------------------------------------------------------
// 2. Overdue reminders (scheduled; n8n -> Convex)
// ---------------------------------------------------------------------------
{
  seq = 100;
  const nodes = [
    node("Every day 09:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 300], {
      rule: { interval: [{ field: "cronExpression", expression: "0 9 * * *" }] },
    }),

    // Lets you run it on demand: "Execute workflow" in the UI, or
    // `n8n execute --id=lendloopOverdue1` from the CLI.
    node("Run now (manual / CLI)", "n8n-nodes-base.executeWorkflowTrigger", 1.1, [0, 480], {
      inputSource: "passthrough",
    }),

    code("Sign overdue request", [220, 300], SIGN_FN + `
return [{ json: signForConvex('GET', '/api/overdue-loans', '') }];
`),

    node("Fetch overdue loans", "n8n-nodes-base.httpRequest", 4.2, [440, 300], {
      method: "GET",
      url: "={{ $json.url }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "X-LendLoop-Timestamp", value: "={{ $json.ts }}" },
          { name: "X-LendLoop-Signature", value: "={{ $json.signature }}" },
        ],
      },
      options: { timeout: 10000 },
    }, RETRY),

    code("One item per loan", [660, 300], `
const loans = $input.first().json.loans || [];
console.log('[LendLoop overdue] %d overdue loan(s)', loans.length);
return loans.map((l) => ({ json: l }));
`),

    code("Send reminder (mock)", [880, 300], `
// Mock channel: logs the reminder. Swap for Email/Slack/Discord in production.
// Emails ending in "@fail.test" simulate a delivery failure (for testing).
const j = $json;
if (String(j.borrower.email).endsWith('@fail.test')) {
  throw new Error('Simulated delivery failure for ' + j.borrower.email);
}
const text = \`Hi \${j.borrower.name}, friendly reminder: the \${j.toolName} was due back on \${j.endDate} (\${j.daysOverdue} day(s) ago). Please return it or contact the lender.\`;
console.log('[LendLoop reminder] to=%s :: %s', j.borrower.email, text);
return { json: { ...j, status: 'sent', channel: 'mock', detail: 'Reminder: ' + j.daysOverdue + ' day(s) overdue' } };
`, { onError: "continueErrorOutput" }, "runOnceForEachItem"),

    code("Mark reminder failed", [1100, 440], `
return $input.all().map((item, i) => {
  const base = $('One item per loan').all()[i]?.json ?? {};
  return { json: { ...base, status: 'failed', channel: 'mock', detail: String(item.json.error?.message ?? item.json.error ?? 'send failed') } };
});
`),

    code("Sign write-back", [1320, 300], SIGN_FN + `
const path = '/api/automation-events';
return $input.all().map(({ json: j }) => ({
  json: signForConvex('POST', path, JSON.stringify({
    idempotencyKey: j.reminderKey,          // overdue:<loanId>:<YYYY-MM-DD>
    loanId: j.loanId,
    kind: 'overdue_reminder',
    status: j.status,
    channel: j.channel,
    n8nExecutionId: String($execution.id),
    detail: j.detail,
  })),
}));
`),

    signedPost("Write back to Convex", [1540, 300]),
  ];

  const connections = connect([
    ["Every day 09:00", "Sign overdue request"],
    ["Run now (manual / CLI)", "Sign overdue request"],
    ["Sign overdue request", "Fetch overdue loans"],
    ["Fetch overdue loans", "One item per loan"],
    ["One item per loan", "Send reminder (mock)"],
    ["Send reminder (mock)", "Sign write-back", 0],
    ["Send reminder (mock)", "Mark reminder failed", 1],
    ["Mark reminder failed", "Sign write-back"],
    ["Sign write-back", "Write back to Convex"],
  ]);

  writeFileSync(
    join(OUT, "overdue-reminders.json"),
    JSON.stringify(
      workflow(IDS.overdue, "LendLoop – Overdue Reminders", nodes, connections, {
        errorWorkflow: IDS.error,
        timezone: "UTC",
      }),
      null,
      2,
    ) + "\n",
  );
}

// ---------------------------------------------------------------------------
// 3. Error handler (set as errorWorkflow on the two workflows above)
// ---------------------------------------------------------------------------
{
  seq = 200;
  const nodes = [
    node("Error Trigger", "n8n-nodes-base.errorTrigger", 1, [0, 300], {}),

    code("Format + sign", [220, 300], SIGN_FN + `
const e = $input.first().json;
const executionId = String(e.execution?.id ?? ('trigger-' + Date.now()));
const report = {
  executionId,
  workflowName: e.workflow?.name ?? 'unknown',
  nodeName: e.execution?.lastNodeExecuted ?? e.trigger?.error?.node?.name,
  message: e.execution?.error?.message ?? e.trigger?.error?.message ?? 'unknown error',
  executionUrl: e.execution?.url,
};
console.error('[LendLoop error] %s › %s: %s (%s)', report.workflowName, report.nodeName, report.message, report.executionUrl);
return [{ json: { ...signForConvex('POST', '/api/automation-errors', JSON.stringify(report)), report } }];
`),

    signedPost("Report to Convex", [440, 300]),

    node("Discord alert (optional)", "n8n-nodes-base.httpRequest", 4.2, [440, 120], {
      method: "POST",
      url: "={{ $env.DISCORD_WEBHOOK_URL }}",
      sendBody: true,
      specifyBody: "json",
      jsonBody:
        '={{ { "content": "⚠️ LendLoop workflow failed: **" + $json.report.workflowName + "** › " + $json.report.nodeName + " — " + $json.report.message } }}',
      options: {},
    }, { disabled: true, ...RETRY }),
  ];
  const connections = connect([
    ["Error Trigger", "Format + sign"],
    ["Format + sign", "Report to Convex"],
    ["Format + sign", "Discord alert (optional)"],
  ]);
  writeFileSync(
    join(OUT, "error-handler.json"),
    JSON.stringify(workflow(IDS.error, "LendLoop – Error Handler", nodes, connections), null, 2) + "\n",
  );
}

console.log("Wrote workflows to", OUT);
