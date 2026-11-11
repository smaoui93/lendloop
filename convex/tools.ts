import { v } from "convex/values";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fail, userMutation, userQuery } from "./lib/auth";
import {
  LIMITS,
  categoryValidator,
  conditionValidator,
  todayISO,
  type Category,
} from "./lib/validators";
import { enqueueLoanEvent } from "./automation";

function cleanToolInput(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > LIMITS.nameMax) {
    fail("INVALID_INPUT", `Name must be 2–${LIMITS.nameMax} characters.`);
  }
  if (description.length > LIMITS.descriptionMax) {
    fail("INVALID_INPUT", `Description must be at most ${LIMITS.descriptionMax} characters.`);
  }
  return { name, description };
}

async function activeTools(ctx: QueryCtx, category?: Category) {
  const rows = category
    ? await ctx.db.query("tools").withIndex("by_category", (q) => q.eq("category", category)).collect()
    : await ctx.db.query("tools").collect();
  return rows.filter((t) => t.removedAt === undefined);
}

export async function availabilityFor(ctx: QueryCtx, toolId: Id<"tools">) {
  const today = todayISO();
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  const current = approved.find((l) => l.startDate <= today);
  const upcoming = approved
    .filter((l) => l.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((l) => ({ startDate: l.startDate, endDate: l.endDate }));
  return {
    status: current ? ("on_loan" as const) : ("available" as const),
    dueBack: current?.endDate,
    upcoming,
  };
}

async function loadOwnTool(ctx: QueryCtx, user: Doc<"users">, toolId: Id<"tools">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) fail("NOT_FOUND", "Tool not found.");
  if (tool.ownerId !== user._id) fail("FORBIDDEN", "You can only manage your own listings.");
  return tool;
}

/** Public, unauthenticated: name + category only. No owner data, by design. */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await activeTools(ctx);
    return tools.map((t) => ({ _id: t._id, name: t.name, category: t.category }));
  },
});

/** Signed-in browse view with availability. Exposes owner display name, never email. */
export const listAll = userQuery({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const tools = await activeTools(ctx, category);
    return await Promise.all(
      tools.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          owner: { name: owner?.name ?? "Neighbor", trustedLender: owner?.trustedLender ?? false },
          isMine: t.ownerId === ctx.user._id,
          availability: await availabilityFor(ctx, t._id),
        };
      }),
    );
  },
});

export const listMine = userQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", ctx.user._id))
      .collect();
    return await Promise.all(
      tools
        .filter((t) => t.removedAt === undefined)
        .map(async (t) => ({
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          availability: await availabilityFor(ctx, t._id),
        })),
    );
  },
});

export const create = userMutation({
  args: {
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const { name, description } = cleanToolInput(args);
    return await ctx.db.insert("tools", {
      ownerId: ctx.user._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

export const update = userMutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await loadOwnTool(ctx, ctx.user, args.toolId);
    const { name, description } = cleanToolInput(args);
    await ctx.db.patch(args.toolId, {
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
  },
});

/** Soft-delete + decline any pending requests (borrowers get notified). */
export async function retireTool(
  ctx: MutationCtx,
  tool: Doc<"tools">,
  actorId: Id<"users">,
  { allowWhileOnLoan }: { allowWhileOnLoan: boolean },
) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
    .first();
  if (approved && !allowWhileOnLoan) {
    fail("CONFLICT", "This tool has an approved loan. Mark it returned before deleting.");
  }
  const pending = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
    .collect();
  for (const loan of pending) {
    await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loan._id, "loan.declined");
  }
  await ctx.db.patch(tool._id, { removedAt: Date.now(), removedBy: actorId });
}

export const remove = userMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await loadOwnTool(ctx, ctx.user, toolId);
    await retireTool(ctx, tool, ctx.user._id, { allowWhileOnLoan: false });
  },
});
