"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatTimeAgo } from "@/lib/utils/format";

type CommunityCommentRow = {
  id: string;
  post_id?: string | null;
  user_id?: string | null;
  content?: string | null;
  status?: string | null;
  like_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  post_title?: string | null;
  topic_slug?: string | null;
};

export function AdminCommunityCommentsPage() {
  const { t: tr } = useI18n();
  const dash = tr("admin_users_empty_placeholder");

  const statusOptions = useMemo(
    () =>
      [
        { value: "active", labelKey: "admin_community_post_status_active" as const },
        { value: "hidden", labelKey: "admin_feed_posts_action_hide" as const },
        { value: "deleted", labelKey: "admin_feed_posts_action_delete" as const },
      ] as const,
    []
  );

  const [rows, setRows] = useState<CommunityCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [postFilter, setPostFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: "100" });
      if (postFilter.trim()) q.set("postId", postFilter.trim());
      if (topicFilter.trim()) q.set("topicSlug", topicFilter.trim().toLowerCase());
      if (userFilter.trim()) q.set("userId", userFilter.trim());
      if (statusFilter && ["active", "hidden", "deleted"].includes(statusFilter)) {
        q.set("status", statusFilter);
      }
      if (createdFrom) q.set("createdFrom", new Date(createdFrom).toISOString());
      if (createdTo) {
        const end = new Date(createdTo);
        end.setHours(23, 59, 59, 999);
        q.set("createdTo", end.toISOString());
      }
      const res = await fetch(`/api/admin/community/engine/comments?${q.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as { ok?: boolean; comments?: CommunityCommentRow[]; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? tr("admin_community_comments_err_load"));
        setRows([]);
        return;
      }
      setRows(j.comments ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tr, postFilter, topicFilter, userFilter, statusFilter, createdFrom, createdTo]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/community/engine/comments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? tr("admin_topics_err_save"));
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 text-sam-fg">
      <AdminPageHeader
        titleKey="admin_community_comments_page_title"
        description={tr("admin_community_comments_page_desc")}
      />

      <p className="sam-text-body-secondary text-sam-muted">
        <code className="rounded bg-sam-surface-muted px-1">community_comments</code>
        {tr("admin_community_comments_authority_note")}
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_community_comments_filter_post")}</span>
          <input
            value={postFilter}
            onChange={(e) => setPostFilter(e.target.value)}
            className="min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_col_topic")}</span>
          <input
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_col_author")}</span>
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_feed_posts_col_status")}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <option value="">{tr("admin_posts_filter_all_status")}</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {tr(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_filter_from")}</span>
          <input
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_filter_to")}</span>
          <input
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
        >
          {tr("admin_feed_posts_refresh")}
        </button>
      </div>

      {err ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center sam-text-body text-sam-muted">{tr("common_loading")}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {tr("admin_community_comments_empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[1100px] text-left sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="p-3 font-medium">{tr("admin_community_comments_col_post")}</th>
                <th className="p-3 font-medium">{tr("admin_posts_col_topic")}</th>
                <th className="p-3 font-medium">{tr("admin_community_comments_col_body")}</th>
                <th className="p-3 font-medium">{tr("admin_posts_col_author")}</th>
                <th className="p-3 font-medium">{tr("admin_posts_col_likes")}</th>
                <th className="p-3 font-medium">{tr("admin_feed_posts_col_status")}</th>
                <th className="p-3 font-medium">{tr("admin_posts_col_registered")}</th>
                <th className="p-3 font-medium">{tr("admin_posts_col_manage")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id ?? "");
                const postId = String(r.post_id ?? "");
                const busy = busyId === id;
                const content = String(r.content ?? "");
                return (
                  <tr key={id} className="border-b border-sam-border-soft align-top">
                    <td className="max-w-[180px] p-3">
                      {postId ? (
                        <Link
                          href={`/philife/${encodeURIComponent(postId)}`}
                          className="font-medium text-signature hover:underline"
                        >
                          {String(r.post_title ?? "").trim() || postId.slice(0, 8)}
                        </Link>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="p-3 text-sam-muted">{String(r.topic_slug ?? dash)}</td>
                    <td className="max-w-[280px] p-3 text-sam-fg" title={content}>
                      <span className="line-clamp-3">{content || dash}</span>
                    </td>
                    <td className="max-w-[120px] truncate p-3 sam-text-xxs text-sam-muted" title={String(r.user_id ?? "")}>
                      {String(r.user_id ?? dash)}
                    </td>
                    <td className="p-3 text-sam-muted">{Number(r.like_count ?? 0)}</td>
                    <td className="p-3">
                      <select
                        value={String(r.status ?? "active")}
                        disabled={busy}
                        onChange={(e) => void patchStatus(id, e.target.value)}
                        className="max-w-[7rem] rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                      >
                        {statusOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {tr(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap p-3 text-sam-muted">
                      {r.created_at ? formatTimeAgo(r.created_at) : dash}
                      {r.updated_at ? (
                        <div className="sam-text-xxs text-sam-meta">
                          {tr("admin_community_comments_updated")}: {formatTimeAgo(r.updated_at)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(id, "hidden")}
                          className="sam-text-helper text-amber-700 hover:underline"
                        >
                          {tr("admin_feed_posts_action_hide")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(id, "active")}
                          className="sam-text-helper text-emerald-700 hover:underline"
                        >
                          {tr("admin_feed_posts_action_restore")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void patchStatus(id, "deleted")}
                          className="sam-text-helper text-red-700 hover:underline"
                        >
                          {tr("admin_feed_posts_action_delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
