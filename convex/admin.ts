import { v } from "convex/values";
import { requeueDelivery } from "./automation";
import { adminMutation, adminQuery, fail } from "./lib/auth";
import { enrichLoan } from "./loans";
import { retireTool } from "./tools";

export const listAllLoans = adminQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(loans.map((l) => enrichLoan(ctx, l, "admin")));
  },
});

export const listUsers = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return await Promise.all(
      users.map(async (u) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id))
          .collect();
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          trustedLender: u.trustedLender,
          activeListings: tools.filter((t) => t.removedAt === undefined).length,
        };
      }),
    );
  },
});

export const listListings = adminQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("tools").collect();
    return await Promise.all(
      tools
        .filter((t) => t.removedAt === undefined)
        .map(async (t) => {
          const owner = await ctx.db.get(t.ownerId);
          return { _id: t._id, name: t.name, category: t.category, ownerName: owner?.name ?? "?" };
        }),
    );
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const user = await ctx.db.get(userId);
    if (!user) fail("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

export const removeListing = adminMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "Tool not found.");
    // Admin moderation may remove a listing that is out on loan; the loan stays
    // visible so it can still be marked returned.
    await retireTool(ctx, tool, ctx.user._id, { allowWhileOnLoan: true });
  },
});

/** Failed webhook deliveries + failed automation events, newest first. */
export const automationIssues = adminQuery({
  args: {},
  handler: async (ctx) => {
    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(50);
    const pending = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .take(50);
    const failedEvents = await ctx.db
      .query("automationEvents")
      .order("desc")
      .filter((q) => q.eq(q.field("status"), "failed"))
      .take(50);
    return {
      failedDeliveries: deliveries.map((d) => ({
        _id: d._id,
        eventType: d.eventType,
        attempts: d.attempts,
        lastError: d.lastError,
        at: d._creationTime,
      })),
      retryingDeliveries: pending
        .filter((d) => d.attempts > 0)
        .map((d) => ({
          _id: d._id,
          eventType: d.eventType,
          attempts: d.attempts,
          lastError: d.lastError,
          nextAttemptAt: d.nextAttemptAt,
        })),
      failedEvents: failedEvents.map((e) => ({
        _id: e._id,
        kind: e.kind,
        detail: e.detail,
        n8nExecutionId: e.n8nExecutionId,
        at: e.updatedAt,
      })),
    };
  },
});

export const retryDelivery = adminMutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    if (!(await requeueDelivery(ctx, deliveryId))) fail("CONFLICT", "Only failed deliveries can be retried.");
  },
});
