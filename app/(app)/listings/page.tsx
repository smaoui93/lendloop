"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Empty, Loading, Modal, Pill } from "@/components/ui";
import { ToolForm, type ToolInput } from "@/components/ToolForm";
import { IconEdit, IconTrash } from "@/components/icons";
import { useToast } from "@/components/Providers";
import { CATEGORY_ICONS, CATEGORY_LABELS, CONDITION_LABELS, errorMessage, formatDate } from "@/lib/format";

export default function ListingsPage() {
  const tools = useQuery(api.tools.listMine);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: Id<"tools">; initial: ToolInput } | null>(null);
  const [formKey, setFormKey] = useState(0);

  async function add(v: ToolInput) {
    try {
      await create(v);
      toast("Tool listed!");
      setFormKey((k) => k + 1); // reset the form
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function save(v: ToolInput) {
    if (!editing) return;
    try {
      await update({ toolId: editing.id, ...v });
      toast("Listing updated.");
      setEditing(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function del(id: Id<"tools">, name: string) {
    if (!confirm(`Delete "${name}"? Pending requests will be declined.`)) return;
    try {
      await remove({ toolId: id });
      toast("Listing deleted.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-8">
      <section aria-labelledby="ml-title" className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 id="ml-title" className="page-title">My listings</h1>
          <p className="text-muted">You can edit or remove only the tools you listed.</p>
        </div>

        {tools === undefined ? (
          <Loading />
        ) : tools.length === 0 ? (
          <Empty>You haven&apos;t listed anything yet. Use the form to add your first tool.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {tools.map((t) => {
              const onLoan = t.availability.status === "on_loan";
              return (
                <li key={t._id} className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-white shadow-sm px-5 py-[18px]">
                  <span aria-hidden className="text-2xl">{CATEGORY_ICONS[t.category]}</span>
                  <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="font-medium">{t.name}</h2>
                      {onLoan ? <Pill tone="warn">On loan</Pill> : <Pill tone="brand">Available</Pill>}
                    </div>
                    <span className="text-sm text-muted">
                      {CATEGORY_LABELS[t.category]} · {CONDITION_LABELS[t.condition]}
                      {onLoan && t.availability.dueBack && <> · Out until {formatDate(t.availability.dueBack)}</>}
                      {!onLoan && t.availability.upcoming.length > 0 && (
                        <> · {t.availability.upcoming.length} upcoming booking{t.availability.upcoming.length === 1 ? "" : "s"}</>
                      )}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        setEditing({
                          id: t._id,
                          initial: { name: t.name, category: t.category, condition: t.condition, description: t.description },
                        })
                      }
                    >
                      <IconEdit size={16} />
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      className="btn btn-danger btn-icon"
                      onClick={() => del(t._id, t.name)}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-sm text-muted">A tool that&apos;s out on loan can&apos;t be deleted until it&apos;s marked returned.</p>
      </section>

      <aside
        aria-labelledby="new-title"
        className="box-border flex min-w-0 flex-[1_1_360px] flex-col gap-[18px] rounded-xl border border-line bg-white shadow-sm p-7"
      >
        <div className="flex flex-col gap-1">
          <h2 id="new-title" className="text-[26px] font-semibold tracking-tight">List a tool</h2>
          <p className="text-sm text-muted">
            Neighbors see the name and category before signing in. Everything else is for members.
          </p>
        </div>
        <ToolForm key={formKey} submitLabel="Publish listing" onSubmit={add} fullWidth />
      </aside>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit listing">
        {editing && <ToolForm key={editing.id} initial={editing.initial} submitLabel="Save changes" onSubmit={save} />}
      </Modal>
    </div>
  );
}
