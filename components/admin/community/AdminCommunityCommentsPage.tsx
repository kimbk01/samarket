"use client";

/**
 * 커뮤니티 댓글 (설계 §C-7 · §C-0-1 목록 화면 틀).
 * 탭(공개/관리자 숨김/삭제됨/신고 있음/전체) · 검색(내용·작성자 닉네임·ID) · 카테고리 · 유형(댓글/답글) · 작성자 · 게시글 · 기간(PHT) — 모두 URL.
 * 필터 바 = `CommunityFilterBar`(AdminFilterBar) · 페이지 = `CommunityListPagination`(20/50/100, URL size).
 * 상태 select 즉시 반영 없음 (C-18). 버튼: 숨기기 L2 · 다시 공개 L1 · 삭제 L2 — expectedStatus(CAS)+사유 전송.
 * 답글은 부모 댓글을 함께 보여 준다. 삭제는 상태 변경만(복구 가능) — 영구 삭제 없음.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useAdminMe } from "@/hooks/useAdminMe";
import {
  AdminManagementSelectionCheckbox,
  AdminManagementSurfaceRoot,
  useAdminManagementSelection,
} from "@/components/admin/management";
import { COMMUNITY_COMMENT_ENTITY_ACTION_POLICY, isBulkActionAllowed } from "@/lib/admin/management";
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
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminCommunityLabel } from "@/lib/admin/status-labels/community-status-labels";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import {
  communityAdminListPeriodParams,
  parseCommunityAdminPeriod,
} from "@/lib/admin/community-admin/community-admin-period";
import {
  COMMUNITY_POSTS_LIST_PATH,
  communityJsonFetch,
  communityPostErrorText,
  useCommunityTopicOptions,
  useTopicNameOf,
  type CommunityBanner,
} from "@/components/admin/community/posts/community-post-admin-shared";

type CommunityCommentRow = {
  id: string;
  post_id?: string | null;
  parent_id?: string | null;
  user_id?: string | null;
  content?: string | null;
  status?: string | null;
  like_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  post_title?: string | null;
  topic_slug?: string | null;
  author_label?: string | null;
  author_nickname?: string | null;
  author_username?: string | null;
  kind?: "comment" | "reply" | null;
  parent_content_preview?: string | null;
  report_count?: number | null;
  reported?: boolean | null;
};

type Action = { kind: "hide" | "restore" | "delete"; ids: string[] };

const TABS = [
  { value: "active", labelKey: "admin_community_comments_tab_active" },
  { value: "hidden", labelKey: "admin_community_comments_tab_hidden" },
  { value: "deleted", labelKey: "admin_community_comments_tab_deleted" },
  { value: "reported", labelKey: "admin_community_comments_tab_reported" },
  { value: "all", labelKey: "admin_community_comments_tab_all" },
] as const;

/** 조회 조건 추가 키 (URL) — 탭(`tab`)과 옛 딥링크 키(`status`·`reported`)는 탭 쪽이 관리 */
const COMMENT_EXTRAS = ["topicSlug", "type", "userId", "postId", "commentId"] as const;

const NEXT_STATUS: Record<Action["kind"], "hidden" | "active" | "deleted"> = {
  hide: "hidden",
  restore: "active",
  delete: "deleted",
};
const ACTION_LABEL: Record<Action["kind"], MessageKey> = {
  hide: "admin_community_comments_action_hide",
  restore: "admin_community_comments_action_restore",
  delete: "admin_community_comments_action_delete",
};

export function AdminCommunityCommentsPage() {
  const { t: tr, language } = useI18n();
  const ko = language !== "en";
  const { sp: searchParams, set } = useCommunityQueryState();
  const lq = useCommunityListQuery({ extras: COMMENT_EXTRAS });
  const { selfHref } = lq;
  const page = lq.query.page;
  const pageSize = lq.query.size;
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const noPermTitle = canContent ? undefined : tr("admin_community_comments_no_perm");
  const policy = COMMUNITY_COMMENT_ENTITY_ACTION_POLICY;
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);

  const commentId = searchParams.get("commentId") ?? "";
  const typeFilter = searchParams.get("type") ?? "";
  const reportedParam = searchParams.get("reported") ?? "";
  const tabParam = searchParams.get("tab") ?? "";
  const statusParam = searchParams.get("status") ?? "";
  const tab = TABS.some((t) => t.value === tabParam)
    ? tabParam
    : reportedParam === "only"
      ? "reported"
      : ["active", "hidden", "deleted"].includes(statusParam)
        ? statusParam
        : "all";
  const qParam = lq.query.q;
  const postId = lq.query.extras.postId;
  const topicSlug = lq.query.extras.topicSlug;
  const userId = lq.query.extras.userId;
  const from = lq.query.from;
  const to = lq.query.to;
  const period = lq.legacyPeriod;

  const [rows, setRows] = useState<CommunityCommentRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [topicFilterTruncated, setTopicFilterTruncated] = useState(false);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const queryScopeKey = [tab, qParam, typeFilter, postId, topicSlug, userId, commentId, period, from, to, page, pageSize].join("|");
  const selectableIds = useMemo(() => rows.map((r) => r.id).filter(Boolean), [rows]);
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  const apiQuery = useMemo(() => {
    const q = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (commentId) q.set("commentId", commentId);
    if (qParam) q.set("q", qParam);
    if (postId) q.set("postId", postId);
    if (topicSlug) q.set("topicSlug", topicSlug);
    if (userId) q.set("userId", userId);
    if (tab === "reported") q.set("reported", "only");
    else if (tab !== "all") q.set("status", tab);
    if (typeFilter === "comment" || typeFilter === "reply") q.set("type", typeFilter);
    // 기간: 마닐라 날짜 경계를 공용 파서로 UTC 로 바꿔 넘긴다 (브라우저 시간대·new Date("YYYY-MM-DD") 사용 안 함)
    const periodParams = communityAdminListPeriodParams({ period, from, to });
    if (periodParams.period !== "all") {
      const range = parseCommunityAdminPeriod(periodParams);
      if (range.ok && range.fromIso && range.toIso) {
        q.set("createdFrom", range.fromIso);
        q.set("createdTo", new Date(Date.parse(range.toIso) - 1).toISOString());
      }
    }
    return q.toString();
  }, [commentId, qParam, postId, topicSlug, userId, tab, typeFilter, period, from, to, page, pageSize]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      const r = await communityJsonFetch<{
        comments?: CommunityCommentRow[];
        total?: number | null;
        topicFilterTruncated?: boolean;
      }>(
        `/api/admin/community/engine/comments?${apiQuery}`
      );
      if (cancel) return;
      if (!r.ok) {
        // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
        setLoadErr({ code: r.code, status: r.status });
      } else {
        const list = r.json.comments ?? [];
        setLoadErr(null);
        setRows(list);
        setTotal(typeof r.json.total === "number" ? r.json.total : null);
        setTopicFilterTruncated(r.json.topicFilterTruncated === true);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [apiQuery, reloadKey, lq.refreshKey]);

  useEffect(() => {
    if (!commentId || loading) return;
    const el = rowRefs.current[commentId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("bg-sam-warning-soft");
    const timeoutId = window.setTimeout(() => el.classList.remove("bg-sam-warning-soft"), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [commentId, loading, rows]);

  const runAction = useCallback(
    async (a: Action, reason: string) => {
      const status = NEXT_STATUS[a.kind];
      const targets = rows.filter((r) => a.ids.includes(r.id));
      let okCount = 0;
      let stale = 0;
      const fails: string[] = [];
      for (const r of targets) {
        const res = await communityJsonFetch(`/api/admin/community/engine/comments/${encodeURIComponent(r.id)}`, {
          method: "PATCH",
          body: { status, expectedStatus: r.status ?? "active", ...(reason ? { reason } : {}) },
        });
        if (res.ok) okCount += 1;
        else if (res.code === "conflict") stale += 1;
        else fails.push(communityPostErrorText(res.code, language));
      }
      // 한 건 처리에서 충돌이면 시트가 「다른 관리자가 먼저」로 정리한다
      if (targets.length === 1 && stale === 1) return { ok: false as const, status: 409, code: "conflict" };
      const label = tr(ACTION_LABEL[a.kind]);
      if (okCount === targets.length) {
        setBanner({ ok: true, message: tr("admin_community_comments_bulk_done", { n: targets.length, label }) });
      } else {
        const parts = [
          stale ? tr("admin_community_comments_bulk_stale", { n: stale }) : "",
          fails.length ? tr("admin_community_comments_bulk_failed", { n: fails.length, list: [...new Set(fails)].join(", ") }) : "",
        ].filter(Boolean);
        setBanner({ ok: false, code: tr("admin_community_comments_bulk_partial", { total: targets.length, ok: okCount, label, details: parts.join(" · ") }) });
      }
      selection.clear();
      reload();
      return { ok: true as const };
    },
    [language, reload, rows, selection, tr]
  );

  const n = selection.selectedCount;
  const postTitleChip = postId ? String(rows.find((r) => r.post_id === postId)?.post_title ?? "").trim() || tr("admin_community_comments_selected_post") : "";
  const authorChip = userId ? String(rows.find((r) => r.user_id === userId)?.author_label ?? "").trim() || tr("admin_community_comments_selected_author") : "";

  const chip = (label: string, onClear: () => void) => (
    <span className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 py-1 text-[12px] text-sam-fg">
      {label}
      <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={onClear}>
        {tr("admin_community_comments_filter_clear")}
      </AdminActionButton>
    </span>
  );

  const filterBar = (
    <CommunityFilterBar lq={lq} searchPlaceholder={tr("admin_community_comments_search_placeholder")} pending={loading}>
      <CommunityFilterField label={tr("admin_community_comments_filter_topic")}>
        <CommunitySelect
          value={topicSlug}
          onChange={(v) => lq.setExtra("topicSlug", v)}
          options={[
            { value: "", label: tr("admin_community_comments_all_topics") },
            ...topics.map((t) => ({ value: t.slug, label: t.name })),
            ...(topicSlug && !topics.some((t) => t.slug === topicSlug) ? [{ value: topicSlug, label: topicSlug }] : []),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label={tr("admin_community_comments_filter_kind")}>
        <CommunitySelect
          value={typeFilter}
          onChange={(v) => lq.setExtra("type", v)}
          options={[
            { value: "", label: tr("admin_community_comments_tab_all") },
            { value: "comment", label: tr("admin_community_target_type_comment") },
            { value: "reply", label: tr("admin_community_target_type_reply") },
          ]}
        />
      </CommunityFilterField>
      {postId ? chip(tr("admin_community_comments_chip_post", { title: postTitleChip.slice(0, 24) }), () => lq.setExtra("postId", "")) : null}
      {userId ? chip(tr("admin_community_comments_chip_author", { name: authorChip }), () => lq.setExtra("userId", "")) : null}
      {commentId ? chip(tr("admin_community_comments_chip_single"), () => lq.setExtra("commentId", "")) : null}
    </CommunityFilterBar>
  );

  const rowButtons = (r: CommunityCommentRow) => {
    const status = String(r.status ?? "active");
    return (
      <span className="flex flex-wrap gap-1">
        {status === "active" ? (
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={!canContent}
            title={noPermTitle}
            onClick={() => setAction({ kind: "hide", ids: [r.id] })}
          >
            {tr("admin_community_comments_row_hide")}
          </AdminActionButton>
        ) : (
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={!canContent}
            title={noPermTitle}
            onClick={() => setAction({ kind: "restore", ids: [r.id] })}
          >
            {tr("admin_community_comments_row_restore")}
          </AdminActionButton>
        )}
        {status !== "deleted" ? (
          // 삭제 = 상태 변경(복구 가능) — danger 아님
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={!canContent}
            title={noPermTitle}
            onClick={() => setAction({ kind: "delete", ids: [r.id] })}
            data-admin-mgmt-row-soft-delete="1"
          >
            {tr("admin_community_comments_row_delete")}
          </AdminActionButton>
        ) : null}
      </span>
    );
  };

  const listState: CommunityListLoadState = loadErr
    ? { status: "error", data: total === null && rows.length === 0 ? null : rows, code: loadErr.code, httpStatus: loadErr.status }
    : loading
      ? { status: "loading", data: total === null && rows.length === 0 ? null : rows }
      : { status: "ok", data: rows };
  const body: ReactNode = (
    <CommunityListBody
      state={listState}
      empty={rows.length === 0}
      lq={lq}
      onRetry={reload}
      emptyMessage={tr("admin_community_comments_list_empty")}
      filteredEmptyMessage={tr("admin_community_comments_filtered_empty")}
    >
      <CommunityTable head={[
          "",
          tr("admin_community_comments_th_type"),
          tr("admin_community_comments_col_comment"),
          tr("admin_community_comments_th_post"),
          tr("admin_community_comments_col_author"),
          tr("admin_community_comments_col_status"),
          tr("admin_community_comments_th_reports"),
          tr("admin_community_comments_col_created"),
          "",
        ]}>
        {rows.map((r) => {
          const id = r.id;
          const pid = String(r.post_id ?? "");
          const content = String(r.content ?? "");
          const kind = r.kind === "reply" || Boolean(String(r.parent_id ?? "").trim()) ? "reply" : "comment";
          const reportCount = Number(r.report_count ?? 0);
          return (
            <tr
              key={id}
              ref={(el) => {
                rowRefs.current[id] = el;
              }}
              className="border-b border-sam-border-soft transition-colors duration-500"
              data-comment-id={id}
              data-comment-kind={kind}
            >
              <td className={COMMUNITY_TD}>
                <AdminManagementSelectionCheckbox
                  role="row"
                  checked={selection.isSelected(id)}
                  onToggle={() => selection.toggleRow(id)}
                  aria-label={tr("admin_community_comments_select_aria", { text: content.slice(0, 24) })}
                />
              </td>
              <td className={COMMUNITY_TD}>
                <AdminToneBadge tone={kind === "reply" ? "progress" : "neutral"}>
                  {kind === "reply" ? tr("admin_community_target_type_reply") : tr("admin_community_target_type_comment")}
                </AdminToneBadge>
              </td>
              <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                {kind === "reply" && r.parent_content_preview ? (
                  <p className="mb-1 line-clamp-1 text-[12px] text-sam-muted" title={r.parent_content_preview}>
                    {tr("admin_community_comments_parent_preview", { text: r.parent_content_preview })}
                  </p>
                ) : null}
                <p className="line-clamp-3 whitespace-pre-wrap text-sam-fg" title={content}>
                  {content || "—"}
                </p>
              </td>
              <td className={`${COMMUNITY_TD} max-w-[14rem]`}>
                {pid ? (
                  <Link
                    href={communityDetailHref(`${COMMUNITY_POSTS_LIST_PATH}/${encodeURIComponent(pid)}`, selfHref)}
                    className="line-clamp-2 font-medium text-sam-info hover:underline"
                  >
                    {String(r.post_title ?? "").trim() || tr("admin_community_comments_no_title")}
                  </Link>
                ) : (
                  "—"
                )}
                {r.topic_slug ? <span className="block text-[12px] text-sam-muted">{topicNameOf(r.topic_slug)}</span> : null}
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityAuthorCell userId={r.user_id} nickname={r.author_nickname ?? r.author_label} handle={r.author_username} />
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
                    {reportCount}
                  </Link>
                ) : (
                  <span className="text-sam-muted">0</span>
                )}
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.created_at} />
              </td>
              <td className={COMMUNITY_TD}>{rowButtons(r)}</td>
            </tr>
          );
        })}
      </CommunityTable>
    </CommunityListBody>
  );

  const bulkBar =
    n > 0 ? (
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
        <span className="text-[13px] font-semibold text-sam-fg">{tr("admin_community_comments_selected_n", { n })}</span>
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={noPermTitle}
          onClick={() => setAction({ kind: "restore", ids: [...selection.selected] })}
        >
          {tr("admin_community_comments_bulk_restore")}
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={noPermTitle}
          onClick={() => setAction({ kind: "hide", ids: [...selection.selected] })}
        >
          {tr("admin_community_comments_bulk_hide")}
        </AdminActionButton>
        {isBulkActionAllowed(policy, "soft_delete") ? (
          <AdminActionButton
            variant="secondary"
            disabled={!canContent}
            title={noPermTitle}
            onClick={() => setAction({ kind: "delete", ids: [...selection.selected] })}
          >
            {tr("admin_community_comments_bulk_delete")}
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="quiet" onClick={() => selection.clear()}>
          {tr("admin_community_comments_bulk_clear_selection")}
        </AdminActionButton>
      </div>
    ) : null;

  const actionRows = action
    ? (() => {
        const targets = rows.filter((r) => action.ids.includes(r.id));
        const first = targets[0];
        return [
          {
            label: tr("admin_community_comments_row_target"),
            value: targets.length === 1 ? tr("admin_community_comments_row_one") : tr("admin_community_comments_row_selected", { n: targets.length }),
          },
          {
            label: tr("admin_community_comments_row_content"),
            value: tr(targets.length > 1 ? "admin_community_comments_row_quote_more" : "admin_community_comments_row_quote", {
              text: String(first?.content ?? "").slice(0, 60),
            }),
          },
          ...(targets.length === 1 && first
            ? [{ label: tr("admin_community_comments_row_status"), value: adminCommunityLabel("content_status", first.status, ko).label }]
            : []),
        ];
      })()
    : [];

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-comments">
      <CommunityListShell
        title={tr("admin_community_comments_page_title")}
        description={tr("admin_community_comments_desc")}
        actions={
          <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
            {tr("admin_community_comments_reload")}
          </AdminActionButton>
        }
        banner={
          <>
            <AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />
            {topicFilterTruncated ? (
              <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] text-sam-warning">
                {tr("admin_community_topic_filter_truncated")}
              </div>
            ) : null}
          </>
        }
        tabs={
          <CommunityTabs
            tabs={TABS.map((t) => ({ value: t.value, label: tr(t.labelKey), count: t.value === tab && !commentId && !loading && !loadErr ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v, status: null, reported: null })}
          />
        }
        filterBar={filterBar}
        bulkBar={
          <>
            {rows.length > 0 && !loading ? (
              <label className="flex items-center gap-2 px-1 text-[12px] text-sam-muted">
                <AdminManagementSelectionCheckbox
                  role="header"
                  state={selection.headerState}
                  onToggle={selection.toggleAll}
                  aria-label={tr("admin_community_select_page_all")}
                />
                {tr("admin_community_select_page_all")}
              </label>
            ) : null}
            {bulkBar}
          </>
        }
        footer={<CommunityListPagination lq={lq} total={total} disabled={loading} />}
      >
        {body}
      </CommunityListShell>

      {action ? (
        <CommunityActionSheet
          title={tr("admin_community_comments_sheet_title", { action: tr(ACTION_LABEL[action.kind]) })}
          rows={actionRows}
          notice={
            action.kind === "hide"
              ? tr("admin_community_comments_notice_hide")
              : action.kind === "delete"
                ? tr("admin_community_comments_notice_delete")
                : tr("admin_community_comments_notice_restore")
          }
          reason={action.kind === "restore" ? null : { minLength: 2, placeholder: tr("admin_community_comments_reason_placeholder") }}
          destructive={action.kind === "delete"}
          confirmLabel={tr(ACTION_LABEL[action.kind])}
          onSubmit={(reason) => runAction(action, reason)}
          onClose={() => setAction(null)}
          onSettled={(k) => {
            setAction(null);
            if (k === "stale") setBanner({ ok: false, code: tr("admin_community_post_stale") });
            reload();
          }}
        />
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}
