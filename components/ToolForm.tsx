"use client";

import { useState, type FormEvent } from "react";
import { CATEGORIES, CONDITIONS, LIMITS, type Category, type Condition } from "@/convex/lib/validators";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/format";

export type ToolInput = { name: string; category: Category; condition: Condition; description: string };

export function ToolForm({
  initial,
  submitLabel,
  onSubmit,
  fullWidth = false,
}: {
  initial?: ToolInput;
  submitLabel: string;
  onSubmit: (v: ToolInput) => Promise<void>;
  fullWidth?: boolean;
}) {
  const [v, setV] = useState<ToolInput>(
    initial ?? { name: "", category: "power_tools", condition: "good", description: "" },
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(v);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]">
      <div>
        <label className="label" htmlFor="tool-name">Name</label>
        <input
          id="tool-name"
          className="input"
          required
          minLength={2}
          maxLength={LIMITS.nameMax}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          placeholder="e.g. Orbital sander"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="tool-category">Category</label>
          <select
            id="tool-category"
            className="input"
            value={v.category}
            onChange={(e) => setV({ ...v, category: e.target.value as Category })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tool-condition">Condition</label>
          <select
            id="tool-condition"
            className="input"
            value={v.condition}
            onChange={(e) => setV({ ...v, condition: e.target.value as Condition })}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="tool-desc">Short description</label>
        <textarea
          id="tool-desc"
          className="input min-h-24 resize-y"
          rows={4}
          maxLength={LIMITS.descriptionMax}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="What's included, anything to know before borrowing"
        />
        <p className="mt-1 text-right text-[13px] text-muted">
          {v.description.length} / {LIMITS.descriptionMax}
        </p>
      </div>
      <div className="flex justify-end">
        <button className={`btn btn-primary min-h-12 ${fullWidth ? "w-full" : ""}`} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
