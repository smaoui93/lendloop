import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { outboundMessage, signHeader } from "./lib/hmac";
import {
  automationKindValidator,
  automationStatusValidator,
  daysBetween,
  type LoanEventType,
} from "./lib/validators";

/** Backoff after attempt N fails (ms). Length + 1 = max attempts. */
export const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 3_600_000];
export const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;
const REQUEST_TIMEOUT_MS = 10_000;
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 413, 422]);

/**
 * Transactional outbox: called inside the same mutation that changes loan
 * state, so an event is recorded iff the change commits. Delivery happens in
 * a scheduled action (actions can do fetch; mutations can't).
 */
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  loanId: Id<"loans">,
  eventType: LoanEventType,
) {
  const loan = await ctx.db.get(loanId);
  if (!loan) return;
  const tool = await ctx.db.get(loan.toolId);
  // Lender hears about new/cancelled requests; borrower hears about decisions.
  const recipientId =
    eventType === "loan.requested" || eventType === "loan.cancelled" ? loan.lenderId : loan.borrowerId;
  const recipient = await ctx.db.get(recipientId);
  if (!recipient) return;

  const eventId = crypto.randomUUID();
  const deliveryId = await ctx.db.insert("webhookDeliveries", {
    eventId,
    loanId,
    eventType,
    // Minimal payload: only what the notification needs.
    payload: {
      eventId,
      eventType,
      loanId,
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { name: recipient.name, email: recipient.email },
    },
    status: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { deliveryId });
}

export const getDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: (ctx, { deliveryId }) => ctx.db.get(deliveryId),
});

export const markDelivered = internalMutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d) return;
    await ctx.db.patch(deliveryId, {
      status: "delivered",
      attempts: d.attempts + 1,
      deliveredAt: Date.now(),
      lastError: undefined,
      nextAttemptAt: undefined,
    });
  },
});

export const markAttemptFailed = internalMutation({
  args: { deliveryId: v.id("webhookDeliveries"), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, { deliveryId, error, retryable }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d || d.status === "delivered") return;
    const attempts = d.attempts + 1;
    const error_ = error.slice(0, 500);
    if (retryable && attempts < MAX_ATTEMPTS) {
      const delay = RETRY_BACKOFF_MS[attempts - 1];
      await ctx.db.patch(deliveryId, {
        status: "pending",
        attempts,
        lastError: error_,
        nextAttemptAt: Date.now() + delay,
      });
      await ctx.scheduler.runAfter(delay, internal.automation.deliver, { deliveryId });
    } else {
      console.error(`[lendloop] webhook delivery ${d.eventId} failed permanently: ${error_}`);
      await ctx.db.patch(deliveryId, {
        status: "failed",
        attempts,
        lastError: error_,
        nextAttemptAt: undefined,
      });
    }
  },
});

/** Re-queue a failed delivery (used by the admin "Retry" button). */
export async function requeueDelivery(ctx: MutationCtx, deliveryId: Id<"webhookDeliveries">) {
  const d = await ctx.db.get(deliveryId);
  if (!d || d.status !== "failed") return false;
  await ctx.db.patch(deliveryId, { status: "pending", attempts: 0, nextAttemptAt: undefined });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { deliveryId });
  return true;
}

export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.runQuery(internal.automation.getDelivery, { deliveryId });
    if (!delivery || delivery.status !== "pending") return;

    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.markAttemptFailed, {
        deliveryId,
        error: "N8N_REQUEST_WEBHOOK_URL / N8N_WEBHOOK_SECRET not configured",
        retryable: false,
      });
      return;
    }

    const body = JSON.stringify(delivery.payload);
    const ts = Math.floor(Date.now() / 1000).toString();
    const signature = await signHeader(secret, outboundMessage(ts, body));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LendLoop-Event-Id": delivery.eventId,
          "X-LendLoop-Timestamp": ts,
          "X-LendLoop-Signature": signature,
        },
        body,
        signal: controller.signal,
      });
      if (res.ok) {
        await ctx.runMutation(internal.automation.markDelivered, { deliveryId });
      } else {
        // Only give up on errors a retry can't fix (bad payload / bad signature).
        // 404 stays retryable: n8n returns it while starting up or when the
        // workflow is temporarily inactive.
        const retryable = !NON_RETRYABLE_STATUS.has(res.status);
        await ctx.runMutation(internal.automation.markAttemptFailed, {
          deliveryId,
          error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
          retryable,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.automation.markAttemptFailed, {
        deliveryId,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  },
});

// ---------------------------------------------------------------------------
// Inbound (n8n -> Convex), called from http.ts after signature verification.
// ---------------------------------------------------------------------------

export function reminderKey(loanId: string, today: string) {
  return `overdue:${loanId}:${today}`;
}

export const overdueLoans = internalQuery({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();
    const out = [];
    for (const loan of loans) {
      const key = reminderKey(loan._id, today);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
        .unique();
      if (already?.status === "sent") continue; // re-runs on the same day are no-ops
      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!borrower) continue;
      out.push({
        loanId: loan._id,
        reminderKey: key,
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
        borrower: { name: borrower.name, email: borrower.email },
      });
    }
    return out;
  },
});

/**
 * Idempotent write-back keyed by idempotencyKey:
 *  - none      -> insert
 *  - sent      -> no-op (duplicate)
 *  - failed    -> updated in place (a later success upgrades it to sent)
 */
export const recordEvent = internalMutation({
  args: {
    idempotencyKey: v.string(),
    loanId: v.optional(v.string()),
    kind: automationKindValidator,
    status: automationStatusValidator,
    channel: v.string(),
    n8nExecutionId: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = args.loanId ? ctx.db.normalizeId("loans", args.loanId) : null;
    if (args.loanId && !loanId) return { ok: false as const, error: "unknown loanId" };
    if (loanId && !(await ctx.db.get(loanId))) return { ok: false as const, error: "unknown loanId" };

    const now = Date.now();
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();

    if (existing) {
      if (existing.status === "sent") return { ok: true as const, duplicate: true, id: existing._id };
      await ctx.db.patch(existing._id, {
        status: args.status,
        channel: args.channel,
        n8nExecutionId: args.n8nExecutionId,
        detail: args.detail?.slice(0, 500),
        updatedAt: now,
      });
      return { ok: true as const, duplicate: false, id: existing._id };
    }

    const id = await ctx.db.insert("automationEvents", {
      idempotencyKey: args.idempotencyKey,
      loanId: loanId ?? undefined,
      kind: args.kind,
      status: args.status,
      channel: args.channel,
      n8nExecutionId: args.n8nExecutionId,
      detail: args.detail?.slice(0, 500),
      createdAt: now,
      updatedAt: now,
    });
    return { ok: true as const, duplicate: false, id };
  },
});

