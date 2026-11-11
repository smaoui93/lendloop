import { internalMutation } from "./_generated/server";

const RECIPIENT_SUFFIX = /\s*→\s*\S+@\S+/g;

/**
 * One-off: earlier n8n write-backs stored "Subject → recipient@email" in
 * automationEvents.detail. Strip the address so stored data matches the
 * current minimization rule. Safe to re-run.
 *   npx convex run migrations:scrubAutomationDetails
 */
export const scrubAutomationDetails = internalMutation({
  args: {},
  handler: async (ctx) => {
    let scrubbed = 0;
    for (const e of await ctx.db.query("automationEvents").collect()) {
      if (!e.detail) continue;
      const clean = e.detail.replace(RECIPIENT_SUFFIX, "");
      if (clean === e.detail) continue;
      await ctx.db.patch(e._id, { detail: clean });
      scrubbed++;
    }
    return { scrubbed };
  },
});
