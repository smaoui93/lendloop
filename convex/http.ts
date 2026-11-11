import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  inboundMessage,
  verifySignature,
} from "./lib/hmac";
import { todayISO } from "./lib/validators";

const http = httpRouter();

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Reads the raw body once and verifies the n8n -> Convex signature over it. */
async function verified(request: Request): Promise<{ ok: true; body: string } | { ok: false; res: Response }> {
  const body = await request.text();
  const path = new URL(request.url).pathname;
  const result = await verifySignature({
    secret: process.env.N8N_INBOUND_SECRET,
    signatureHeader: request.headers.get(SIGNATURE_HEADER),
    timestampHeader: request.headers.get(TIMESTAMP_HEADER),
    message: (ts) => inboundMessage(ts, request.method, path, body),
  });
  if (!result.ok) {
    console.warn(`[lendloop] rejected ${request.method} ${path}: ${result.reason}`);
    // Do not leak the reason to the caller.
    return { ok: false, res: json(401, { error: "invalid signature" }) };
  }
  return { ok: true, body };
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined;

http.route({
  path: "/api/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const check = await verified(request);
    if (!check.ok) return check.res;
    const today = todayISO();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { today });
    return json(200, { today, count: loans.length, loans });
  }),
});

http.route({
  path: "/api/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const check = await verified(request);
    if (!check.ok) return check.res;
    const data = parseJson(check.body);
    if (!data) return json(400, { error: "body must be a JSON object" });

    const idempotencyKey = str(data.idempotencyKey, 200);
    const kind = data.kind;
    const status = data.status;
    const channel = str(data.channel, 50) ?? "mock";
    if (!idempotencyKey) return json(400, { error: "idempotencyKey required" });
    if (kind !== "request_notification" && kind !== "overdue_reminder") {
      return json(400, { error: "kind must be request_notification or overdue_reminder" });
    }
    if (status !== "sent" && status !== "failed") return json(400, { error: "status must be sent or failed" });
    const loanId = str(data.loanId, 64);
    if (!loanId) return json(400, { error: "loanId required" });

    const result = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey,
      loanId,
      kind,
      status,
      channel,
      n8nExecutionId: str(data.n8nExecutionId, 64),
      detail: str(data.detail, 2000),
    });
    if (!result.ok) return json(404, { error: result.error });
    return json(200, { ok: true, duplicate: result.duplicate });
  }),
});

http.route({
  path: "/api/automation-errors",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const check = await verified(request);
    if (!check.ok) return check.res;
    const data = parseJson(check.body);
    if (!data) return json(400, { error: "body must be a JSON object" });

    const executionId = str(data.executionId, 64);
    if (!executionId) return json(400, { error: "executionId required" });
    const workflow = str(data.workflowName, 200) ?? "unknown workflow";
    const node = str(data.nodeName, 200);
    const message = str(data.message, 2000) ?? "unknown error";

    const result = await ctx.runMutation(internal.automation.recordEvent, {
      idempotencyKey: `error:${executionId}`,
      loanId: str(data.loanId, 64),
      kind: "workflow_error",
      status: "failed",
      channel: "n8n",
      n8nExecutionId: executionId,
      detail: `${workflow}${node ? ` › ${node}` : ""}: ${message}`,
    });
    // An unknown loanId on an error report shouldn't hide the error: record without it.
    if (!result.ok) {
      await ctx.runMutation(internal.automation.recordEvent, {
        idempotencyKey: `error:${executionId}`,
        kind: "workflow_error",
        status: "failed",
        channel: "n8n",
        n8nExecutionId: executionId,
        detail: `${workflow}${node ? ` › ${node}` : ""}: ${message}`,
      });
    }
    return json(200, { ok: true });
  }),
});

export default http;
