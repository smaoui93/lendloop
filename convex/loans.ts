import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, userMutation, userQuery } from "./lib/auth";
import {
  LIMITS,
  daysBetween,
  isISODate,
  rangesOverlap,
  todayISO,
  type LoanEventType,
  type LoanStatus,
} from "./lib/validators";
import { enqueueLoanEvent } from "./automation";

/** Allowed transitions and who may perform them. */
const TRANSITIONS: Record<
  "approve" | "decline" | "cancel" | "markReturned",
  { from: LoanStatus; to: LoanStatus; actor: "lender" | "borrower"; event: LoanEventType }
> = {
  approve: { from: "pending", to: "approved", actor: "lender", event: "loan.approved" },
  decline: { from: "pending", to: "declined", actor: "lender", event: "loan.declined" },
  cancel: { from: "pending", to: "cancelled", actor: "borrower", event: "loan.cancelled" },
  markReturned: { from: "approved", to: "returned", actor: "lender", event: "loan.returned" },
};

/**
 * Recent automation activity for a loan (bonus UI). Both parties see it, so
 * the free-text `detail` (written by n8n, may mention a recipient or an error
 * message) is returned to admins only.
 */
export async function activityFor(ctx: QueryCtx, loanId: Id<"loans">, includeDetail: boolean) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
  const deliveries = await ctx.db
    .query("webhookDeliveries")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
  const fromEvents = events.map((e) => ({
    kind: e.kind,
    status: e.status,
    at: e.updatedAt,
    detail: e.detail,
  }));
  // Deliveries that never reached n8n have no automationEvent; surface them too.
  const failedDeliveries = deliveries
    .filter((d) => d.status === "failed")
    .map((d) => ({
      kind: "request_notification" as const,
      status: "failed" as const,
      at: d._creationTime,
      detail: `Webhook delivery failed: ${d.lastError ?? "unknown error"}`,
    }));
  return [...fromEvents, ...failedDeliveries]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((a) => (includeDetail ? a : { ...a, detail: undefined }));
}

async function enrich(ctx: QueryCtx, loan: Doc<"loans">, viewer: "borrower" | "lender" | "admin") {
  const [tool, borrower, lender] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.borrowerId),
    ctx.db.get(loan.lenderId),
  ]);
  const today = todayISO();
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    returnedAt: loan.returnedAt,
    overdue: loan.status === "approved" && loan.endDate < today,
    tool: { _id: loan.toolId, name: tool?.name ?? "(removed tool)", removed: tool?.removedAt !== undefined },
    borrower: viewer === "borrower" ? null : { name: borrower?.name ?? "Neighbor" },
    lender:
      viewer === "lender"
        ? null
        : { name: lender?.name ?? "Neighbor", trustedLender: lender?.trustedLender ?? false },
    activity: await activityFor(ctx, loan._id, viewer === "admin"),
  };
}
export type EnrichedLoan = Awaited<ReturnType<typeof enrich>>;
export { enrich as enrichLoan };

export const request = userMutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    if (!isISODate(startDate) || !isISODate(endDate)) fail("INVALID_INPUT", "Dates must be YYYY-MM-DD.");
    if (startDate < todayISO()) fail("INVALID_INPUT", "Start date cannot be in the past.");
    if (endDate < startDate) fail("INVALID_INPUT", "End date must be on or after the start date.");
    if (daysBetween(startDate, endDate) + 1 > LIMITS.maxLoanDays) {
      fail("INVALID_INPUT", `Loans can be at most ${LIMITS.maxLoanDays} days.`);
    }

    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "Tool not found.");
    if (tool.ownerId === ctx.user._id) fail("FORBIDDEN", "You cannot borrow your own tool.");

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    if (pending.some((l) => l.borrowerId === ctx.user._id)) {
      fail("CONFLICT", "You already have a pending request for this tool.");
    }
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect();
    if (approved.some((l) => rangesOverlap(l, { startDate, endDate }))) {
      fail("CONFLICT", "The tool is already booked for some of those dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: ctx.user._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      status: "pending",
    });
    await enqueueLoanEvent(ctx, loanId, "loan.requested");
    return loanId;
  },
});

function transition(name: keyof typeof TRANSITIONS) {
  const rule = TRANSITIONS[name];
  return userMutation({
    args: { loanId: v.id("loans") },
    handler: async (ctx, { loanId }) => {
      const loan = await ctx.db.get(loanId);
      if (!loan) fail("NOT_FOUND", "Request not found.");
      const actorId = rule.actor === "lender" ? loan.lenderId : loan.borrowerId;
      if (actorId !== ctx.user._id) fail("FORBIDDEN", "You are not allowed to change this request.");
      if (loan.status !== rule.from) {
        fail("INVALID_TRANSITION", `Cannot ${name} a request that is ${loan.status}.`);
      }

      if (name === "approve") {
        const tool = await ctx.db.get(loan.toolId);
        if (!tool || tool.removedAt !== undefined) fail("CONFLICT", "This tool is no longer listed.");
        const approved = await ctx.db
          .query("loans")
          .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "approved"))
          .collect();
        if (approved.some((l) => rangesOverlap(l, loan))) {
          fail("CONFLICT", "Those dates overlap another approved loan.");
        }
      }

      const now = Date.now();
      await ctx.db.patch(loanId, {
        status: rule.to,
        ...(name === "markReturned" ? { returnedAt: now } : { decidedAt: now }),
      });
      await enqueueLoanEvent(ctx, loanId, rule.event);
    },
  });
}

export const approve = transition("approve");
export const decline = transition("decline");
export const cancel = transition("cancel");
export const markReturned = transition("markReturned");

/** Loans where I am the borrower. */
export const listMine = userQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.user._id))
      .order("desc")
      .collect();
    return await Promise.all(loans.map((l) => enrich(ctx, l, "borrower")));
  },
});

/** Loans on my tools. */
export const listIncoming = userQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", ctx.user._id))
      .order("desc")
      .collect();
    return await Promise.all(loans.map((l) => enrich(ctx, l, "lender")));
  },
});
