"use client";

/**
 * 커뮤니티 게시글 목록 (설계 §C-5 · §C-0-1 목록 화면 틀).
 * 탭(공개/관리자 숨김/삭제됨/신고 있음/전체) · 검색(제목·본문) · 카테고리 · 작성 구분 · 작성자 · 기간(PHT) · 페이지(20/50/100) — 모두 URL.
 * 행에서는 「상세」만, 상태 변경은 선택 후 일괄 처리 줄의 버튼(숨기기 L2 · 다시 공개 L1 · 삭제 L2 · 영구 삭제 L3)으로만 한다.
 * 상태 select 즉시 반영 없음 (C-18).
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  AdminManagementSelectionCheckbox,
  AdminManagementSurfaceRoot,
  useAdminManagementSelection,
} from "@/components/admin/management";
import { COMMUNITY_POST_ENTITY_ACTION_POLICY, isBulkActionAllowed } from "@/lib/admin/management";
import {
  COMMUNITY_TD,
  CommunityActionSheet,
  CommunityAuthorCell,
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunitySelect,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityListQuery,
  useCommunityQueryState,
  type CommunityListLoadState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import { communityAdminListPeriodParams } from "@/lib/admin/community-admin/community-admin-period";
import {
  COMMUNITY_HARD_DELETE_BLOCK_KEY,
  COMMUNITY_POSTS_LIST_PATH,
  communityJsonFetch,
  communityPostErrorText,
  useCommunityTopicOptions,
  useTopicNameOf,
  type CommunityBanner,
} from "@/components/admin/community/posts/community-post-admin-shared";

type CommunityPostRow = {
  id: string;
  user_id?: string | null;
  topic_slug?: string | null;
  topicSlug?: string | null;
  category?: string | null;
  title?: string | null;
  status?: string | null;
  is_reported?: boolean | null;
  report_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  is_sample_data?: boolean | null;
  created_at?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  origin_kind?: string | null;
  public_attribution_name?: string | null;
  is_notice?: boolean | null;
  pinned_at?: string | null;
  pinned_until?: string | null;
  /** 서버 enrich — 닉네임 | 아이디 */
  author_label?: string | null;
  author_nickname?: string | null;
  author_username?: string | null;
};

type BulkKind = "hide" | "restore" | "soft_delete" | "hard_delete";

const TABS = [
  { value: "active", labelKey: "admin_community_posts_tab_public" },
  { value: "hidden", labelKey: "admin_community_posts_tab_admin_hidden" },
  { value: "deleted", labelKey: "admin_community_posts_tab_deleted" },
  { value: "reported", labelKey: "admin_community_posts_tab_reported" },
  { value: "all", labelKey: "common_all" },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

const ORIGIN_OPTIONS = [
  { value: "", labelKey: "common_all" },
  { value: "member", labelKey: "admin_community_posts_origin_member" },
  { value: "imported", labelKey: "admin_community_posts_origin_imported" },
  { value: "admin", labelKey: "admin_community_posts_origin_admin" },
] as const satisfies readonly { value: string; labelKey: MessageKey }[];

/** 조회 조건 추가 키 (URL) — `authorId` 는 예전 링크 호환. 탭(`tab`)과 옛 탭 키(`status`·`reportedOnly`·`reported`)는 탭 쪽이 관리 */
const POST_EXTRAS = ["topicSlug", "origin", "userId", "authorId", "postId"] as const;

/** 탭 — `tab` 우선, 예전 링크(`status`, `reportedOnly=1`)도 그대로 연다 */
function resolveTab(get: (k: string) => string): string {
  const tab = get("tab");
  if (TABS.some((t) => t.value === tab)) return tab;
  if (get("reportedOnly") === "1" || get("reported") === "1") return "reported";
  const st = get("status");
  if (st === "active" || st === "hidden" || st === "deleted") return st;
  return "all";
}

function isPinnedNow(r: CommunityPostRow): boolean {
  if (!r.pinned_at) return false;
  return !r.pinned_until || Date.parse(r.pinned_until) > Date.now();
}

export function AdminPostsPageContent() {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const { get, set } = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: POST_EXTRAS });
  const { selfHref } = lq;
  const page = lq.query.page;
  const pageSize = lq.query.size;
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const policy = COMMUNITY_POST_ENTITY_ACTION_POLICY;
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);

  const tab = resolveTab(get);
  const q = lq.query.q;
  const topicSlug = lq.query.extras.topicSlug;
  const origin = lq.query.extras.origin;
  const userId = lq.query.extras.userId || lq.query.extras.authorId;
  const postId = lq.query.extras.postId;
  const period = lq.legacyPeriod;
  const from = lq.query.from;
  const to = lq.query.to;

  const [rows, setRows] = useState<CommunityPostRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [sheet, setSheet] = useState<BulkKind | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryScopeKey = [tab, q, topicSlug, origin, userId, postId, period, from, to, page, pageSize].join("|");
  const selectableIds = useMemo(() => rows.map((r) => r.id).filter(Boolean), [rows]);
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });

  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (tab === "reported") sp.set("reported", "1");
    else if (tab !== "all") sp.set("status", tab);
    if (q) sp.set("q", q);
    if (topicSlug) sp.set("topicSlug", topicSlug);
    if (origin) sp.set("origin", origin);
    if (userId) sp.set("userId", userId);
    if (postId) sp.set("postId", postId);
    // 기간은 날짜(YYYY-MM-DD, 필리핀)만 넘긴다 — UTC 경계 변환은 서버 (C-28)
    const pp = communityAdminListPeriodParams({ period, from, to });
    if (pp.period !== "all") {
      sp.set("period", pp.period);
      if (pp.from) sp.set("from", pp.from);
      if (pp.to) sp.set("to", pp.to);
    }
    return sp.toString();
  }, [tab, q, topicSlug, origin, userId, postId, period, from, to, page, pageSize]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      const r = await communityJsonFetch<{ posts?: CommunityPostRow[]; total?: number | null }>(
        `/api/admin/community/engine/posts?${apiQuery}`
      );
      if (cancel) return;
      if (!r.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
        setLoadErr({ code: r.code, status: r.status });
      } else {
        const list = r.json.posts ?? [];
        setLoadErr(null);
        setRows(list);
        setTotal(typeof r.json.total === "number" ? r.json.total : null);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [apiQuery, reloadKey, lq.refreshKey]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const selectedRows = rows.filter((r) => selection.isSelected(r.id));

  /** 숨기기·다시 공개·삭제 — 글마다 서버 1회 (CAS: updated_at), 결과 n/m */
  const runStatusBulk = useCallback(
    async (status: "hidden" | "active" | "deleted", reason: string) => {
      const targets = selectedRows;
      let okCount = 0;
      const fails: { title: string; reason: string }[] = [];
      for (const r of targets) {
        const res = await communityJsonFetch(`/api/admin/community/engine/posts/${encodeURIComponent(r.id)}`, {
          method: "PATCH",
          body: {
            expectedUpdatedAt: r.updated_at ?? "",
            status,
            ...(reason ? { reason } : {}),
          },
        });
        if (res.ok) okCount += 1;
        else fails.push({ title: String(r.title ?? "").trim() || t("admin_community_posts_untitled"), reason: communityPostErrorText(res.code, language) });
      }
      const label = t(status === "hidden" ? "admin_community_posts_action_hidden" : status === "deleted" ? "admin_community_posts_action_deleted" : "admin_community_posts_action_restore");
      if (fails.length === 0) {
        setBanner({ ok: true, message: t("admin_community_posts_bulk_all_done", { n: targets.length, label }) });
      } else {
        const detail = fails
          .slice(0, 5)
          .map((f) => `「${f.title.slice(0, 20)}」 ${f.reason}`)
          .join(" · ");
        setBanner({
          ok: false,
          code: t("admin_community_posts_bulk_partial", { total: targets.length, ok: okCount, label, failed: fails.length, detail, more: fails.length > 5 ? t("admin_community_posts_list_more") : "" }),
        });
      }
      selection.clear();
      reload();
      return { ok: true } as const;
    },
    [language, reload, selectedRows, selection, t]
  );

  const runHardDelete = useCallback(
    async (reason: string) => {
      const ids = selectedRows.map((r) => r.id);
      const res = await communityJsonFetch<{
        deleted?: string[];
        blocked?: { id: string; reason: string }[];
      }>("/api/admin/community/engine/posts/bulk-delete", { method: "POST", body: { ids, reason } });
      if (!res.ok) {
        if (res.status === 403) return { ok: false as const, status: 403, code: res.code };
        return { ok: false as const, status: 400, code: communityPostErrorText(res.code, language) };
      }
      const deleted = res.json.deleted ?? [];
      const blocked = res.json.blocked ?? [];
      if (blocked.length === 0) {
        setBanner({ ok: true, message: t("admin_community_posts_hard_deleted", { n: deleted.length }) });
      } else {
        const titleOf = (id: string) =>
          String(selectedRows.find((r) => r.id === id)?.title ?? "").trim().slice(0, 20) || t("admin_community_posts_untitled");
        const detail = blocked
          .slice(0, 6)
          .map((b) => {
            const blockKey = COMMUNITY_HARD_DELETE_BLOCK_KEY[b.reason];
            return `「${titleOf(b.id)}」 ${blockKey ? t(blockKey) : t("admin_community_posts_cannot_process")}`;
          })
          .join(" · ");
        setBanner({
          ok: false,
          code: t("admin_community_posts_hard_partial", { total: ids.length, deleted: deleted.length, blocked: blocked.length, detail, more: blocked.length > 6 ? t("admin_community_posts_list_more") : "" }),
        });
      }
      selection.clear();
      reload();
      return { ok: true as const };
    },
    [language, reload, selectedRows, selection, t]
  );

  const authorChipLabel = userId
    ? String(rows.find((r) => r.user_id === userId)?.author_label ?? "").trim() || t("admin_community_posts_selected_author")
    : "";
  const n = selection.selectedCount;
  const hardAllowed = isBulkActionAllowed(policy, "hard_delete");

  const sheetRows = [
    { label: t("admin_community_posts_sheet_target"), value: t("admin_community_posts_sheet_selected_n", { n }) },
    {
      label: t("admin_community_posts_sheet_examples"),
      value:
        selectedRows
          .slice(0, 3)
          .map((r) => `「${String(r.title ?? "").trim().slice(0, 24) || t("admin_community_posts_untitled")}」`)
          .join(", ") + (n > 3 ? t("admin_community_posts_list_more") : ""),
    },
  ];

  const bulkBar =
    n > 0 ? (
      <div
        data-community-posts-bulk-bar="1"
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      >
        <span className="text-[13px] font-semibold text-sam-fg">{t("admin_community_posts_n_selected", { n })}</span>
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={canContent ? undefined : t("admin_community_posts_perm_board_manage")}
          onClick={() => setSheet("restore")}
          data-community-bulk="restore"
        >
          {t("admin_community_posts_action_restore")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={canContent ? undefined : t("admin_community_posts_perm_board_manage")}
          onClick={() => setSheet("hide")}
          data-community-bulk="hide"
        >
          {t("admin_community_posts_hide_btn")}
        </AdminActionButton>
        {/* 삭제 = 상태 변경(「다시 공개」로 복구 가능) — danger 는 영구 삭제만 */}
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={canContent ? undefined : t("admin_community_posts_perm_board_manage")}
          onClick={() => setSheet("soft_delete")}
          data-community-bulk="soft_delete"
          data-admin-mgmt-row-soft-delete="1"
        >
          {t("admin_community_posts_action_deleted")}
        </AdminActionButton>
        {hardAllowed ? (
          <AdminActionButton
            variant="danger"
            className="ring-2 ring-sam-danger/60"
            disabled={!isSuperAdmin}
            title={isSuperAdmin ? t("admin_community_posts_hard_delete_hint") : t("admin_community_posts_super_admin_only")}
            onClick={() => setSheet("hard_delete")}
            data-community-bulk="hard_delete"
            data-admin-mgmt-hard-delete="1"
          >
            {t("admin_community_posts_hard_delete_btn")}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="quiet" onClick={() => selection.clear()}>
          {t("admin_community_posts_clear_selection")}
        </AdminActionButton>
      </div>
    ) : null;

  const filterBar = (
    <CommunityFilterBar lq={lq} searchPlaceholder={t("admin_community_posts_search_placeholder")} pending={loading}>
      <CommunityFilterField label={t("admin_community_posts_filter_category")}>
        <CommunitySelect
          value={topicSlug}
          onChange={(v) => lq.setExtra("topicSlug", v)}
          options={[
            { value: "", label: t("common_all_category") },
            ...topics.map((topic) => ({ value: topic.slug, label: topic.is_active ? topic.name : t("admin_community_posts_topic_inactive", { name: topic.name }) })),
            ...(topicSlug && !topics.some((t) => t.slug === topicSlug) ? [{ value: topicSlug, label: topicSlug }] : []),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label={t("admin_community_posts_filter_origin")}>
        <CommunitySelect value={origin} onChange={(v) => lq.setExtra("origin", v)} options={ORIGIN_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} />
      </CommunityFilterField>
      {userId ? (
        <span className="flex h-10 items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 text-[12px] text-sam-fg">
          {t("admin_community_posts_author_chip", { author: authorChipLabel })}
          <AdminActionButton
            variant="quiet"
            size="sm"
            className="ml-1 h-auto! px-1!"
            onClick={() => lq.patch({ extras: { userId: "", authorId: "" } })}
          >
            {t("admin_community_posts_clear_filter")}
          </AdminActionButton>
        </span>
      ) : null}
      {postId ? (
        <span className="flex h-10 items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 text-[12px] text-sam-fg">
          {t("admin_community_posts_single_post_only")}
          <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={() => lq.setExtra("postId", "")}>
            {t("admin_community_posts_clear_filter")}
          </AdminActionButton>
        </span>
      ) : null}
    </CommunityFilterBar>
  );

  const listState: CommunityListLoadState = loadErr
    ? { status: "error", data: total === null && rows.length === 0 ? null : rows, code: loadErr.code, httpStatus: loadErr.status }
    : loading
      ? { status: "loading", data: total === null && rows.length === 0 ? null : rows }
      : { status: "ok", data: rows };
  const mgmtState = loadErr ? "ERROR" : loading ? "LOADING" : rows.length === 0 ? "EMPTY" : "READY";

  const body: ReactNode = (
      <div data-admin-mgmt-state={mgmtState}>
      <CommunityListBody
        state={listState}
        empty={rows.length === 0}
        lq={lq}
        onRetry={reload}
        emptyMessage={t("admin_community_posts_empty")}
        filteredEmptyMessage={t("admin_community_posts_empty_filtered")}
      >
      <CommunityTable head={["", t("admin_community_posts_col_title"), t("admin_community_posts_filter_category"), t("admin_community_posts_col_author"), t("admin_community_posts_col_status"), t("admin_community_posts_col_reports"), t("admin_community_posts_col_reactions"), t("admin_community_posts_col_published_at"), ""]}>
        {rows.map((r) => {
          const id = r.id;
          const title = String(r.title ?? "").trim() || t("admin_community_posts_untitled");
          const slug = String(r.topicSlug ?? r.topic_slug ?? r.category ?? "").trim();
          const reportCount = Number(r.report_count ?? 0);
          const detailHref = communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(id)}`, selfHref);
          return (
            <tr key={id} className="border-b border-sam-border-soft" data-post-id={id}>
              <td className={COMMUNITY_TD}>
                <AdminManagementSelectionCheckbox
                  role="row"
                  checked={selection.isSelected(id)}
                  onToggle={() => selection.toggleRow(id)}
                  aria-label={t("admin_community_posts_select_row_aria", { title: title.slice(0, 24) })}
                />
              </td>
              <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                <Link href={detailHref} className="line-clamp-2 font-medium text-sam-fg hover:underline" title={title}>
                  {title}
                </Link>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {r.is_notice ? <AdminToneBadge tone="progress">{t("admin_community_posts_badge_notice")}</AdminToneBadge> : null}
                  {isPinnedNow(r) ? <AdminToneBadge tone="progress">{t("admin_community_posts_badge_pinned")}</AdminToneBadge> : null}
                  {r.is_sample_data ? <AdminToneBadge tone="warning">{t("admin_feed_posts_sample_badge")}</AdminToneBadge> : null}
                </span>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>
                {slug ? (
                  <AdminActionButton variant="ghost" size="sm" className="h-auto! px-0!" onClick={() => lq.setExtra("topicSlug", slug)}>
                    {topicNameOf(slug)}
                  </AdminActionButton>
                ) : (
                  "—"
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityAuthorCell
                  userId={r.user_id}
                  nickname={r.author_nickname ?? r.author_label}
                  handle={r.author_username}
                  origin={r.origin_kind}
                  sourceName={r.public_attribution_name}
                />
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityStatusBadge domain="content_status" value={r.status ?? "active"} ko={ko} />
              </td>
              <td className={`${COMMUNITY_TD} tabular-nums`}>
                {reportCount > 0 ? (
                  <Link
                    href={`/admin/community/reports?targetId=${encodeURIComponent(id)}`}
                    className="font-semibold text-sam-warning hover:underline"
                  >
                    {formatAdminNumber(reportCount)}
                  </Link>
                ) : (
                  <span className="text-sam-muted">0</span>
                )}
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap text-[12px] text-sam-muted`}>
                {t("admin_community_posts_likes_n", { n: formatAdminNumber(r.like_count ?? 0) })} ·{" "}
                <Link href={`/admin/community/comments?postId=${encodeURIComponent(id)}`} className="hover:underline">
                  {t("admin_community_posts_comments_n", { n: formatAdminNumber(r.comment_count ?? 0) })}
                </Link>{" "}
                · {t("admin_community_posts_views_n", { n: formatAdminNumber(r.view_count ?? 0) })}
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.published_at ?? r.created_at} />
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionLink href={detailHref} variant="ghost" size="sm">
                  {t("admin_community_posts_detail_btn")}
                </AdminActionLink>
              </td>
            </tr>
          );
        })}
      </CommunityTable>
      </CommunityListBody>
      </div>
  );

  const selectAll = rows.length > 0 && !loading && !loadErr ? (
    <label className="flex items-center gap-2 px-1 text-[12px] text-sam-muted">
      <AdminManagementSelectionCheckbox
        role="header"
        state={selection.headerState}
        onToggle={selection.toggleAll}
        aria-label={t("admin_community_select_page_all")}
      />
      {t("admin_community_select_page_all")}
    </label>
  ) : null;

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-posts">
      <CommunityListShell
        title={t("admin_community_posts_title")}
        description={t("admin_community_posts_description")}
        actions={
          <>
            <AdminActionLink href="/admin/community/notices" variant="neutral">
              {t("admin_community_posts_notices_pins_btn")}
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              {t("admin_community_posts_refresh_btn")}
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((x) => ({ value: x.value, label: t(x.labelKey), count: x.value === tab && !loading ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v, status: null, reportedOnly: null, reported: null })}
          />
        }
        filterBar={filterBar}
        bulkBar={
          <>
            {selectAll}
            {bulkBar}
          </>
        }
        footer={<CommunityListPagination lq={lq} total={total} disabled={loading} />}
      >
        {body}
      </CommunityListShell>

      {sheet === "hide" || sheet === "soft_delete" ? (
        <CommunityActionSheet
          title={sheet === "hide" ? t("admin_community_posts_sheet_hide_title", { n }) : t("admin_community_posts_sheet_delete_title", { n })}
          rows={sheetRows}
          notice={
            sheet === "hide"
              ? t("admin_community_posts_sheet_hide_notice")
              : t("admin_community_posts_sheet_delete_notice")
          }
          reason={{ minLength: 2, placeholder: t("admin_community_posts_reason_placeholder") }}
          destructive={sheet === "soft_delete"}
          confirmLabel={sheet === "hide" ? t("admin_community_posts_hide_btn") : t("admin_community_posts_action_deleted")}
          onSubmit={(reason) => runStatusBulk(sheet === "hide" ? "hidden" : "deleted", reason)}
          onClose={() => setSheet(null)}
          onSettled={(kind) => {
            setSheet(null);
            if (kind === "stale") setBanner({ ok: false, code: t("admin_community_post_stale") });
            reload();
          }}
        />
      ) : null}
      {sheet === "restore" ? (
        <CommunityActionSheet
          title={t("admin_community_posts_sheet_restore_title", { n })}
          rows={sheetRows}
          notice={t("admin_community_posts_sheet_restore_notice")}
          reason={null}
          confirmLabel={t("admin_community_posts_action_restore")}
          onSubmit={() => runStatusBulk("active", "")}
          onClose={() => setSheet(null)}
          onSettled={() => {
            setSheet(null);
            reload();
          }}
        />
      ) : null}
      {sheet === "hard_delete" ? (
        <CommunityActionSheet
          title={t("admin_community_posts_sheet_hard_title", { n })}
          rows={sheetRows}
          notice={t("admin_community_posts_sheet_hard_notice")}
          reason={{ minLength: 2, placeholder: t("admin_community_posts_hard_reason_placeholder") }}
          retypeValue={t("admin_community_posts_hard_delete_btn")}
          destructive
          confirmLabel={t("admin_community_posts_hard_delete_btn")}
          onSubmit={(reason) => runHardDelete(reason)}
          onClose={() => setSheet(null)}
          onSettled={() => {
            setSheet(null);
            reload();
          }}
        />
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}
