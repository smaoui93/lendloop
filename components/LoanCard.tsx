"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { formatDate, timeAgo } from "@/lib/format";
import { IconBolt } from "./icons";
import { Pill, StatusBadge } from "./ui";

type Loan = FunctionReturnType<typeof api.loans.listMine>[number];
type Activity = Loan["activity"][number];

function activityText(a: Activity): string {
  if (a.kind === "overdue_reminder") return a.status === "sent" ? "Overdue reminder sent" : "Overdue reminder failed";
  if (a.kind === "request_notification") return a.status === "sent" ? "Notification delivered" : "Notification failed";
  return "Automation error";
}

/** Recent automation activity on the loan. */
export function AutomationActivity({ activity }: { activity: Activity[] }) {
  if (activity.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-divider pt-3.5">
      <span className="eyebrow inline-flex items-center gap-1.5">
        <IconBolt size={14} />
        Automation activity
      </span>
      <ol className="flex flex-col gap-1.5">
        {activity.map((a, i) => {
          const failed = a.status === "failed";
          return (
            <li key={i} className="flex flex-wrap items-center gap-2.5 text-sm" title={a.detail}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${failed ? "bg-danger" : "bg-brand"}`} />
              <span className={`font-medium ${failed ? "text-danger" : "text-ink"}`}>{activityText(a)}</span>
              <span className="text-muted">{timeAgo(a.at)}</span>
              {failed && a.detail && <span className="w-full pl-[18px] text-xs text-muted">{a.detail}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function LoanCard({ loan, who, actions, note }: { loan: Loan; who: ReactNode; actions?: ReactNode; note?: ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-line bg-white shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-medium text-ink">{loan.tool.name}</h2>
            <StatusBadge status={loan.status} overdue={loan.overdue} />
            {loan.tool.removed && <Pill tone="neutral" dot={false}>Listing removed</Pill>}
          </div>
          <span className="text-sm text-muted">
            {who} · {formatDate(loan.startDate)} – {formatDate(loan.endDate)}
          </span>
        </div>
        {(actions || note) && (
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {note && <span className="max-w-[260px] text-sm text-muted">{note}</span>}
          </div>
        )}
      </div>
      <AutomationActivity activity={loan.activity} />
    </li>
  );
}
