"use client";

import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { formatTimeAgo } from "@/lib/utils/format";
import {
  AdminManagementBulkBar,
  AdminManagementSelectionCheckbox,
  AdminManagementSurfaceRoot,
  AdminManagementTableViewport,
  useAdminManagementSelection,
} from "@/components/admin/management";
import {
  COMMUNITY_COMMENT_ENTITY_ACTION_POLICY,
  computeTableMinWidthPx,
  managementColumnStyle,
  terminologyDisplay,
  type ManagementColumnKind,
} from "@/lib/admin/management";

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
  author_label?: string | null;
};

const COLUMN_KINDS: ManagementColumnKind[] = [
  "SELECTION",
  "TITLE",
  "METADATA",
  "TITLE",
  "IDENTITY",
  "NUMERIC",
  "STATUS",
  "DATE",
  "ACTIONS",
];

export function AdminCommunityCommentsPage() {
  const { t: tr, language } = useI18n();
  const dash = tr("admin_users_empty_placeholder");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const policy = COMMUNITY_COMMENT_ENTITY_ACTION_POLICY;
  const tableMinWidth = computeTableMinWidthPx(COLUMN_KINDS);

  const statusOptions = useMemo(
    () =>
      [
        { value: "active", label: tr("admin_community_post_status_active") },
        { value: "hidden", label: terminologyDisplay("HIDE", language) },
        { value: "deleted", label: terminologyDisplay("SOFT_DELETE", language) },
      ] as const,
    [language, tr]
  );

  const [rows, setRows] = useState<CommunityCommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [postFilter, setPostFilter] = useState(() => searchParams.get("postId") ?? "");
  const [topicFilter, setTopicFilter] = useState(() => searchParams.get("topicSlug") ?? "");
  const [userFilter, setUserFilter] = useState(() => searchParams.get("userId") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("status") ?? "");
  const [period, setPeriod] = useState(() => searchParams.get("period") ?? "");
  const [topicFilterTruncated, setTopicFilterTruncated] = useState(false);
  const skipUrlWriteRef = useRef(true);

  const queryScopeKey = useMemo(
    () => [postFilter, topicFilter, userFilter, statusFilter, period].join("|"),
    [postFilter, topicFilter, userFilter, statusFilter, period]
  );
  const selectableIds = useMemo(
    () => rows.map((r) => String(r.id ?? "")).filter(Boolean),
    [rows]
  );
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false;
      return;
    }
    const q = new URLSearchParams();
    if (postFilter.trim()) q.set("postId", postFilter.trim());
    if (topicFilter.trim()) q.set("topicSlug", topicFilter.trim().toLowerCase());
    if (userFilter.trim()) q.set("userId", userFilter.trim());
    if (statusFilter && ["active", "hidden", "deleted"].includes(statusFilter)) {
      q.set("status", statusFilter);
    }
    if (period.trim()) q.set("period", period.trim());
    const next = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(next);
  }, [pathname, router, postFilter, topicFilter, userFilter, statusFilter, period]);

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
      if (period.trim()) q.set("period", period.trim());
      const res = await fetch(`/api/admin/community/engine/comments?${q.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        comments?: CommunityCommentRow[];
        error?: string;
        topicFilterTruncated?: boolean;
      };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? tr("admin_community_comments_err_load"));
        setRows([]);
        setTopicFilterTruncated(false);
        return;
      }
      setRows(j.comments ?? []);
      setTopicFilterTruncated(j.topicFilterTruncated === true);
    } catch (e) {
      setErr((e as Error).message);
      setRows([]);
      setTopicFilterTruncated(false);
    } finally {
      setLoading(false);
    }
  }, [tr, postFilter, topicFilter, userFilter, statusFilter, period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchStatus(id: string, status: string): Promise<boolean> {
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
        await dibayAlert({ title: j.error ?? tr("admin_topics_err_save") });
        return false;
      }
      return true;
    } finally {
      setBusyId(null);
    }
  }

  const hideLabel = terminologyDisplay("HIDE", language);
  const restoreLabel = terminologyDisplay("RESTORE", language);
  const softDeleteLabel = terminologyDisplay("SOFT_DELETE", language);
  const selectAllLabel =
    language === "en" ? "Select all on current page" : "현재 페이지 전체 선택";
  const selectedLabel =
    language === "en"
      ? `${selection.selectedCount} selected`
      : `${selection.selectedCount}개 선택됨`;

  const runSoftBulk = async (status: "hidden" | "active" | "deleted") => {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    if (status === "deleted") {
      const ok = await dibayConfirm({
        title: softDeleteLabel,
        description:
          language === "en"
            ? `Sets status=deleted for ${ids.length} comment(s). DB rows remain. This is not a permanent DB delete.`
            : `${ids.length}건 댓글을 status=deleted 로 표시합니다. DB row는 남습니다. DB 영구 삭제가 아닙니다.`,
        confirmLabel: softDeleteLabel,
        cancelLabel: language === "en" ? "Cancel" : "취소",
        confirmTone: "destructive",
      });
      if (!ok) return;
    } else if (status === "hidden") {
      const ok = await dibayConfirm({
        title: hideLabel,
        description:
          language === "en"
            ? `Hide ${ids.length} comment(s) from public surfaces?`
            : `${ids.length}건 댓글을 숨김 처리할까요?`,
        confirmLabel: hideLabel,
        cancelLabel: language === "en" ? "Cancel" : "취소",
        confirmTone: "destructive",
      });
      if (!ok) return;
    }
    setBulkBusy(true);
    const failed: string[] = [];
    try {
      for (const id of ids) {
        const ok = await patchStatus(id, status);
        if (!ok) failed.push(id);
      }
      selection.clear();
      if (failed.length > 0) {
        setErr(
          language === "en"
            ? `${failed.length} failed · others applied`
            : `${failed.length}건 실패 · 나머지는 반영됨`
        );
      }
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-comments" className="space-y-4 text-sam-fg">
      <AdminPageHeader
        titleKey="admin_community_comments_page_title"
        description={tr("admin_community_comments_page_desc")}
      />

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
            onChange={(e) => {
              setStatusFilter(e.target.value);
              if (e.target.value) setPeriod("");
            }}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <option value="">{tr("admin_posts_filter_all_status")}</option>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
        >
          {tr("admin_feed_posts_refresh")}
        </button>
      </div>

      {topicFilterTruncated ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
          {tr("admin_community_topic_filter_truncated")}
        </div>
      ) : null}

      {err ? (
        <div
          className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800"
          data-admin-mgmt-state="ERROR"
        >
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center sam-text-body text-sam-muted" data-admin-mgmt-state="LOADING">
          {tr("common_loading")}
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"
          data-admin-mgmt-state="EMPTY"
        >
          {tr("admin_community_comments_empty")}
        </div>
      ) : (
        <AdminManagementTableViewport className="min-w-0">
          <AdminManagementBulkBar
            selectedCount={selection.selectedCount}
            policy={policy}
            selectedLabel={selectedLabel}
            actions={[
              {
                id: "restore",
                label: restoreLabel,
                onClick: () => {
                  if (bulkBusy) return;
                  void runSoftBulk("active");
                },
              },
              {
                id: "hide",
                label: hideLabel,
                onClick: () => {
                  if (bulkBusy) return;
                  void runSoftBulk("hidden");
                },
              },
              {
                id: "soft_delete",
                label: softDeleteLabel,
                onClick: () => {
                  if (bulkBusy) return;
                  void runSoftBulk("deleted");
                },
              },
            ]}
          />
          <table
            className="w-full table-fixed text-left sam-text-body"
            style={{ minWidth: tableMinWidth }}
            data-admin-mgmt-table-min-width={String(tableMinWidth)}
          >
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="p-3" style={managementColumnStyle("SELECTION")}>
                  <AdminManagementSelectionCheckbox
                    role="header"
                    state={selection.headerState}
                    onToggle={selection.toggleAll}
                    aria-label={selectAllLabel}
                  />
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("TITLE")}>
                  {tr("admin_community_comments_col_post")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("METADATA")}>
                  {tr("admin_posts_col_topic")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("TITLE")}>
                  {tr("admin_community_comments_col_body")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("IDENTITY")}>
                  {tr("admin_posts_col_author")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("NUMERIC")}>
                  {tr("admin_posts_col_likes")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("STATUS")}>
                  {tr("admin_feed_posts_col_status")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("DATE")}>
                  {tr("admin_posts_col_registered")}
                </th>
                <th className="p-3 font-medium" style={managementColumnStyle("ACTIONS")}>
                  {tr("admin_posts_col_manage")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = String(r.id ?? "");
                const postId = String(r.post_id ?? "");
                const uid = String(r.user_id ?? "").trim();
                const authorLabel = String(r.author_label ?? "").trim() || dash;
                const topic = String(r.topic_slug ?? "").trim();
                const busy = busyId === id;
                const content = String(r.content ?? "");
                const status = String(r.status ?? "active");
                return (
                  <tr key={id} className="border-b border-sam-border-soft align-top">
                    <td className="p-3" style={managementColumnStyle("SELECTION")}>
                      <AdminManagementSelectionCheckbox
                        role="row"
                        checked={selection.isSelected(id)}
                        onToggle={() => selection.toggleRow(id)}
                        disabled={bulkBusy}
                        aria-label={selectAllLabel}
                      />
                    </td>
                    <td className="p-3" style={managementColumnStyle("TITLE")}>
                      {postId ? (
                        <Link
                          href={`/admin/community/posts/${encodeURIComponent(postId)}`}
                          className="block truncate font-medium text-signature hover:underline"
                          title={String(r.post_title ?? "")}
                        >
                          {String(r.post_title ?? "").trim() || tr("admin_posts_no_title")}
                        </Link>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="p-3 text-sam-muted" style={managementColumnStyle("METADATA")}>
                      {topic ? (
                        <button
                          type="button"
                          className="text-signature hover:underline"
                          onClick={() => setTopicFilter(topic)}
                        >
                          {topic}
                        </button>
                      ) : (
                        dash
                      )}
                    </td>
                    <td className="p-3 text-sam-fg" style={managementColumnStyle("TITLE")} title={content}>
                      <span className="line-clamp-3">{content || dash}</span>
                    </td>
                    <td
                      className="truncate p-3 text-sam-muted"
                      style={managementColumnStyle("IDENTITY")}
                      title={authorLabel}
                    >
                      {uid ? (
                        <Link
                          href={`/admin/users/${encodeURIComponent(uid)}`}
                          className="text-signature hover:underline"
                        >
                          {authorLabel}
                        </Link>
                      ) : (
                        authorLabel
                      )}
                    </td>
                    <td className="p-3 text-sam-muted" style={managementColumnStyle("NUMERIC")}>
                      {Number(r.like_count ?? 0)}
                    </td>
                    <td className="p-3" style={managementColumnStyle("STATUS")}>
                      <select
                        value={String(r.status ?? "active")}
                        disabled={busy || bulkBusy}
                        onChange={(e) =>
                          void patchStatus(id, e.target.value).then((ok) => {
                            if (ok) void load();
                          })
                        }
                        className="max-w-[7rem] rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                      >
                        {statusOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap p-3 text-sam-muted" style={managementColumnStyle("DATE")}>
                      {r.created_at ? formatTimeAgo(r.created_at) : dash}
                      {r.updated_at ? (
                        <div className="sam-text-xxs text-sam-meta">
                          {tr("admin_community_comments_updated")}: {formatTimeAgo(r.updated_at)}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3" style={managementColumnStyle("ACTIONS")}>
                      <div className="flex flex-wrap gap-1">
                        {status !== "hidden" && status !== "deleted" ? (
                          <button
                            type="button"
                            disabled={busy || bulkBusy}
                            onClick={() =>
                              void (async () => {
                                const ok = await dibayConfirm({
                                  title: hideLabel,
                                  description:
                                    language === "en"
                                      ? "Hide this comment from public surfaces?"
                                      : "이 댓글을 숨김 처리할까요?",
                                  confirmLabel: hideLabel,
                                  cancelLabel: language === "en" ? "Cancel" : "취소",
                                  confirmTone: "destructive",
                                });
                                if (!ok) return;
                                const patched = await patchStatus(id, "hidden");
                                if (patched) void load();
                              })()
                            }
                            className="sam-text-helper text-amber-700 hover:underline"
                          >
                            {hideLabel}
                          </button>
                        ) : null}
                        {status !== "active" ? (
                          <button
                            type="button"
                            disabled={busy || bulkBusy}
                            onClick={() =>
                              void patchStatus(id, "active").then((ok) => {
                                if (ok) void load();
                              })
                            }
                            className="sam-text-helper text-emerald-700 hover:underline"
                          >
                            {restoreLabel}
                          </button>
                        ) : null}
                        {status !== "deleted" ? (
                          <button
                            type="button"
                            disabled={busy || bulkBusy}
                            onClick={() =>
                              void (async () => {
                                const ok = await dibayConfirm({
                                  title: softDeleteLabel,
                                  description:
                                    language === "en"
                                      ? "Sets status=deleted. The DB row remains. This is not a permanent DB delete."
                                      : "status=deleted 로 표시됩니다. DB row는 남습니다. DB 영구 삭제가 아닙니다.",
                                  confirmLabel: softDeleteLabel,
                                  cancelLabel: language === "en" ? "Cancel" : "취소",
                                  confirmTone: "destructive",
                                });
                                if (!ok) return;
                                const patched = await patchStatus(id, "deleted");
                                if (patched) void load();
                              })()
                            }
                            className="sam-text-helper text-red-700 hover:underline"
                            data-admin-mgmt-row-soft-delete="1"
                          >
                            {softDeleteLabel}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminManagementTableViewport>
      )}
    </AdminManagementSurfaceRoot>
  );
}
