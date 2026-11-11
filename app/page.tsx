"use client";

import Link from "next/link";
import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/Logo";
import { IconCheck, IconClock, IconSignIn } from "@/components/icons";
import { CATEGORY_ICONS, CATEGORY_LABELS } from "@/lib/format";

const STEPS = [
  { n: "01", title: "List a tool", body: "Add a name, category, its condition and a line about it. You decide who borrows it." },
  { n: "02", title: "Request dates", body: "Pick a date range. The owner is notified right away and approves or declines in one tap." },
  {
    n: "03",
    title: "Return on time",
    body: "Overdue? A friendly reminder goes out automatically. The lender marks it returned and it’s back on the board.",
  },
];

/** Primary call to action: sign in, or jump into the app when already signed in. */
function PrimaryCta({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <span className={`${className} opacity-60`}>Loading…</span>
      </AuthLoading>
      <Unauthenticated>
        <SignInButton mode="modal" forceRedirectUrl="/tools">
          <button type="button" className={className}>{children}</button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/tools" className={className}>Go to the board</Link>
      </Authenticated>
    </>
  );
}

export default function LandingPage() {
  const tools = useQuery(api.tools.listPublic);
  const pillBtn =
    "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-0 px-5 text-base font-medium no-underline";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-6 py-[18px]">
          <Logo large />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-6">
            <a href="#how" className="text-[15px] font-medium text-soft no-underline hover:text-ink">How it works</a>
            <a href="#tools" className="text-[15px] font-medium text-soft no-underline hover:text-ink">Available tools</a>
            <Unauthenticated>
              <SignInButton mode="modal" forceRedirectUrl="/tools">
                <button
                  type="button"
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-full border-0 bg-ink px-[18px] text-[15px] font-semibold text-white"
                >
                  Sign in
                </button>
              </SignInButton>
            </Unauthenticated>
            <Authenticated>
              <UserButton />
            </Authenticated>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section id="top" className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-6 pt-16 pb-16 sm:pt-[88px] sm:pb-[72px]">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
            <span className="self-start rounded-full bg-brand-soft px-3 py-1.5 text-[13px] font-semibold text-brand-dark">
              For neighbors, by neighbors
            </span>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
              Borrow what you need.
              <br />
              <span className="text-brand">Lend what you don&apos;t.</span>
            </h1>
            <p className="max-w-[520px] text-lg text-body">
              The drill in your garage gets used thirteen minutes a year. List it on your street&apos;s board, borrow a
              ladder for the weekend, and let LendLoop handle the reminders.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <PrimaryCta className={`${pillBtn} bg-brand text-white hover:bg-brand-dark hover:text-white`}>
                <IconSignIn size={18} />
                Sign in to lend or borrow
              </PrimaryCta>
              <a href="#tools" className={`${pillBtn} border border-line-strong text-ink hover:bg-white hover:text-ink`}>
                See what&apos;s available
              </a>
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3" aria-hidden="true">
            <div className="flex items-center gap-4 rounded-xl border border-line bg-white shadow-sm p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-soft text-brand">
                <span aria-hidden className="text-2xl">🔌</span>
              </div>
              <div className="flex-1">
                <div className="font-semibold">Cordless drill, 18V</div>
                <div className="text-sm text-muted">Request sent · Sat 14 – Sun 15</div>
              </div>
              <span className="rounded-full bg-info-bg px-2.5 py-1 text-[13px] font-semibold text-info">Pending</span>
            </div>
            <div className="ml-8 flex items-center gap-4 rounded-xl border border-line bg-white shadow-sm p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand-soft text-brand">
                <IconCheck size={24} strokeWidth={2} />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Approved by your neighbor</div>
                <div className="text-sm text-muted">You&apos;ll get a reminder before it&apos;s due</div>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-ink p-5 text-paper">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-ink-soft text-mint">
                <IconClock size={24} />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Return reminder sent</div>
                <div className="text-sm text-on-dark">Automated · 9:00 every morning</div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-y border-line bg-white">
          <div className="mx-auto flex max-w-[1160px] flex-col gap-10 px-6 py-[72px]">
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
              {STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <span className="text-xl font-bold text-brand">{s.n}</span>
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="text-body">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tools" className="mx-auto flex max-w-[1160px] flex-col gap-7 px-6 pt-[72px] pb-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Available in the neighborhood</h2>
              <p className="text-muted">A read-only preview. Owners and details are shown once you sign in.</p>
            </div>
            {tools && <span className="text-sm font-medium text-muted">{tools.length} tools available</span>}
          </div>

          {tools === undefined ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3" aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <li key={i} className="h-[62px] animate-pulse rounded-xl border border-line bg-white shadow-sm" />
              ))}
            </ul>
          ) : tools.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-muted">
              No tools listed yet. Be the first!
            </p>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {tools.map((t) => (
                <li key={t._id} className="flex items-center gap-3 rounded-xl border border-line bg-white shadow-sm p-4">
                  <span aria-hidden className="text-2xl">{CATEGORY_ICONS[t.category]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{t.name}</p>
                    <p className="text-xs text-muted">{CATEGORY_LABELS[t.category]}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-xl bg-ink p-8 text-paper">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[28px] font-semibold tracking-tight">Got a shed full of tools?</h3>
              <p className="text-on-dark">Sign in to list them for your neighbors, or to request one.</p>
            </div>
            <PrimaryCta className={`${pillBtn} bg-mint text-mint-ink hover:bg-white hover:text-mint-ink`}>
              Sign in to lend or borrow
            </PrimaryCta>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-3 px-6 py-7 text-sm text-muted">
          <span>© LendLoop</span>
          <span>Borrow what you need. Lend what you don&apos;t.</span>
        </div>
      </footer>
    </div>
  );
}
