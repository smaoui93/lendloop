"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LIMITS, type Category } from "@/convex/lib/validators";
import { Avatar, CategoryFilter, Empty, Loading, Modal, PageHeader, Pill, TrustedBadge } from "@/components/ui";
import { IconCheck, IconPlus, IconSearch } from "@/components/icons";
import { useToast } from "@/components/Providers";
import { CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS, errorMessage, formatDate, todayLocalISO } from "@/lib/format";

type RequestTarget = {
  _id: Id<"tools">;
  name: string;
  owner: string;
  upcoming: { startDate: string; endDate: string }[];
};

export default function ToolsPage() {
  const [category, setCategory] = useState<Category | undefined>();
  const [q, setQ] = useState("");
  const tools = useQuery(api.tools.listAll, { category });
  const [target, setTarget] = useState<RequestTarget | null>(null);

  const query = q.trim().toLowerCase();
  const shown = tools?.filter((t) => !query || t.name.toLowerCase().includes(query));
  const free = tools?.filter((t) => !t.isMine && t.availability.status === "available").length ?? 0;

  return (
    <>
      <PageHeader
        title="The board"
        subtitle={tools ? `${free} of ${tools.length} tools are free to borrow on your street.` : "Loading the board…"}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex items-center">
              <span className="sr-only">Search tools</span>
              <IconSearch size={18} className="pointer-events-none absolute left-3.5 text-muted" />
              <input
                type="search"
                placeholder="Search tools"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input w-[260px] pl-10"
              />
            </label>
            <Link href="/listings" className="btn btn-primary">
              <IconPlus size={16} />
              List a tool
            </Link>
          </div>
        }
      />
      <CategoryFilter value={category} onChange={setCategory} />
      {shown === undefined ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>No tools match. Try another category or search.</Empty>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4">
          {shown.map((t) => {
            const onLoan = t.availability.status === "on_loan";
            return (
              <li key={t._id} className="flex flex-col gap-3.5 rounded-xl border border-line bg-white shadow-sm p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="text-2xl">{CATEGORY_ICONS[t.category]}</span>
                    <div className="flex min-w-0 flex-col">
                      <h2 className="leading-snug font-medium text-ink">{t.name}</h2>
                      <span className="text-xs text-muted">{CATEGORY_LABELS[t.category]}</span>
                    </div>
                  </div>
                  {t.isMine ? (
                    <Pill tone="neutral">Your listing</Pill>
                  ) : onLoan ? (
                    <Pill tone="warn">On loan</Pill>
                  ) : (
                    <Pill tone="brand">Available</Pill>
                  )}
                </div>
                {t.description && <p className="text-[15px] text-body">{t.description}</p>}
                <div className="flex flex-wrap gap-2 text-[13px] text-soft">
                  <span className="rounded-lg bg-chip px-[9px] py-[3px]">Condition: {CONDITION_LABELS[t.condition]}</span>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-divider pt-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={t.isMine ? "You" : t.owner.name} />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">{t.isMine ? "You" : t.owner.name}</span>
                      {t.owner.trustedLender && <TrustedBadge />}
                    </div>
                  </div>
                  {t.isMine ? (
                    <Link href="/listings" className="text-right text-[13px] text-muted">Manage in My listings</Link>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() =>
                          setTarget({ _id: t._id, name: t.name, owner: t.owner.name, upcoming: t.availability.upcoming })
                        }
                      >
                        Request to borrow
                      </button>
                      {onLoan && t.availability.dueBack && (
                        <span className="text-xs text-muted">Back {formatDate(t.availability.dueBack)}</span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <RequestDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function RequestDialog({ target, onClose }: { target: RequestTarget | null; onClose: () => void }) {
  const request = useMutation(api.loans.request);
  const toast = useToast();
  const today = todayLocalISO();
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [busy, setBusy] = useState(false);
  const [sentFor, setSentFor] = useState<Id<"tools"> | null>(null);
  const sent = target !== null && sentFor === target._id;

  function close() {
    setSentFor(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      await request({ toolId: target._id, startDate, endDate });
      setSentFor(target._id);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={close}
      eyebrow="Request to borrow"
      title={target?.name ?? ""}
      subtitle={target ? `from ${target.owner}` : undefined}
    >
      {sent ? (
        <div className="flex flex-col items-start gap-4">
          <div className="flex w-full items-center gap-3 rounded-[14px] bg-brand-soft px-4 py-3.5 text-brand-dark">
            <IconCheck size={22} />
            <span className="font-semibold">Request sent. {target?.owner} has been notified.</span>
          </div>
          <Link href="/requests" className="font-semibold" onClick={close}>
            Track it in My requests
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="start">From</label>
              <input
                id="start"
                type="date"
                className="input"
                min={today}
                value={startDate}
                onChange={(e) => {
                  setStart(e.target.value);
                  if (e.target.value > endDate) setEnd(e.target.value);
                }}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="end">Until</label>
              <input
                id="end"
                type="date"
                className="input"
                min={startDate}
                value={endDate}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>
          {target && target.upcoming.length > 0 && (
            <p className="text-sm text-muted">
              Already booked:{" "}
              {target.upcoming.map((r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`).join(", ")}
            </p>
          )}
          <p className="rounded-xl bg-paper px-3.5 py-3 text-sm text-body">
            Up to {LIMITS.maxLoanDays} days. The owner gets a notification as soon as you send this. You&apos;ll hear
            back when they approve or decline.
          </p>
          <div className="flex justify-end gap-2.5">
            <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
