import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, getCurrentUser } from "./lib/auth";
import { roleValidator } from "./lib/validators";

function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Called by the client after sign-in. Creates/refreshes the profile from the
 * verified JWT identity. Takes no args, so clients cannot choose their role.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("UNAUTHENTICATED", "Sign in required.");

    const email = (identity.email ?? "").toLowerCase();
    const name = identity.name || identity.nickname || email.split("@")[0] || "Neighbor";
    const shouldBeAdmin = email !== "" && identity.emailVerified !== false && adminEmails().has(email);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (existing) {
      const patch: Partial<typeof existing> = {};
      if (existing.name !== name) patch.name = name;
      if (existing.email !== email) patch.email = email;
      // Bootstrap promotion only; demotion is an explicit admin action.
      if (shouldBeAdmin && existing.role !== "admin") patch.role = "admin";
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role: shouldBeAdmin ? "admin" : "user",
      trustedLender: false,
    });
  },
});

/** Safe self-view for the UI (role is used only for showing/hiding nav). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/** Run from the dashboard/CLI: npx convex run users:setRole '{"email":"a@b.c","role":"admin"}' */
export const setRole = internalMutation({
  args: { email: v.string(), role: roleValidator },
  handler: async (ctx, { email, role }) => {
    const users = await ctx.db.query("users").collect();
    const user = users.find((u) => u.email === email.toLowerCase());
    if (!user) fail("NOT_FOUND", `No user with email ${email}`);
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});
