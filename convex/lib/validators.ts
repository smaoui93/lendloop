import { v, type Infer } from "convex/values";

export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;

export const CONDITIONS = ["new", "good", "fair", "worn"] as const;

export const LOAN_STATUSES = [
  "pending",
  "approved",
  "declined",
  "cancelled",
  "returned",
] as const;

export const categoryValidator = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const conditionValidator = v.union(...CONDITIONS.map((c) => v.literal(c)));
export const loanStatusValidator = v.union(...LOAN_STATUSES.map((s) => v.literal(s)));
export const roleValidator = v.union(v.literal("admin"), v.literal("user"));

export const loanEventTypeValidator = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

export const automationKindValidator = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
  v.literal("workflow_error"),
);

export const automationStatusValidator = v.union(v.literal("sent"), v.literal("failed"));

export type Category = Infer<typeof categoryValidator>;
export type Condition = Infer<typeof conditionValidator>;
export type LoanStatus = Infer<typeof loanStatusValidator>;
export type LoanEventType = Infer<typeof loanEventTypeValidator>;

export const LIMITS = {
  nameMax: 80,
  descriptionMax: 280,
  maxLoanDays: 30,
} as const;

/** ISO date (YYYY-MM-DD) in UTC. */
export function todayISO(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive date ranges overlap. ISO strings compare lexicographically. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
