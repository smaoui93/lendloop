import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Category, Condition } from "./lib/validators";

/**
 * Dev helpers — internal only (not callable from the browser).
 *   npx convex run seed:demo
 *   npx convex run seed:backdateLoan '{"loanId":"<id>","daysAgo":3}'
 */
export const demo = internalMutation({
  args: {},
  handler: async (ctx) => {
    let owner = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", "seed|demo-neighbor"))
      .unique();
    if (!owner) {
      const id = await ctx.db.insert("users", {
        tokenIdentifier: "seed|demo-neighbor",
        name: "Demo Neighbor",
        email: "demo-neighbor@example.com",
        role: "user",
        trustedLender: true,
      });
      owner = (await ctx.db.get(id))!;
    }
    const existing = await ctx.db.query("tools").withIndex("by_owner", (q) => q.eq("ownerId", owner._id)).first();
    if (existing) return "already seeded";

    const tools: Array<[string, Category, Condition, string]> = [
      ["Cordless drill", "power_tools", "good", "18V with two batteries and a bit set."],
      ["Circular saw", "power_tools", "fair", "7¼\" blade, works great for plywood."],
      ["Hedge trimmer", "garden", "good", "Electric, 50 cm blade."],
      ["Wheelbarrow", "garden", "worn", "Sturdy, tyre recently replaced."],
      ["Stand mixer", "kitchen", "new", "Dough hook, whisk and paddle included."],
      ["4-person tent", "camping", "good", "Easy pop-up, rain fly included."],
      ["Pressure washer", "cleaning", "good", "130 bar, patio cleaner attachment."],
      ["Socket set", "hand_tools", "good", "Metric + imperial, 94 pieces."],
    ];
    for (const [name, category, condition, description] of tools) {
      await ctx.db.insert("tools", { ownerId: owner._id, name, category, condition, description });
    }
    return `seeded ${tools.length} tools`;
  },
});

/** Shift an approved loan into the past so it becomes overdue (for testing the reminder workflow). */
export const backdateLoan = internalMutation({
  args: { loanId: v.id("loans"), daysAgo: v.optional(v.number()) },
  handler: async (ctx, { loanId, daysAgo = 3 }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) throw new Error("loan not found");
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    await ctx.db.patch(loanId, {
      status: "approved",
      startDate: day(daysAgo + 2),
      endDate: day(daysAgo),
    });
  },
});

/**
 * Removes data created by manual/E2E testing with `convex run --identity`
 * (fake issuer "https://convex.test|…"): those users, their tools and loans,
 * the loans' deliveries/automation events, and loan-less workflow errors.
 * Real Clerk users and their data are kept.
 *   npx convex run seed:resetTestData
 */
export const resetTestData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const testUsers = (await ctx.db.query("users").collect()).filter((u) =>
      u.tokenIdentifier.startsWith("https://convex.test|"),
    );
    const testIds = new Set<string>(testUsers.map((u) => u._id));
    const counts = { users: 0, tools: 0, loans: 0, deliveries: 0, events: 0 };

    const loans = (await ctx.db.query("loans").collect()).filter(
      (l) => testIds.has(l.borrowerId) || testIds.has(l.lenderId),
    );
    const loanIds = new Set<string>(loans.map((l) => l._id));

    for (const d of await ctx.db.query("webhookDeliveries").collect()) {
      if (loanIds.has(d.loanId)) {
        await ctx.db.delete(d._id);
        counts.deliveries++;
      }
    }
    for (const e of await ctx.db.query("automationEvents").collect()) {
      if (e.loanId ? loanIds.has(e.loanId) : e.kind === "workflow_error") {
        await ctx.db.delete(e._id);
        counts.events++;
      }
    }
    for (const l of loans) {
      await ctx.db.delete(l._id);
      counts.loans++;
    }
    for (const t of await ctx.db.query("tools").collect()) {
      if (testIds.has(t.ownerId)) {
        await ctx.db.delete(t._id);
        counts.tools++;
      }
    }
    for (const u of testUsers) {
      await ctx.db.delete(u._id);
      counts.users++;
    }
    return counts;
  },
});
