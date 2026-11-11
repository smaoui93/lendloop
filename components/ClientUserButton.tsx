"use client";

import { useSyncExternalStore } from "react";
import { UserButton } from "@clerk/nextjs";

const noopSubscribe = () => () => {};

/**
 * Clerk's <UserButton> renders different markup on the server and the client,
 * which triggers a hydration mismatch. Render it only after hydration, with a
 * same-size placeholder so the header doesn't shift.
 */
export function ClientUserButton() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated ? <UserButton /> : <span aria-hidden className="inline-block size-7 rounded-full bg-chip" />;
}
