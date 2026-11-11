"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Empty, Loading, TrustedBadge } from "@/components/ui";
import { LoanCard } from "@/components/LoanCard";
import { RequestTabs } from "@/components/RequestTabs";
import { useRun } from "@/components/useAction";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.listMine);
  const cancel = useMutation(api.loans.cancel);
  const { busy, run } = useRun();

  return (
    <>
      <RequestTabs current="mine" />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>No requests yet. Browse the board to borrow something.</Empty>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {loans.map((l) => (
            <LoanCard
              key={l._id}
              loan={l}
              who={
                <span className="inline-flex flex-wrap items-center gap-2">
                  From {l.lender?.name}
                  {l.lender?.trustedLender && <TrustedBadge />}
                </span>
              }
              note={l.overdue ? `Hand it back to ${l.lender?.name}. They mark it returned.` : undefined}
              actions={
                l.status === "pending" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy === l._id}
                    onClick={() => run(l._id, () => cancel({ loanId: l._id }), "Request cancelled.")}
                  >
                    Cancel request
                  </button>
                )
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
