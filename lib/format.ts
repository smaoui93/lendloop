import { ConvexError } from "convex/values";
import type { Category, Condition, LoanStatus } from "@/convex/lib/validators";

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CATEGORY_ICONS: Record<Category, string> = {
  power_tools: "🔌",
  hand_tools: "🔧",
  garden: "🌱",
  kitchen: "🍳",
  camping: "⛺",
  cleaning: "🧽",
  other: "📦",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Well-loved",
};

export const STATUS_LABELS: Record<LoanStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
  returned: "Returned",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | string;
    return typeof data === "string" ? data : (data.message ?? "Something went wrong.");
  }
  return "Something went wrong. Please try again.";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(ms: number, now = Date.now()): string {
  const diff = (ms - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function todayLocalISO(): string {
  return new Date().toISOString().slice(0, 10);
}
