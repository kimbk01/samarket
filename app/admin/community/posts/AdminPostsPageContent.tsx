"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdminPosts } from "@/lib/admin-posts/getAdminPosts";
import { updatePostStatusAdmin } from "@/lib/admin-posts/updatePostAdmin";
import type { PostWithMeta } from "@/lib/posts/schema";
import { resolveTradePostListingLocationLine } from "@/lib/posts/post-listing-location-label";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type PostsTab = "trade" | "community";

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
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  region_label?: string | null;
  is_sample_data?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function AdminPostsPageContent() {
  const { t: tr } = useI18n();
  const dash = tr("admin_users_empty_placeholder");

  const statusTradeOptions = useMemo(
    () =>
      [
        { value: "active" as const, labelKey: "admin_trade_post_status_active" as const },
        { value: "reserved" as const, labelKey: "admin_trade_post_status_reserved" as const },
        { value: "sold" as const, labelKey: "admin_trade_post_status_sold" as const },
        { value: "hidden" as const, labelKey: "admin_trade_post_status_hidden" as const },
      ] as const,
    []
  );

  const communityStatusOptions = useMemo(
    () =>
      [
        { value: "active", labelKey: "admin_community_post_status_active" as const },
        { value: "hidden", labelKey: "admin_feed_posts_action_hide" as const },
        { value: "deleted", labelKey: "admin_feed_posts_action_delete" as const },
      ] as const,
    []
  );

  const [tab, setTab] = useState<PostsTab>("community");
  const [posts, setPosts] = useState<PostWithMeta[]>([]);
  const [communityRows, setCommunityRows] = useState<CommunityPostRow[]>([]);
  const [communityTopicFilter, setCommunityTopicFilter] = useState("");
  const [communityUserFilter, setCommunityUserFilter] = useState("");
  const [communityStatusFilter, setCommunityStatusFilter] = useState("");
  const [communityReportedOnly, setCommunityReportedOnly] = useState(false);
  const [communityCreatedFrom, setCommunityCreatedFrom] = useState("");
  const [communityCreatedTo, setCommunityCreatedTo] = useState("");
  const [topicNameBySlug, setTopicNameBySlug] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [communityErr, setCommunityErr] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [communityBusyId, setCommunityBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [selectedCommunity, setSelectedCommunity] = useState<Set<string>>(() => new Set());
  const [selectedTrade, setSelectedTrade] = useState<Set<string>>(() => new Set());
  const communitySelectAllRef = useRef<HTMLInputElement>(null);
  const tradeSelectAllRef = useRef<HTMLInputElement>(null);

  const loadTrade = useCallback(async () => {
    const list = await getAdminPosts();
    setPosts(list);
  }, []);

  const loadCommunity = useCallback(async () => {
    setCommunityErr("");
    try {
      const q = new URLSearchParams({ limit: "100" });
      const topic = communityTopicFilter.trim().toLowerCase();
      if (topic) q.set("topicSlug", topic);
      const userId = communityUserFilter.trim();
      if (userId) q.set("userId", userId);
      if (communityStatusFilter && ["active", "hidden", "deleted"].includes(communityStatusFilter)) {
        q.set("status", communityStatusFilter);
      }
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
    communityStatusFilter,
    communityReportedOnly,
    communityCreatedFrom,
    communityCreatedTo,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "trade") {
      await loadTrade();
    } else {
      await loadCommunity();
    }
    setLoading(false);
  }, [tab, loadTrade, loadCommunity]);

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

  useEffect(() => {
    setSelectedCommunity(new Set());
    setSelectedTrade(new Set());
    setActionMsg(null);
  }, [tab]);

  const handleStatusChange = useCallback(
    async (postId: string, status: PostWithMeta["status"]) => {
      const res = await updatePostStatusAdmin(postId, status);
      if (res.ok) void loadTrade();
    },
    [loadTrade]
  );

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

  const tradeIdsVisible = posts.map((p) => p.id);
  const allTradeSelected =
    tradeIdsVisible.length > 0 && tradeIdsVisible.every((id) => selectedTrade.has(id));
  const someTradeSelected = tradeIdsVisible.some((id) => selectedTrade.has(id));

  useEffect(() => {
    const el = tradeSelectAllRef.current;
    if (el) el.indeterminate = someTradeSelected && !allTradeSelected;
  }, [someTradeSelected, allTradeSelected]);

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

  const toggleTradeRow = useCallback((id: string, checked: boolean) => {
    setSelectedTrade((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllTrade = useCallback(
    (checked: boolean) => {
      setSelectedTrade(() => {
        if (!checked) return new Set();
        return new Set(tradeIdsVisible);
      });
    },
    [tradeIdsVisible]
  );

  const bulkDeleteCommunity = useCallback(async () => {
    const ids = [...selectedCommunity];
    if (ids.length === 0) return;
    if (!window.confirm(tr("admin_posts_confirm_bulk_delete_community", { count: ids.length }))) {
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

  const bulkDeleteTrade = useCallback(async () => {
    const ids = [...selectedTrade];
    if (ids.length === 0) return;
    if (!window.confirm(tr("admin_posts_confirm_bulk_delete_trade", { count: ids.length }))) {
      return;
    }
    setBulkBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/admin/posts/bulk-delete", {
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
        setActionMsg(j.error ?? tr("admin_posts_err_trade_bulk_delete"));
        return;
      }
      setSelectedTrade(new Set());
      const skipped =
        j.notFoundOrSkipped?.length ?
          tr("admin_posts_msg_skipped_suffix", { skipped: j.notFoundOrSkipped.length })
        : "";
      setActionMsg(
        tr("admin_posts_msg_bulk_deleted_trade", {
          deleted: j.deletedCount ?? 0,
          skipped,
        })
      );
      await loadTrade();
    } finally {
      setBulkBusy(false);
    }
  }, [selectedTrade, loadTrade, tr]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_posts_page_title" />

      <div className="flex flex-wrap gap-2 border-b border-sam-border pb-2">
        <button
          type="button"
          onClick={() => setTab("community")}
          className={`rounded-ui-rect px-3 py-2 sam-text-body font-medium ${
            tab === "community"
              ? "bg-signature text-white"
              : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
          }`}
        >
          {tr("admin_posts_tab_community")}
        </button>
        <button
          type="button"
          onClick={() => setTab("trade")}
          className={`rounded-ui-rect px-3 py-2 sam-text-body font-medium ${
            tab === "trade"
              ? "bg-signature text-white"
              : "bg-sam-surface-muted text-sam-fg hover:bg-sam-border-soft"
          }`}
        >
          {tr("admin_posts_tab_trade")}
        </button>
      </div>

      {actionMsg ? (
        <div className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body-secondary text-emerald-900">
          {actionMsg}
        </div>
      ) : null}

      {tab === "community" ? (
        <p className="sam-text-body-secondary text-sam-muted">
          <code className="rounded bg-sam-surface-muted px-1">community_posts</code>
          {tr("admin_posts_help_community_before_link")}
          <Link href="/philife" className="text-signature hover:underline">
            /philife
          </Link>
          {tr("admin_posts_help_community_after_link")}
        </p>
      ) : (
        <p className="sam-text-body-secondary text-sam-muted">
          {tr("admin_posts_help_trade_before_code")}
          <code className="rounded bg-sam-surface-muted px-1">posts</code>
          {tr("admin_posts_help_trade_after_code")}
        </p>
      )}

      {tab === "community" ? (
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
              onChange={(e) => setCommunityStatusFilter(e.target.value)}
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
              onChange={(e) => setCommunityCreatedFrom(e.target.value)}
              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="sam-text-helper text-sam-muted">{tr("admin_posts_filter_to")}</span>
            <input
              type="date"
              value={communityCreatedTo}
              onChange={(e) => setCommunityCreatedTo(e.target.value)}
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
      ) : null}

      {tab === "community" && !loading && communityRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
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
      ) : null}

      {tab === "trade" && !loading && posts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <span className="sam-text-body-secondary text-sam-fg">
            {tr("admin_posts_bulk_selected", { count: selectedTrade.size })}
          </span>
          <button
            type="button"
            disabled={bulkBusy || selectedTrade.size === 0}
            onClick={() => void bulkDeleteTrade()}
            className="rounded-ui-rect bg-red-600 px-3 py-1.5 sam-text-body-secondary font-medium text-white disabled:opacity-40"
          >
            {tr("admin_posts_bulk_delete_db")}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="py-12 text-center sam-text-body text-sam-muted">{tr("common_loading")}</div>
      ) : tab === "trade" ? (
        posts.length === 0 ? (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
            {tr("admin_posts_empty_trade")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
            <table className="w-full text-left sam-text-body">
              <thead>
                <tr className="border-b border-sam-border bg-sam-app">
                  <th className="w-10 px-2 py-2 text-center font-medium text-sam-fg">
                    <input
                      ref={tradeSelectAllRef}
                      type="checkbox"
                      checked={allTradeSelected}
                      onChange={(e) => toggleAllTrade(e.target.checked)}
                      className="rounded border-sam-border"
                      title={tr("admin_posts_title_select_all_visible")}
                      aria-label={tr("admin_posts_aria_select_all_trade")}
                    />
                  </th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_title")}</th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_listing_location")}</th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_type")}</th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_status")}</th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_created")}</th>
                  <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((p) => {
                  const metaRec =
                    p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
                      ? (p.meta as Record<string, unknown>)
                      : undefined;
                  const listingLocLine =
                    resolveTradePostListingLocationLine(metaRec, p.region, p.city) ?? dash;
                  return (
                  <tr key={p.id} className="border-b border-sam-border-soft">
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTrade.has(p.id)}
                        onChange={(e) => toggleTradeRow(p.id, e.target.checked)}
                        className="rounded border-sam-border"
                        aria-label={tr("admin_posts_aria_select_row", { label: p.title.slice(0, 20) })}
                      />
                    </td>
                    <td className="p-3">
                      <Link href={`/post/${p.id}`} className="text-signature hover:underline">
                        {p.title}
                      </Link>
                    </td>
                    <td
                      className="max-w-[220px] truncate p-3 text-sam-muted"
                      title={listingLocLine === dash ? undefined : listingLocLine}
                    >
                      {listingLocLine}
                    </td>
                    <td className="p-3 text-sam-muted">{p.type}</td>
                    <td className="p-3">
                      <select
                        value={p.status}
                        onChange={(e) =>
                          handleStatusChange(p.id, e.target.value as PostWithMeta["status"])
                        }
                        className="rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                      >
                        {statusTradeOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {tr(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-sam-muted">{formatTimeAgo(p.created_at)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(p.id, "hidden")}
                        className="sam-text-body-secondary text-red-600 hover:underline"
                      >
                        {tr("admin_feed_posts_action_hide")}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
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
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
              <table className="w-full min-w-[1100px] text-left sam-text-body">
                <thead>
                  <tr className="border-b border-sam-border bg-sam-app">
                    <th className="w-10 px-2 py-2 text-center font-medium text-sam-fg">
                      <input
                        ref={communitySelectAllRef}
                        type="checkbox"
                        checked={allCommunitySelected}
                        onChange={(e) => toggleAllCommunity(e.target.checked)}
                        className="rounded border-sam-border"
                        title={tr("admin_posts_title_select_all_visible")}
                        aria-label={tr("admin_posts_aria_select_all_community")}
                      />
                    </th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_title")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_topic")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_author")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_region")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_views")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_likes")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_comments")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_status")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_feed_posts_col_reported")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_registered")}</th>
                    <th className="p-3 font-medium text-sam-fg">{tr("admin_posts_col_manage")}</th>
                  </tr>
                </thead>
                <tbody>
                  {communityRows.map((r) => {
                    const id = String(r.id ?? "");
                    const busy = communityBusyId === id;
                    const titleStr = String(r.title ?? "");
                    return (
                      <tr key={id} className="border-b border-sam-border-soft">
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedCommunity.has(id)}
                            onChange={(e) => toggleCommunityRow(id, e.target.checked)}
                            disabled={bulkBusy}
                            className="rounded border-sam-border"
                            aria-label={tr("admin_posts_aria_select_row", { label: titleStr.slice(0, 24) })}
                          />
                        </td>
                        <td className="max-w-[220px] p-3">
                          <Link
                            href={`/philife/${encodeURIComponent(id)}`}
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
                        <td className="p-3 text-sam-muted">{topicDisplayLabel(r)}</td>
                        <td className="max-w-[120px] truncate p-3 sam-text-xxs text-sam-muted" title={String(r.user_id ?? "")}>
                          {String(r.user_id ?? dash)}
                        </td>
                        <td
                          className="max-w-[140px] truncate p-3 text-sam-muted"
                          title={String(r.region_label ?? "")}
                        >
                          {String(r.region_label ?? dash)}
                        </td>
                        <td className="p-3 text-sam-muted">{Number(r.view_count ?? 0)}</td>
                        <td className="p-3 text-sam-muted">{Number(r.like_count ?? 0)}</td>
                        <td className="p-3 text-sam-muted">{Number(r.comment_count ?? 0)}</td>
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
                        <td className="p-3 text-center sam-text-body-secondary">
                          {r.is_reported === true ? (
                            <span className="rounded bg-amber-100 px-1.5 text-amber-900">Y</span>
                          ) : (
                            dash
                          )}
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
          ) : null}
        </>
      )}
    </div>
  );
}
