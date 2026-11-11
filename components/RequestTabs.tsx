"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Segmented } from "./ui";

/** Route-backed tabs shared by /incoming and /requests. */
export function RequestTabs({ current }: { current: "incoming" | "mine" }) {
  const incoming = useQuery(api.loans.listIncoming);
  const mine = useQuery(api.loans.listMine);
  return (
    <div className="mb-6 flex flex-col gap-6">
      <h1 className="page-title">Requests</h1>
      <Segmented
        label="Request views"
        value={current}
        items={[
          {
            key: "incoming",
            label: "Incoming requests",
            href: "/incoming",
            count: incoming?.filter((l) => l.status === "pending").length,
          },
          { key: "mine", label: "My requests", href: "/requests", count: mine?.length },
        ]}
      />
      <p className="text-muted">
        {current === "incoming"
          ? "Requests for tools you listed. Only you can approve, decline or mark them returned."
          : "Tools you asked to borrow. The lender marks a loan returned when you hand it back."}
      </p>
    </div>
  );
}
