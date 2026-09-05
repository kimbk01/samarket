"use client";

import { dibayAlert, dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatTimeAgo } from "@/lib/utils/format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  AdminManagementBulkBar,
  AdminManagementSelectionCheckbox,
  AdminManagementSurfaceRoot,
  AdminManagementTableViewport,
  useAdminManagementSelection,
} from "@/components/admin/management";
import {
  COMMUNITY_POST_ENTITY_ACTION_POLICY,
  computeTableMinWidthPx,
  managementColumnStyle,
  terminologyDisplay,
  type ManagementColumnKind,
} from "@/lib/admin/management";

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

const COLUMN_KINDS: ManagementColumnKind[] = [
  "SELECTION",
  "TITLE",
  "METADATA",
  "IDENTITY",
  "METADATA",
  "NUMERIC",
  "NUMERIC",
  "NUMERIC",
  "NUMERIC",
  "STATUS",
  "DATE",
  "ACTIONS",
];

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
  const { t: tr, language } = useI18n();
  const dash = tr("admin_users_empty_placeholder");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const policy = COMMUNITY_POST_ENTITY_ACTION_POLICY;
  const tableMinWidth = computeTableMinWidthPx(COLUMN_KINDS);

  const communityStatusOptions = useMemo(
    () =>
      [
        { value: "active", label: tr("admin_community_post_status_active") },
        { value: "hidden", label: terminologyDisplay("HIDE", language) },
        { value: "deleted", label: terminologyDisplay("SOFT_DELETE", language) },
      ] as const,
    [language, tr]
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
  const skipUrlWriteRef = useRef(true);

  const queryScopeKey = useMemo(
    () =>
      [
        communityTopicFilter,
        communityUserFilter,
        communityPostIdFilter,
        communityStatusFilter,
        communityPeriod,
        communityReportedOnly ? "1" : "0",
        communityCreatedFrom,
        communityCreatedTo,
      ].join("|"),
    [
      communityTopicFilter,
      communityUserFilter,
      communityPostIdFilter,
      communityStatusFilter,
      communityPeriod,
      communityReportedOnly,
      communityCreatedFrom,
      communityCreatedTo,
    ]
  );

  const selectableIds = useMemo(
    () => communityRows.map((r) => String(r.id ?? "")).filter(Boolean),
    [communityRows]
  );
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });

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
          return false;
        }
        return true;
      } finally {
        setCommunityBusyId(null);
      }
    },
    [tr]
  );

  const confirmSoftStatusDelete = useCallback(
    async (count: number, sampleId?: string) => {
      const softLabel = terminologyDisplay("SOFT_DELETE", language);
      const hint =
        language === "en"
          ? "Sets status=deleted. The DB row remains. This is not a permanent DB delete."
          : "status=deleted 로 표시됩니다. DB row는 남습니다. DB 영구 삭제가 아닙니다.";
      const sample = sampleId ? `\nID: ${sampleId}` : "";
      return dibayConfirm({
        title:
          language === "en"
            ? `${softLabel}? (not a permanent DB delete)`
            : `${softLabel}할까요? (DB 영구 삭제 아님)`,
        description: `${hint}\n${language === "en" ? "Selected" : "선택"}: ${count}${sample}`,
        confirmTone: "destructive",
        confirmLabel: softLabel,
      });
    },
    [language]
  );

  const runSoftBulk = useCallback(
    async (status: "hidden" | "active" | "deleted") => {
      const ids = [...selection.selected];
      if (ids.length === 0) return;
      if (status === "deleted") {
        const ok = await confirmSoftStatusDelete(ids.length, ids[0]);
        if (!ok) return;
      } else if (status === "hidden") {
        const ok = await dibayConfirm({
          title: terminologyDisplay("HIDE", language),
          description:
            language === "en"
              ? `Hide ${ids.length} selected post(s)? Recoverable.`
              : `선택 ${ids.length}건을 숨길까요? 복구 가능합니다.`,
          confirmTone: "destructive",
        });
        if (!ok) return;
      }
      setBulkBusy(true);
      setActionMsg(null);
      setCommunityErr("");
      const failed: string[] = [];
      try {
        for (const id of ids) {
          const ok = await patchCommunityPost(id, status);
          if (!ok) failed.push(id);
        }
        selection.clear();
        if (failed.length > 0) {
          setCommunityErr(
            language === "en"
              ? `${failed.length} failed · others applied`
              : `${failed.length}건 실패 · 나머지는 반영됨`
          );
        } else {
          setActionMsg(
            language === "en"
              ? `Updated status for ${ids.length}`
              : `${ids.length}건 상태 변경 완료`
          );
        }
        await loadCommunity();
      } finally {
        setBulkBusy(false);
      }
    },
    [selection, patchCommunityPost, loadCommunity, language, confirmSoftStatusDelete]
  );

  const bulkHardDelete = useCallback(async () => {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    const hardLabel = terminologyDisplay("HARD_DELETE", language);
    const sample = ids.slice(0, 3).join(", ") + (ids.length > 3 ? "…" : "");
    const body =
      language === "en"
        ? `Action: ${hardLabel}\nEntity: community_post\nCount: ${ids.length}\nSample: ${sample}\n\nRemoves DB rows permanently. Cannot restore.\nChild cleanup follows API/DB CASCADE only.\nType DELETE to confirm.`
        : `작업: ${hardLabel}\n엔티티: community_post\n건수: ${ids.length}\n대표: ${sample}\n\nDB에서 실제로 제거합니다. 복구 불가.\nchild 정리는 API/DB CASCADE 범위만 적용됩니다.\n확인하려면 DELETE 를 입력하세요.`;
    const typed = await dibayPrompt({
      title:
        language === "en"
          ? `${hardLabel}? (irreversible)`
          : `${hardLabel}할까요? (복구 불가)`,
      description: body,
      placeholder: "DELETE",
      required: true,
      confirmTone: "destructive",
      confirmLabel: hardLabel,
    });
    if (typed == null) return;
    if (typed.trim() !== "DELETE") {
      await dibayAlert({
        title:
          language === "en"
            ? "Confirmation text mismatch — hard delete cancelled"
            : "확인 문구 불일치 — DB 영구 삭제를 취소했습니다",
      });
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
        // No soft-delete fallback — surface hard-delete failure only.
        setCommunityErr(j.error ?? tr("admin_posts_err_community_bulk_delete"));
        return;
      }
      selection.clear();
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
  }, [selection, loadCommunity, tr, language]);

  const hideLabel = terminologyDisplay("HIDE", language);
  const restoreLabel = terminologyDisplay("RESTORE", language);
  const softDeleteLabel = terminologyDisplay("SOFT_DELETE", language);
  const hardDeleteLabel = terminologyDisplay("HARD_DELETE", language);
  const selectAllLabel =
    language === "en" ? "Select all on current page" : "현재 페이지 전체 선택";
  const selectedLabel =
    language === "en"
      ? `${selection.selectedCount} selected`
      : `${selection.selectedCount}개 선택됨`;

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-posts" className="space-y-4">
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
                {o.label}
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
        <div className="py-12 text-center sam-text-body text-sam-muted" data-admin-mgmt-state="LOADING">
          {tr("common_loading")}
        </div>
      ) : (
        <>
          {communityErr ? (
            <div
              className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary text-red-800"
              data-admin-mgmt-state="ERROR"
            >
              {communityErr}
            </div>
          ) : null}
          {communityRows.length === 0 && !communityErr ? (
            <div
              className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"
              data-admin-mgmt-state="EMPTY"
            >
              {tr("admin_posts_empty_community")}
            </div>
          ) : communityRows.length > 0 ? (
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
                  {
                    id: "hard_delete",
                    label: hardDeleteLabel,
                    onClick: () => {
                      if (bulkBusy) return;
                      void bulkHardDelete();
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
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("TITLE")}>
                      {tr("admin_feed_posts_col_title")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("METADATA")}>
                      {tr("admin_posts_col_topic")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("IDENTITY")}>
                      {tr("admin_posts_col_author")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("METADATA")}>
                      {tr("admin_posts_col_region")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("NUMERIC")}>
                      {tr("admin_posts_col_views")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("NUMERIC")}>
                      {tr("admin_posts_col_likes")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("NUMERIC")}>
                      {tr("admin_posts_col_comments")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("NUMERIC")}>
                      {tr("admin_feed_posts_col_reported")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("STATUS")}>
                      {tr("admin_feed_posts_col_status")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("DATE")}>
                      {tr("admin_posts_col_registered")}
                    </th>
                    <th className="p-3 font-medium text-sam-fg" style={managementColumnStyle("ACTIONS")}>
                      {tr("admin_posts_col_manage")}
                    </th>
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
                        <td className="p-3" style={managementColumnStyle("SELECTION")}>
                          <AdminManagementSelectionCheckbox
                            role="row"
                            checked={selection.isSelected(id)}
                            onToggle={() => selection.toggleRow(id)}
                            disabled={bulkBusy}
                            aria-label={tr("admin_posts_aria_select_row", {
                              label: (titleStr || id).slice(0, 24),
                            })}
                          />
                        </td>
                        <td className="p-3" style={managementColumnStyle("TITLE")}>
                          <Link
                            href={`/admin/community/posts/${encodeURIComponent(id)}`}
                            className="block truncate font-medium text-signature hover:underline"
                            title={titleStr || undefined}
                          >
                            {titleStr ? titleStr : tr("admin_posts_no_title")}
                          </Link>
                          {r.is_sample_data === true ? (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 sam-text-xxs text-amber-900">
                              {tr("admin_feed_posts_sample_badge")}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 text-sam-muted" style={managementColumnStyle("METADATA")}>
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
                        <td
                          className="truncate p-3 text-sam-muted"
                          style={managementColumnStyle("METADATA")}
                          title={String(r.region_label ?? "")}
                        >
                          {String(r.region_label ?? dash)}
                        </td>
                        <td className="p-3 text-sam-muted" style={managementColumnStyle("NUMERIC")}>
                          {Number(r.view_count ?? 0)}
                        </td>
                        <td className="p-3 text-sam-muted" style={managementColumnStyle("NUMERIC")}>
                          {Number(r.like_count ?? 0)}
                        </td>
                        <td className="p-3" style={managementColumnStyle("NUMERIC")}>
                          <Link
                            href={`/admin/community/comments?postId=${encodeURIComponent(id)}`}
                            className="text-signature hover:underline"
                          >
                            {commentCount}
                          </Link>
                        </td>
                        <td className="p-3" style={managementColumnStyle("NUMERIC")}>
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
                        <td className="p-3" style={managementColumnStyle("STATUS")}>
                          <select
                            value={String(r.status ?? "active")}
                            disabled={busy || bulkBusy}
                            onChange={(e) => {
                              const next = e.target.value;
                              void (async () => {
                                if (next === "deleted") {
                                  const ok = await confirmSoftStatusDelete(1, id);
                                  if (!ok) {
                                    e.target.value = String(r.status ?? "active");
                                    return;
                                  }
                                }
                                const patched = await patchCommunityPost(id, next);
                                if (patched) void loadCommunity();
                                else e.target.value = String(r.status ?? "active");
                              })();
                            }}
                            className="max-w-[7rem] rounded border border-sam-border px-2 py-1 sam-text-body-secondary"
                          >
                            {communityStatusOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td
                          className="whitespace-nowrap p-3 text-sam-muted"
                          style={managementColumnStyle("DATE")}
                        >
                          {r.created_at ? formatTimeAgo(r.created_at) : dash}
                        </td>
                        <td className="p-3" style={managementColumnStyle("ACTIONS")}>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() =>
                                void patchCommunityPost(id, "hidden").then((ok) => {
                                  if (ok) void loadCommunity();
                                })
                              }
                              className="sam-text-helper text-amber-700 hover:underline"
                            >
                              {hideLabel}
                            </button>
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() =>
                                void (async () => {
                                  const ok = await confirmSoftStatusDelete(1, id);
                                  if (!ok) return;
                                  const patched = await patchCommunityPost(id, "deleted");
                                  if (patched) void loadCommunity();
                                })()
                              }
                              className="sam-text-helper text-red-600 hover:underline"
                              data-admin-mgmt-row-soft-delete="1"
                            >
                              {softDeleteLabel}
                            </button>
                            <button
                              type="button"
                              disabled={busy || bulkBusy}
                              onClick={() =>
                                void patchCommunityPost(id, "active").then((ok) => {
                                  if (ok) void loadCommunity();
                                })
                              }
                              className="sam-text-helper text-emerald-700 hover:underline"
                            >
                              {restoreLabel}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AdminManagementTableViewport>
          ) : null}
        </>
      )}
    </AdminManagementSurfaceRoot>
  );
}
