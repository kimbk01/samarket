"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type CommunityPostRow = {
  id: string;
  user_id?: string | null;
  location_id?: string | null;
  category?: string | null;
  topic_slug?: string | null;
  topicSlug?: string | null;
  title?: string | null;
  status?: string | null;
  is_reported?: boolean | null;
  report_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  region_label?: string | null;
  is_sample_data?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  author_label?: string | null;
  author_nickname?: string | null;
  author_username?: string | null;
};

function isoToDateInput(iso: string): string {
  const d = iso.trim();
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdminPostsPageContent() {
  const { t: tr } = useI18n();
  const dash = tr("admin_users_empty_placeholder");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const communityStatusOptions = useMemo(
    () =>
      [
        { value: "active", labelKey: "admin_community_post_status_active" as const },
        { value: "hidden", labelKey: "admin_feed_posts_action_hide" as const },
        { value: "deleted", labelKey: "admin_feed_posts_action_delete" as const },
      ] as const,
    []
  );

  const [communityRows, setCommunityRows] = useState<CommunityPostRow[]>([]);
  const [communityTopicFilter, setCommunityTopicFilter] = useState(
    () => searchParams.get("topicSlug") ?? ""
  );
  const [communityUserFilter, setCommunityUserFilter] = useState(() => searchParams.get("userId") ?? "");
  const [communityPostIdFilter, setCommunityPostIdFilter] = useState(
    () => searchParams.get("postId") ?? ""
  );
  const [communityStatusFilter, setCommunityStatusFilter] = useState(
    () => searchParams.get("status") ?? ""
  );
  const [communityPeriod, setCommunityPeriod] = useState(() => searchParams.get("period") ?? "");
  const [communityReportedOnly, setCommunityReportedOnly] = useState(
    () => searchParams.get("reportedOnly") === "1"
  );
  const [communityCreatedFrom, setCommunityCreatedFrom] = useState(() =>
    isoToDateInput(searchParams.get("createdFrom") ?? "")
  );
  const [communityCreatedTo, setCommunityCreatedTo] = useState(() =>
    isoToDateInput(searchParams.get("createdTo") ?? "")
  );
  const [topicNameBySlug, setTopicNameBySlug] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [communityErr, setCommunityErr] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [communityBusyId, setCommunityBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectedCommunity, setSelectedCommunity] = useState<Set<string>>(() => new Set());
  const communitySelectAllRef = useRef<HTMLInputElement>(null);
  const skipUrlWriteRef = useRef(true);

  useEffect(() => {
    if (skipUrlWriteRef.current) {
      skipUrlWriteRef.current = false;
      return;
    }
    const q = new URLSearchParams();
    const topic = communityTopicFilter.trim().toLowerCase();
    if (topic) q.set("topicSlug", topic);
    const userId = communityUserFilter.trim();
    if (userId) q.set("userId", userId);
    const postId = communityPostIdFilter.trim();
    if (postId) q.set("postId", postId);
    if (communityStatusFilter && ["active", "hidden", "deleted"].includes(communityStatusFilter)) {
      q.set("status", communityStatusFilter);
    }
    if (communityPeriod.trim()) q.set("period", communityPeriod.trim());
    if (communityReportedOnly) q.set("reportedOnly", "1");
    if (communityCreatedFrom) q.set("createdFrom", communityCreatedFrom);
    if (communityCreatedTo) q.set("createdTo", communityCreatedTo);
    const next = q.toString() ? `${pathname}?${q.toString()}` : pathname;
    router.replace(next);
  }, [
    pathname,
    router,
    communityTopicFilter,
    communityUserFilter,
    communityPostIdFilter,
    communityStatusFilter,
    communityPeriod,
    communityReportedOnly,
    communityCreatedFrom,
    communityCreatedTo,
  ]);

  const loadCommunity = useCallback(async () => {
    setCommunityErr("");
    try {
      const q = new URLSearchParams({ limit: "100" });
      const topic = communityTopicFilter.trim().toLowerCase();
      if (topic) q.set("topicSlug", topic);
      const userId = communityUserFilter.trim();
      if (userId) q.set("userId", userId);
      const postId = communityPostIdFilter.trim();
      if (postId) q.set("postId", postId);
      if (communityStatusFilter && ["active", "hidden", "deleted"].includes(communityStatusFilter)) {
        q.set("status", communityStatusFilter);
      }
      if (communityPeriod.trim()) q.set("period", communityPeriod.trim());
      if (communityReportedOnly) q.set("reportedOnly", "1");
      if (communityCreatedFrom) q.set("createdFrom", new Date(communityCreatedFrom).toISOString());
      if (communityCreatedTo) {
        const end = new Date(communityCreatedTo);
        end.setHours(23, 59, 59, 999);
        q.set("createdTo", end.toISOString());
      }
      const res = await fetch(`/api/admin/community/engine/posts?${q.toString()}`, {
        cache: "no-store",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });
      const j = (await res.json()) as { ok?: boolean; posts?: CommunityPostRow[]; error?: string };
      if (!res.ok || !j.ok) {
        setCommunityErr(j.error ?? tr("admin_posts_err_community_load"));
        setCommunityRows([]);
        return;
      }
      setCommunityRows(j.posts ?? []);
    } catch (e) {
      setCommunityErr((e as Error).message);
      setCommunityRows([]);
    }
  }, [
    tr,
    communityTopicFilter,
    communityUserFilter,
    communityPostIdFilter,
    communityStatusFilter,
    communityPeriod,
    communityReportedOnly,
    communityCreatedFrom,
    communityCreatedTo,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    await loadCommunity();
    setLoading(false);
  }, [loadCommunity]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/community/topics", { credentials: "include", cache: "no-store" });
        const j = (await res.json()) as {
          ok?: boolean;
          topics?: { slug?: string; name?: string }[];
        };
        if (cancel || !j.ok || !Array.isArray(j.topics)) return;
        const map: Record<string, string> = {};
        for (const t of j.topics) {
          if (t.slug && t.name) map[t.slug] = t.name;
        }
        setTopicNameBySlug(map);
      } catch {
        /* keep slug fallback */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const topicDisplayLabel = useCallback(
    (row: CommunityPostRow) => {
      const slug = String(row.topicSlug ?? row.topic_slug ?? row.category ?? "");
      if (!slug) return dash;
      return topicNameBySlug[slug] ?? slug;
    },
    [topicNameBySlug, dash]
  );

  const topicSlugOf = useCallback((row: CommunityPostRow) => {
    return String(row.topicSlug ?? row.topic_slug ?? row.category ?? "").trim();
  }, []);

  const patchCommunityPost = useCallback(
    async (id: string, status: string) => {
      setCommunityBusyId(id);
      setCommunityErr("");
      try {
        const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setCommunityErr(j.error ?? tr("admin_posts_err_community_patch"));
          return;
        }
        setSelectedCommunity((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        await loadCommunity();
      } finally {
        setCommunityBusyId(null);
      }
    },
    [loadCommunity, tr]
  );

  const communityIdsVisible = communityRows.map((r) => String(r.id));
  const allCommunitySelected =
    communityIdsVisible.length > 0 && communityIdsVisible.every((id) => selectedCommunity.has(id));
  const someCommunitySelected = communityIdsVisible.some((id) => selectedCommunity.has(id));

  useEffect(() => {
    const el = communitySelectAllRef.current;
    if (el) el.indeterminate = someCommunitySelected && !allCommunitySelected;
  }, [someCommunitySelected, allCommunitySelected]);

  const toggleCommunityRow = useCallback((id: string, checked: boolean) => {
    setSelectedCommunity((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllCommunity = useCallback(
    (checked: boolean) => {
      setSelectedCommunity(() => {
        if (!checked) return new Set();
        return new Set(communityIdsVisible);
      });
    },
    [communityIdsVisible]
  );

  const bulkDeleteCommunity = useCallback(async () => {
    const ids = [...selectedCommunity];
    if (ids.length === 0) return;
    if (!(await dibayConfirm({ title: tr("admin_posts_confirm_bulk_delete_community", { count: ids.length }), confirmTone: "destructive" }))) {
      return;
    }
    setBulkBusy(true);
    setActionMsg(null);
    setCommunityErr("");
    try {
      const res = await fetch("/api/admin/community/engine/posts/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedCount?: number;
        notFoundOrSkipped?: string[];
      };
      if (!res.ok || !j.ok) {
        setCommunityErr(j.error ?? tr("admin_posts_err_community_bulk_delete"));
        return;
      }
      setSelectedCommunity(new Set());
      const skipped =
        j.notFoundOrSkipped?.length ?
          tr("admin_posts_msg_skipped_suffix", { skipped: j.notFoundOrSkipped.length })
        : "";
      setActionMsg(
        tr("admin_posts_msg_bulk_deleted_community", {
          deleted: j.deletedCount ?? 0,
          skipped,
        })
      );
      await loadCommunity();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedCommunity, loadCommunity, tr]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_menu_community_posts"
        description={tr("admin_posts_help_community_short")}
      />

      {actionMsg ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body-secondary text-emerald-900">
          {actionMsg}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_col_topic")}</span>
          <input
            type="text"
            value={communityTopicFilter}
            onChange={(e) => setCommunityTopicFilter(e.target.value)}
            placeholder={tr("admin_posts_col_topic")}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_col_author")}</span>
          <input
            type="text"
            value={communityUserFilter}
            onChange={(e) => setCommunityUserFilter(e.target.value)}
            placeholder={tr("admin_posts_filter_author_id")}
            className="min-w-[10rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_feed_posts_col_status")}</span>
          <select
            value={communityStatusFilter}
            onChange={(e) => {
              setCommunityStatusFilter(e.target.value);
              if (e.target.value) setCommunityPeriod("");
            }}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <option value="">{tr("admin_posts_filter_all_status")}</option>
            {communityStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {tr(o.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 self-end pb-2 sam-text-body-secondary">
          <input
            type="checkbox"
            checked={communityReportedOnly}
            onChange={(e) => setCommunityReportedOnly(e.target.checked)}
          />
          {tr("admin_posts_filter_reported_only")}
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_filter_from")}</span>
          <input
            type="date"
            value={communityCreatedFrom}
            onChange={(e) => {
              setCommunityCreatedFrom(e.target.value);
              if (e.target.value) setCommunityPeriod("");
            }}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="sam-text-helper text-sam-muted">{tr("admin_posts_filter_to")}</span>
          <input
            type="date"
            value={communityCreatedTo}
            onChange={(e) => {
              setCommunityCreatedTo(e.target.value);
              if (e.target.value) setCommunityPeriod("");
            }}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          />
        </label>
        <button
          type="button"
          onClick={() => void loadCommunity()}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-body-secondary"
        >
          {tr("admin_feed_posts_refresh")}
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center sam-text-body text-sam-muted">{tr("common_loading")}</div>
      ) : (
        <>
          {communityErr ? (
            <div className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800">
              {communityErr}
            </div>
          ) : null}
          {communityRows.length === 0 && !communityErr ? (
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
              {tr("admin_posts_empty_community")}
            </div>
          ) : communityRows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
                <table className="w-full min-w-[1100px] text-left sam-text-body">
                  <thead>
                    <tr className="border-b border-sam-border bg-sam-app">
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_title")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_topic")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_author")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_region")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_views")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_likes")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_comments")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_reported")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_status")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_registered")}</th>
                      <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_manage")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communityRows.map((r) => {
                      const id = String(r.id ?? "");
                      const busy = communityBusyId === id;
                      const titleStr = String(r.title ?? "");
                      const uid = String(r.user_id ?? "").trim();
                      const authorLabel = String(r.author_label ?? "").trim() || dash;
                      const slug = topicSlugOf(r);
                      const reportCount = Number(r.report_count ?? 0);
                      const commentCount = Number(r.comment_count ?? 0);
                      return (
                        <tr key={id} className="border-b border-sam-border-soft">
                          <td className="max-w-[220px] p-3">
                            <Link
                              href={`/admin/community/posts/${encodeURIComponent(id)}`}
                              className="font-medium text-signature hover:underline"
                            >
                              {titleStr ? titleStr : tr("admin_posts_no_title")}
                            </Link>
                            {r.is_sample_data === true ? (
                              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 sam-text-xxs text-amber-900">
                                {tr("admin_feed_posts_sample_badge")}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-sam-muted">
                            {slug ? (
                              <button
                                type="button"
                                className="text-signature hover:underline"
                                onClick={() => setCommunityTopicFilter(slug)}
                              >
                                {topicDisplayLabel(r)}
                              </button>
                            ) : (
                              dash
                            )}
                          </td>
                          <td className="max-w-[140px] truncate p-3 text-sam-muted" title={authorLabel}>
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
                          <td
                            className="max-w-[140px] truncate p-3 text-sam-muted"
                            title={String(r.region_label ?? "")}
                          >
                            {String(r.region_label ?? dash)}
                          </td>
                          <td className="p-3 text-sam-muted">{Number(r.view_count ?? 0)}</td>
                          <td className="p-3 text-sam-muted">{Number(r.like_count ?? 0)}</td>
                          <td className="p-3">
                            <Link
                              href={`/admin/community/comments?postId=${encodeURIComponent(id)}`}
                              className="text-signature hover:underline"
                            >
                              {commentCount}
                            </Link>
                          </td>
                          <td className="p-3">
                            {reportCount > 0 ? (
                              <Link
                                href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`}
                                className="text-signature hover:underline"
                              >
                                {reportCount}
                              </Link>
                            ) : (
                              <span className="text-sam-muted">0</span>
                            )}
                          </td>
                          <td className="p-3">
                            <select
                              value={String(r.status ?? "active")}
                              disabled={busy || bulkBusy}
                              onChange={(e) => void patchCommunityPost(id, e.target.value)}
                              className="max-w-[7rem] rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                            >
                              {communityStatusOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {tr(o.labelKey)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap p-3 text-sam-muted">
                            {r.created_at ? formatTimeAgo(r.created_at) : dash}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                disabled={busy || bulkBusy}
                                onClick={() => void patchCommunityPost(id, "hidden")}
                                className="sam-text-helper text-amber-700 hover:underline"
                              >
                                {tr("admin_feed_posts_action_hide")}
                              </button>
                              <button
                                type="button"
                                disabled={busy || bulkBusy}
                                onClick={() => void patchCommunityPost(id, "deleted")}
                                className="sam-text-helper text-red-600 hover:underline"
                              >
                                {tr("admin_feed_posts_action_delete")}
                              </button>
                              <button
                                type="button"
                                disabled={busy || bulkBusy}
                                onClick={() => void patchCommunityPost(id, "active")}
                                className="sam-text-helper text-emerald-700 hover:underline"
                              >
                                {tr("admin_feed_posts_action_restore")}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <details className="rounded-ui-rect border border-red-200 bg-red-50/40 px-3 py-2">
                <summary className="cursor-pointer font-medium text-red-800">
                  {tr("admin_community_danger_zone")}
                </summary>
                <p className="mt-2 sam-text-body-secondary text-red-900/80">
                  {tr("admin_community_danger_zone_hint")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 sam-text-body-secondary">
                    <input
                      ref={communitySelectAllRef}
                      type="checkbox"
                      checked={allCommunitySelected}
                      onChange={(e) => toggleAllCommunity(e.target.checked)}
                      className="rounded border-sam-border"
                      aria-label={tr("admin_posts_aria_select_all_community")}
                    />
                    {tr("admin_posts_title_select_all_visible")}
                  </label>
                  <span className="sam-text-body-secondary text-sam-fg">
                    {tr("admin_posts_bulk_selected", { count: selectedCommunity.size })}
                  </span>
                  <button
                    type="button"
                    disabled={bulkBusy || selectedCommunity.size === 0}
                    onClick={() => void bulkDeleteCommunity()}
                    className="rounded-ui-rect bg-red-600 px-3 py-1.5 sam-text-body-secondary font-medium text-white disabled:opacity-40"
                  >
                    {tr("admin_posts_bulk_delete_db")}
                  </button>
                </div>
                <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto sam-text-helper">
                  {communityRows.map((r) => {
                    const id = String(r.id ?? "");
                    const titleStr = String(r.title ?? "").trim() || tr("admin_posts_no_title");
                    return (
                      <li key={`danger-${id}`} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedCommunity.has(id)}
                          disabled={bulkBusy}
                          onChange={(e) => toggleCommunityRow(id, e.target.checked)}
                          aria-label={tr("admin_posts_aria_select_row", { label: titleStr.slice(0, 24) })}
                        />
                        <span className="truncate text-sam-fg">{titleStr}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
