import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationKindValidator,
  automationStatusValidator,
  categoryValidator,
  conditionValidator,
  loanEventTypeValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_status_end", ["status", "endDate"]),

  /** Outbox for Convex -> n8n webhook calls. One row per loan event. */
  webhookDeliveries: defineTable({
    eventId: v.string(),
    loanId: v.id("loans"),
    eventType: loanEventTypeValidator,
    payload: v.object({
      eventId: v.string(),
      eventType: loanEventTypeValidator,
      loanId: v.string(),
      toolName: v.string(),
      startDate: v.string(),
      endDate: v.string(),
      recipient: v.object({ name: v.string(), email: v.string() }),
    }),
    status: v.union(v.literal("pending"), v.literal("delivered"), v.literal("failed")),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),

  /** What n8n reports back. idempotencyKey is unique (enforced in code via by_key). */
  automationEvents: defineTable({
    idempotencyKey: v.string(),
    loanId: v.optional(v.id("loans")),
    kind: automationKindValidator,
    status: automationStatusValidator,
    channel: v.string(),
    n8nExecutionId: v.optional(v.string()),
    detail: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"])
    .index("by_kind_status", ["kind", "status"]),
});
