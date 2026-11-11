"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { Category, LoanStatus } from "@/convex/lib/validators";
import { CATEGORIES } from "@/convex/lib/validators";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/format";
import { IconClose } from "./icons";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-white p-10 text-sm text-center text-muted">{children}</div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl border border-line bg-chip" />
      ))}
    </div>
  );
}

// --- Status pills ---------------------------------------------------------

export type Tone = "brand" | "info" | "warn" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  brand: "bg-brand-soft text-brand-dark",
  info: "bg-info-bg text-info",
  warn: "bg-warn-bg text-warn",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-chip text-soft",
};

export function Pill({ tone, children, dot = false }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge ${TONES[tone]}`}>
      {dot && <span className="h-[7px] w-[7px] rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<LoanStatus, Tone> = {
  pending: "warn",
  approved: "brand",
  declined: "neutral",
  cancelled: "neutral",
  returned: "info",
};

export function StatusBadge({ status, overdue, dot }: { status: LoanStatus; overdue?: boolean; dot?: boolean }) {
  if (overdue) return <Pill tone="danger" dot={dot}>Overdue</Pill>;
  return <Pill tone={STATUS_TONES[status]} dot={dot}>{STATUS_LABELS[status]}</Pill>;
}

export function TrustedBadge() {
  return (
    <span className="badge bg-warn-bg text-warn" title="Trusted Lender">
      ★ Trusted
    </span>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-dark"
    >
      {initials(name)}
    </span>
  );
}

// --- Filters & tabs -------------------------------------------------------

export function CategoryFilter({
  value,
  onChange,
}: {
  value: Category | undefined;
  onChange: (c: Category | undefined) => void;
}) {
  const chip = (active: boolean) =>
    `cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? "border-brand bg-brand text-white" : "border-line-strong bg-white text-soft hover:border-muted"
    }`;
  return (
    <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
      <button type="button" aria-pressed={value === undefined} className={chip(value === undefined)} onClick={() => onChange(undefined)}>
        All
      </button>
      {CATEGORIES.map((c) => (
        <button type="button" key={c} aria-pressed={value === c} className={chip(value === c)} onClick={() => onChange(c)}>
          {CATEGORY_LABELS[c]}
        </button>
      ))}
    </div>
  );
}

type SegItem = { key: string; label: string; count?: number; href?: string };

/** Pill-style segmented control. Items with `href` render as links (route tabs). */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: SegItem[];
  value: string;
  onChange?: (key: string) => void;
  label: string;
}) {
  const cls = (on: boolean) =>
    `inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border-0 px-3.5 text-sm font-medium text-ink no-underline hover:text-ink ${
      on ? "bg-white shadow-sm" : "bg-transparent"
    }`;
  const count = (on: boolean, n?: number) =>
    n === undefined ? null : (
      <span
        className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs ${
          on ? "bg-brand text-white" : "bg-segment-off text-ink"
        }`}
      >
        {n}
      </span>
    );
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 self-start rounded-lg bg-segment p-1">
      {items.map((it) => {
        const on = it.key === value;
        return it.href ? (
          <Link key={it.key} href={it.href} role="tab" aria-selected={on} className={cls(on)}>
            {it.label}
            {count(on, it.count)}
          </Link>
        ) : (
          <button key={it.key} type="button" role="tab" aria-selected={on} className={cls(on)} onClick={() => onChange?.(it.key)}>
            {it.label}
            {count(on, it.count)}
          </button>
        );
      })}
    </div>
  );
}

// --- Modal ----------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id="modal-title" className="text-lg font-semibold">
              {title}
            </h2>
            {subtitle && <span className="text-sm text-muted">{subtitle}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-secondary btn-icon border-line">
            <IconClose size={18} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
