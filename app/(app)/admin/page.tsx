"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Avatar, Empty, Loading, PageHeader, Pill, Segmented, StatusBadge } from "@/components/ui";
import { IconRetry, IconShield } from "@/components/icons";
import { useRun } from "@/components/useAction";
import { CATEGORY_ICONS, CATEGORY_LABELS, formatDate, timeAgo } from "@/lib/format";

type Tab = "loans" | "listings" | "runs";

const th = "border-b border-line px-5 py-3.5 text-left text-[13px] font-semibold text-muted";
const td = "border-b border-divider px-5 py-3.5";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState<Tab>("loans");

  if (me === undefined) return <Loading />;
  // UI gate only — every admin function re-checks the role in Convex.
  if (me?.role !== "admin") return <Empty>Admins only.</Empty>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin" subtitle="Every loan and listing on the board, plus the health of the automations." />
      <Tiles />
      <Segmented
        label="Admin views"
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        items={[
          { key: "loans", label: "All loans" },
          { key: "listings", label: "Listings and lenders" },
          { key: "runs", label: "Automation runs" },
        ]}
      />
      {tab === "loans" && <AllLoans />}
      {tab === "listings" && (
        <div className="flex flex-wrap items-start gap-5">
          <Listings />
          <Lenders />
        </div>
      )}
      {tab === "runs" && <Automation />}
    </div>
  );
}

function Tiles() {
  const loans = useQuery(api.admin.listAllLoans);
  const issues = useQuery(api.admin.automationIssues);
  const [dayAgo] = useState(() => Date.now() - 86_400_000);
  const tiles = [
    { label: "Active loans", value: loans?.filter((l) => l.status === "approved").length, color: "text-ink" },
    { label: "Overdue", value: loans?.filter((l) => l.overdue).length, color: "text-danger" },
    { label: "Pending requests", value: loans?.filter((l) => l.status === "pending").length, color: "text-info" },
    {
      label: "Failed runs, last 24 h",
      value: issues
        ? issues.failedDeliveries.filter((d) => d.at > dayAgo).length + issues.failedEvents.filter((e) => e.at > dayAgo).length
        : undefined,
      color: "text-danger",
    },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      {tiles.map((k) => (
        <div key={k.label} className="flex flex-col gap-1 rounded-xl border border-line bg-white shadow-sm px-5 py-[18px]">
          <span className="text-sm font-medium text-muted">{k.label}</span>
          <span className={`text-[34px] leading-tight font-semibold tracking-tight ${k.value ? k.color : "text-ink"}`}>
            {k.value ?? "–"}
          </span>
        </div>
      ))}
    </div>
  );
}

function AllLoans() {
  const loans = useQuery(api.admin.listAllLoans);
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <Empty>No loans yet.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
      <table className="w-full min-w-[760px] border-collapse text-[15px]">
        <thead>
          <tr>
            <th scope="col" className={th}>Tool</th>
            <th scope="col" className={th}>Lender</th>
            <th scope="col" className={th}>Borrower</th>
            <th scope="col" className={th}>Dates</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Last automation</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => {
            const last = l.activity[0];
            return (
              <tr key={l._id}>
                <td className={`${td} font-semibold`}>{l.tool.name}</td>
                <td className={td}>{l.lender?.name}</td>
                <td className={td}>{l.borrower?.name}</td>
                <td className={`${td} text-body`}>
                  {formatDate(l.startDate)} – {formatDate(l.endDate)}
                </td>
                <td className={td}>
                  <StatusBadge status={l.status} overdue={l.overdue} dot={false} />
                </td>
                <td className={`${td} text-sm ${last?.status === "failed" ? "text-danger" : "text-body"}`}>
                  {last
                    ? `${last.kind === "overdue_reminder" ? "Reminder" : last.kind === "request_notification" ? "Notification" : "Error"} ${
                        last.status === "failed" ? "failed" : "sent"
                      }, ${timeAgo(last.at)}`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Listings() {
  const tools = useQuery(api.admin.listListings);
  const remove = useMutation(api.admin.removeListing);
  const { busy, run } = useRun();
  return (
    <section aria-labelledby="lst-h" className="min-w-0 flex-[999_1_520px] rounded-xl border border-line bg-white shadow-sm py-2">
      <h2 id="lst-h" className="px-5 py-3.5 text-base font-semibold">All listings</h2>
      {tools === undefined ? (
        <p className="px-5 pb-4 text-sm text-muted">Loading…</p>
      ) : tools.length === 0 ? (
        <p className="border-t border-divider px-5 py-4 text-sm text-muted">No active listings.</p>
      ) : (
        <ul>
          {tools.map((t) => (
            <li key={t._id} className="flex flex-wrap items-center gap-3 border-t border-divider px-5 py-3">
              <span aria-hidden className="text-xl">{CATEGORY_ICONS[t.category]}</span>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-muted">
                  {CATEGORY_LABELS[t.category]} · listed by {t.ownerName}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy === t._id}
                onClick={() => {
                  if (confirm(`Remove "${t.name}"? Pending requests will be declined.`))
                    run(t._id, () => remove({ toolId: t._id }), "Listing removed.");
                }}
              >
                Remove listing
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Lenders() {
  const users = useQuery(api.admin.listUsers);
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const { busy, run } = useRun();
  return (
    <section aria-labelledby="ldr-h" className="min-w-0 flex-[1_1_340px] rounded-xl border border-line bg-white shadow-sm py-2">
      <h2 id="ldr-h" className="px-5 py-3.5 text-base font-semibold">Lenders</h2>
      {users === undefined ? (
        <p className="px-5 pb-4 text-sm text-muted">Loading…</p>
      ) : (
        <ul>
          {users.map((u) => (
            <li key={u._id} className="flex items-center gap-3 border-t border-divider px-5 py-3">
              <Avatar name={u.name} size={36} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {u.name}
                  {u.role === "admin" && (
                    <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.04em] text-white uppercase">
                      Admin
                    </span>
                  )}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {u.email} · {u.activeListings} listing{u.activeListings === 1 ? "" : "s"}
                </span>
              </div>
              <button
                type="button"
                aria-pressed={u.trustedLender}
                disabled={busy === u._id}
                onClick={() =>
                  run(
                    u._id,
                    () => setTrusted({ userId: u._id, trusted: !u.trustedLender }),
                    u.trustedLender ? "Trusted Lender removed." : "Marked as Trusted Lender.",
                  )
                }
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-semibold disabled:opacity-50 ${
                  u.trustedLender
                    ? "border-brand-line bg-brand-soft text-brand-dark"
                    : "border-line-strong bg-white text-ink hover:bg-chip"
                }`}
              >
                {u.trustedLender && <IconShield size={12} />}
                {u.trustedLender ? "Trusted Lender" : "Mark as trusted"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Automation() {
  const issues = useQuery(api.admin.automationIssues);
  const retry = useMutation(api.admin.retryDelivery);
  const { busy, run } = useRun();

  const flows = (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-[1_1_280px] flex-col gap-0.5 rounded-xl border border-line bg-white shadow-sm px-5 py-4">
        <span className="font-semibold">Request notification</span>
        <span className="text-sm text-muted">Webhook · fires on request created or status change · signed payload</span>
      </div>
      <div className="flex flex-[1_1_280px] flex-col gap-0.5 rounded-xl border border-line bg-white shadow-sm px-5 py-4">
        <span className="font-semibold">Overdue reminders</span>
        <span className="text-sm text-muted">Daily at 09:00 · fetches overdue loans, writes reminder status back</span>
      </div>
    </div>
  );

  if (issues === undefined)
    return (
      <div className="flex flex-col gap-3">
        {flows}
        <Loading rows={2} />
      </div>
    );

  const rows = [
    ...issues.retryingDeliveries.map((d) => ({
      id: d._id as string,
      flow: "Request notification",
      what: d.eventType,
      tone: "warn" as const,
      result: "Retrying",
      attempts: String(d.attempts),
      when: d.nextAttemptAt ? `Next ${timeAgo(d.nextAttemptAt)}` : "Queued",
      detail: d.lastError,
      retryId: undefined,
    })),
    ...issues.failedDeliveries.map((d) => ({
      id: d._id as string,
      flow: "Request notification",
      what: d.eventType,
      tone: "danger" as const,
      result: "Failed, never reached n8n",
      attempts: String(d.attempts),
      when: timeAgo(d.at),
      detail: d.lastError,
      retryId: d._id,
    })),
    ...issues.failedEvents.map((e) => ({
      id: e._id as string,
      flow: e.kind === "overdue_reminder" ? "Overdue reminders" : e.kind === "request_notification" ? "Request notification" : "Error workflow",
      what: e.n8nExecutionId ? `n8n execution #${e.n8nExecutionId}` : e.kind,
      tone: "danger" as const,
      result: "Failed, sent to error workflow",
      attempts: "–",
      when: timeAgo(e.at),
      detail: e.detail,
      retryId: undefined,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {flows}
      {rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white shadow-sm px-5 py-6">
          <Pill tone="brand">Healthy</Pill>
          <span className="text-body">All automations healthy. No failed or retrying runs.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-[15px]">
            <thead>
              <tr>
                <th scope="col" className={th}>Workflow</th>
                <th scope="col" className={th}>Event</th>
                <th scope="col" className={th}>Result</th>
                <th scope="col" className={th}>Attempts</th>
                <th scope="col" className={th}>When</th>
                <th scope="col" className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} font-semibold`}>{r.flow}</td>
                  <td className={`${td} text-body`}>
                    <span className="font-mono text-sm">{r.what}</span>
                    {r.detail && <p className="mt-0.5 text-xs text-muted">{r.detail}</p>}
                  </td>
                  <td className={td}>
                    <Pill tone={r.tone} dot={false}>{r.result}</Pill>
                  </td>
                  <td className={`${td} text-body`}>{r.attempts}</td>
                  <td className={`${td} text-sm text-body`}>{r.when}</td>
                  <td className={`${td} text-right`}>
                    {r.retryId && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy === r.retryId}
                        onClick={() => run(r.retryId!, () => retry({ deliveryId: r.retryId! }), "Re-queued.")}
                      >
                        <IconRetry size={16} />
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">
        Webhook deliveries retry with backoff; runs that still fail go to the error workflow and show here as Failed. Nothing fails silently.
      </p>
    </div>
  );
}
