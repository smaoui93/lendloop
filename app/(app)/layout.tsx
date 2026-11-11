"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Logo } from "@/components/Logo";
import { useStoreUser } from "@/components/Providers";
import { Loading, TrustedBadge } from "@/components/ui";

type NavItem = { href: string; label: string; match: string[]; badge?: number };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoading, ready } = useStoreUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");
  const incoming = useQuery(api.loans.listIncoming, ready ? {} : "skip");
  const pathname = usePathname();
  const pendingIncoming = incoming?.filter((l) => l.status === "pending").length ?? 0;
  const isAdmin = me?.role === "admin";

  const items: NavItem[] = [
    { href: "/tools", label: "Browse", match: ["/tools"] },
    { href: "/listings", label: "My listings", match: ["/listings"] },
    { href: "/incoming", label: "Requests", match: ["/incoming", "/requests"], badge: pendingIncoming },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", match: ["/admin"] }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <Logo href="/tools" />
          <nav aria-label="App" className="flex flex-wrap items-center gap-1">
            {items.map((item) => {
              const active = item.match.some((m) => pathname.startsWith(m));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm no-underline ${
                    active ? "bg-chip font-medium text-ink hover:text-ink" : "text-body hover:text-ink"
                  }`}
                >
                  {item.label}
                  {!active && item.badge ? (
                    <span
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white"
                      aria-label={`${item.badge} pending`}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2.5">
            {me?.trustedLender && <span className="hidden sm:inline-flex"><TrustedBadge /></span>}
            {isAdmin && (
              <span className="rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold tracking-[0.04em] text-white uppercase">
                Admin
              </span>
            )}
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-8">
        {isLoading || !ready ? <Loading /> : children}
      </main>
    </div>
  );
}
