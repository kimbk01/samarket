"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Row = Record<string, unknown>;

export function AdminCommunityEnginePostsClient() {
  const { t: tr } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr("");
    try {
      const res = await fetch("/api/admin/community/engine/posts?limit=50", { cache: "no-store" });
      const j = (await res.json()) as { ok?: boolean; posts?: Row[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? tr("admin_feed_posts_err_load"));
        setRows([]);
        return;
      }
      setRows(j.posts ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [tr]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (id: string, status: string) => {
    setBusyId(id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/community/engine/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setErr(j.error ?? tr("admin_feed_posts_err_patch"));
      else await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void load()}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
      >
        {tr("admin_feed_posts_refresh")}
      </button>
      {err ? <p className="sam-text-body-secondary text-red-600">{err}</p> : null}
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="min-w-full text-left sam-text-helper text-sam-fg">
          <thead className="bg-sam-app sam-text-xxs uppercase text-sam-muted">
            <tr>
              <th className="px-2 py-2">{tr("admin_feed_posts_col_title")}</th>
              <th className="px-2 py-2">{tr("admin_feed_posts_col_category")}</th>
              <th className="px-2 py-2">{tr("admin_feed_posts_col_status")}</th>
              <th className="px-2 py-2">{tr("admin_feed_posts_col_reported")}</th>
              <th className="px-2 py-2">{tr("admin_feed_posts_col_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = String(r.id ?? "");
              const title = String(r.title ?? "");
              const isSample = r.is_sample_data === true;
              return (
                <tr key={id} className="border-t border-sam-border-soft">
                  <td className="max-w-[200px] truncate px-2 py-2">
                    {title}
                    {isSample ? (
                      <span className="ml-1 rounded bg-signature/10 px-1 py-0.5 sam-text-xxs text-sam-fg">
                        {tr("admin_feed_posts_sample_badge")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">{String(r.category ?? "")}</td>
                  <td className="px-2 py-2">{String(r.status ?? "")}</td>
                  <td className="px-2 py-2">{r.is_reported === true ? "Y" : ""}</td>
                  <td className="flex flex-wrap gap-1 px-2 py-2">
                    <button
                      type="button"
                      disabled={busyId === id}
                      className="rounded bg-amber-100 px-2 py-0.5"
                      onClick={() => void patch(id, "hidden")}
                    >
                      {tr("admin_feed_posts_action_hide")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === id}
                      className="rounded bg-red-100 px-2 py-0.5"
                      onClick={() => void patch(id, "deleted")}
                    >
                      {tr("admin_feed_posts_action_delete")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === id}
                      className="rounded bg-emerald-100 px-2 py-0.5"
                      onClick={() => void patch(id, "active")}
                    >
                      {tr("admin_feed_posts_action_restore")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
