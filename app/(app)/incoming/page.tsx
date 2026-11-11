"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Empty, Loading } from "@/components/ui";
import { LoanCard } from "@/components/LoanCard";
import { RequestTabs } from "@/components/RequestTabs";
import { IconCheck } from "@/components/icons";
import { useRun } from "@/components/useAction";

export default function IncomingPage() {
  const loans = useQuery(api.loans.listIncoming);
  const approve = useMutation(api.loans.approve);
  const decline = useMutation(api.loans.decline);
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, run } = useRun();

  return (
    <>
      <RequestTabs current="incoming" />
      {loans === undefined ? (
        <Loading />
      ) : loans.length === 0 ? (
        <Empty>No requests for your tools yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {loans.map((l) => (
            <LoanCard
              key={l._id}
              loan={l}
              who={l.status === "pending" ? `${l.borrower?.name} wants to borrow` : `Lent to ${l.borrower?.name}`}
              actions={
                <>
                  {l.status === "pending" && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy === l._id}
                        onClick={() => run(l._id, () => decline({ loanId: l._id }), "Declined.")}
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy === l._id}
                        onClick={() => run(l._id, () => approve({ loanId: l._id }), "Approved.")}
                      >
                        Approve
                      </button>
                    </>
                  )}
                  {l.status === "approved" && (
                    <button
                      type="button"
                      className="btn btn-dark"
                      disabled={busy === l._id}
                      onClick={() => run(l._id, () => markReturned({ loanId: l._id }), "Marked as returned.")}
                    >
                      <IconCheck size={16} />
                      Mark returned
                    </button>
                  )}
                </>
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}
