"use client";

import { useState } from "react";
import { useToast } from "./Providers";
import { errorMessage } from "@/lib/format";

/** Wraps a mutation call with busy-state + toasts. */
export function useRun() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast(success);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}
