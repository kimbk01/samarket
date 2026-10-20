"use client";

/**
 * 커뮤니티 게시글 목록 (설계 §C-5 · §C-0-1 목록 화면 틀).
 * 탭(공개/관리자 숨김/삭제됨/신고 있음/전체) · 검색(제목·본문) · 카테고리 · 작성 구분 · 작성자 · 기간(PHT) — 모두 URL.
 * 행에서는 「상세」만, 상태 변경은 선택 후 일괄 처리 줄의 버튼(숨기기 L2 · 다시 공개 L1 · 삭제 L2 · 영구 삭제 L3)으로만 한다.
 * 상태 select 즉시 반영 없음 (C-18).
 */
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityPeriodFilter,
  CommunityResetFilters,
  CommunitySearchInput,
  CommunitySelect,
  CommunityStatusBadge,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import {
  COMMUNITY_HARD_DELETE_BLOCK_KO,
  COMMUNITY_PAGE_SIZE,
  COMMUNITY_POSTS_LIST_PATH,
  COMMUNITY_STALE_MESSAGE,
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
  { value: "active", label: "공개" },
  { value: "hidden", label: "관리자 숨김" },
  { value: "deleted", label: "삭제됨" },
  { value: "reported", label: "신고 있음" },
  { value: "all", label: "전체" },
] as const;

const ORIGIN_OPTIONS = [
  { value: "", label: "전체" },
  { value: "member", label: "회원" },
  { value: "imported", label: "외부 수집" },
  { value: "admin", label: "운영팀" },
];

const FILTER_KEYS = ["q", "topicSlug", "origin", "userId", "authorId", "postId", "period", "from", "to"];

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
  const { language } = useI18n();
  const ko = language !== "en";
  const { get, set, reset, selfHref, page } = useCommunityQueryState();
  const { isSuperAdmin, permissions, loading: meLoading } = useAdminMe();
  const canContent = meLoading || communityAreaAllowed(permissions, "content", isSuperAdmin);
  const policy = COMMUNITY_POST_ENTITY_ACTION_POLICY;
  const { topics } = useCommunityTopicOptions();
  const topicNameOf = useTopicNameOf(topics);

  const tab = resolveTab(get);
  const q = get("q");
  const topicSlug = get("topicSlug");
  const origin = get("origin");
  const userId = get("userId") || get("authorId");
  const postId = get("postId");
  const period = get("period") || (get("from") || get("to") ? "custom" : "");
  const from = get("from");
  const to = get("to");

  const [rows, setRows] = useState<CommunityPostRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);
  const [sheet, setSheet] = useState<BulkKind | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const queryScopeKey = [tab, q, topicSlug, origin, userId, postId, period, from, to, page].join("|");
  const selectableIds = useMemo(() => rows.map((r) => r.id).filter(Boolean), [rows]);
  const selection = useAdminManagementSelection({ queryScopeKey, selectableIds });

  const apiQuery = useMemo(() => {
    const sp = new URLSearchParams({
      limit: String(COMMUNITY_PAGE_SIZE),
      offset: String((page - 1) * COMMUNITY_PAGE_SIZE),
    });
    if (tab === "reported") sp.set("reported", "1");
    else if (tab !== "all") sp.set("status", tab);
    if (q) sp.set("q", q);
    if (topicSlug) sp.set("topicSlug", topicSlug);
    if (origin) sp.set("origin", origin);
    if (userId) sp.set("userId", userId);
    if (postId) sp.set("postId", postId);
    // 기간은 날짜(YYYY-MM-DD, 필리핀)만 넘긴다 — UTC 경계 변환은 서버 (C-28)
    if (period && period !== "custom") sp.set("period", period);
    if (period === "custom" && (from || to)) {
      sp.set("period", "custom");
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
    }
    return sp.toString();
  }, [tab, q, topicSlug, origin, userId, postId, period, from, to, page]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setLoadErr(null);
    void (async () => {
      const r = await communityJsonFetch<{ posts?: CommunityPostRow[]; total?: number | null }>(
        `/api/admin/community/engine/posts?${apiQuery}`
      );
      if (cancel) return;
      if (!r.ok) {
        setLoadErr({ code: r.code, status: r.status });
        setRows([]);
        setTotal(null);
      } else {
        const list = r.json.posts ?? [];
        setRows(list);
        setTotal(
          typeof r.json.total === "number"
            ? r.json.total
            : list.length < COMMUNITY_PAGE_SIZE
              ? (page - 1) * COMMUNITY_PAGE_SIZE + list.length
              : null
        );
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [apiQuery, page, reloadKey]);

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
        else fails.push({ title: String(r.title ?? "").trim() || "제목 없음", reason: communityPostErrorText(res.code) });
      }
      const label = status === "hidden" ? "숨김" : status === "deleted" ? "삭제" : "다시 공개";
      if (fails.length === 0) {
        setBanner({ ok: true, message: `${targets.length}건 모두 ${label} 처리했습니다.` });
      } else {
        const detail = fails
          .slice(0, 5)
          .map((f) => `「${f.title.slice(0, 20)}」 ${f.reason}`)
          .join(" · ");
        setBanner({
          ok: false,
          code: `${targets.length}건 중 ${okCount}건 ${label} 처리 · ${fails.length}건 실패 — ${detail}${fails.length > 5 ? " 외" : ""}`,
        });
      }
      selection.clear();
      reload();
      return { ok: true } as const;
    },
    [reload, selectedRows, selection]
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
        return { ok: false as const, status: 400, code: communityPostErrorText(res.code) };
      }
      const deleted = res.json.deleted ?? [];
      const blocked = res.json.blocked ?? [];
      if (blocked.length === 0) {
        setBanner({ ok: true, message: `${deleted.length}건을 영구 삭제했습니다. 삭제 전 내용은 운영 기록에 보존됩니다.` });
      } else {
        const titleOf = (id: string) =>
          String(selectedRows.find((r) => r.id === id)?.title ?? "").trim().slice(0, 20) || "제목 없음";
        const detail = blocked
          .slice(0, 6)
          .map((b) => `「${titleOf(b.id)}」 ${COMMUNITY_HARD_DELETE_BLOCK_KO[b.reason] ?? "처리 불가"}`)
          .join(" · ");
        setBanner({
          ok: false,
          code: `${ids.length}건 중 ${deleted.length}건 영구 삭제 · ${blocked.length}건 보류 — ${detail}${blocked.length > 6 ? " 외" : ""}`,
        });
      }
      selection.clear();
      reload();
      return { ok: true as const };
    },
    [reload, selectedRows, selection]
  );

  const hasFilters = FILTER_KEYS.some((k) => get(k));
  const authorChipLabel = userId
    ? String(rows.find((r) => r.user_id === userId)?.author_label ?? "").trim() || "선택한 작성자"
    : "";
  const n = selection.selectedCount;
  const hardAllowed = isBulkActionAllowed(policy, "hard_delete");

  const sheetRows = [
    { label: "대상", value: `선택한 게시글 ${n}건` },
    {
      label: "예시",
      value:
        selectedRows
          .slice(0, 3)
          .map((r) => `「${String(r.title ?? "").trim().slice(0, 24) || "제목 없음"}」`)
          .join(", ") + (n > 3 ? " 외" : ""),
    },
  ];

  const bulkBar =
    n > 0 ? (
      <div
        data-community-posts-bulk-bar="1"
        className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
      >
        <span className="text-[13px] font-semibold text-sam-fg">{n}개 선택됨</span>
        <AdminActionButton
          variant="secondary"
          disabled={!canContent}
          title={canContent ? undefined : "권한 필요: 게시판 관리"}
          onClick={() => setSheet("restore")}
          data-community-bulk="restore"
        >
          다시 공개
        </AdminActionButton>
        <AdminActionButton
          variant="secondary"
          className="border-sam-warning text-sam-warning"
          disabled={!canContent}
          title={canContent ? undefined : "권한 필요: 게시판 관리"}
          onClick={() => setSheet("hide")}
          data-community-bulk="hide"
        >
          숨기기
        </AdminActionButton>
        <AdminActionButton
          variant="danger"
          disabled={!canContent}
          title={canContent ? undefined : "권한 필요: 게시판 관리"}
          onClick={() => setSheet("soft_delete")}
          data-community-bulk="soft_delete"
          data-admin-mgmt-row-soft-delete="1"
        >
          삭제
        </AdminActionButton>
        {hardAllowed ? (
          <AdminActionButton
            variant="danger"
            className="ring-2 ring-sam-danger/60"
            disabled={!isSuperAdmin}
            title={isSuperAdmin ? "삭제 상태로 30일이 지난 글만 영구 삭제됩니다" : "최고 관리자만 할 수 있습니다"}
            onClick={() => setSheet("hard_delete")}
            data-community-bulk="hard_delete"
            data-admin-mgmt-hard-delete="1"
          >
            영구 삭제
          </AdminActionButton>
        ) : null}
        <AdminActionButton variant="quiet" onClick={() => selection.clear()}>
          선택 해제
        </AdminActionButton>
      </div>
    ) : null;

  const filters = (
    <>
      <CommunityFilterField label="검색 (제목·본문)">
        <CommunitySearchInput value={q} placeholder="제목 또는 본문" onCommit={(v) => set({ q: v })} />
      </CommunityFilterField>
      <CommunityFilterField label="카테고리">
        <CommunitySelect
          value={topicSlug}
          onChange={(v) => set({ topicSlug: v })}
          options={[
            { value: "", label: "전체 카테고리" },
            ...topics.map((t) => ({ value: t.slug, label: t.is_active ? t.name : `${t.name} (사용 중지)` })),
            ...(topicSlug && !topics.some((t) => t.slug === topicSlug) ? [{ value: topicSlug, label: topicSlug }] : []),
          ]}
        />
      </CommunityFilterField>
      <CommunityFilterField label="작성 구분">
        <CommunitySelect value={origin} onChange={(v) => set({ origin: v })} options={ORIGIN_OPTIONS} />
      </CommunityFilterField>
      <CommunityPeriodFilter
        period={period}
        from={from}
        to={to}
        onChange={(v) => set({ period: v.period, from: v.from, to: v.to })}
      />
      {userId ? (
        <span className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 py-1 text-[12px] text-sam-fg">
          작성자: {authorChipLabel}
          <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={() => set({ userId: null, authorId: null })}>
            해제
          </AdminActionButton>
        </span>
      ) : null}
      {postId ? (
        <span className="flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2.5 py-1 text-[12px] text-sam-fg">
          특정 글 1건만 보기
          <AdminActionButton variant="quiet" size="sm" className="ml-1 h-auto! px-1!" onClick={() => set({ postId: null })}>
            해제
          </AdminActionButton>
        </span>
      ) : null}
      {hasFilters ? <CommunityResetFilters onReset={() => reset(["tab"])} /> : null}
    </>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <div data-admin-mgmt-state="LOADING">
        <AdminLoadingState ko={ko} />
      </div>
    );
  } else if (loadErr) {
    body = (
      <div data-admin-mgmt-state="ERROR">
        <AdminErrorState ko={ko} code={loadErr.code} httpStatus={loadErr.status} onRetry={reload} />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div data-admin-mgmt-state="EMPTY">
        <AdminEmptyState ko={ko} message={hasFilters ? "조건에 맞는 게시글이 없습니다." : "게시글이 없습니다."} />
      </div>
    );
  } else {
    body = (
      <CommunityTable head={["", "제목", "카테고리", "작성자", "상태", "신고", "반응", "게시 시각", ""]}>
        {rows.map((r) => {
          const id = r.id;
          const title = String(r.title ?? "").trim() || "제목 없음";
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
                  aria-label={`선택: ${title.slice(0, 24)}`}
                />
              </td>
              <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                <Link href={detailHref} className="line-clamp-2 font-medium text-sam-fg hover:underline" title={title}>
                  {title}
                </Link>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {r.is_notice ? <AdminToneBadge tone="progress">공지</AdminToneBadge> : null}
                  {isPinnedNow(r) ? <AdminToneBadge tone="progress">상단 고정</AdminToneBadge> : null}
                  {r.is_sample_data ? <AdminToneBadge tone="warning">샘플</AdminToneBadge> : null}
                </span>
              </td>
              <td className={`${COMMUNITY_TD} whitespace-nowrap text-sam-muted`}>
                {slug ? (
                  <AdminActionButton variant="ghost" size="sm" className="h-auto! px-0!" onClick={() => set({ topicSlug: slug })}>
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
                좋아요 {formatAdminNumber(r.like_count ?? 0)} ·{" "}
                <Link href={`/admin/community/comments?postId=${encodeURIComponent(id)}`} className="hover:underline">
                  댓글 {formatAdminNumber(r.comment_count ?? 0)}
                </Link>{" "}
                · 조회 {formatAdminNumber(r.view_count ?? 0)}
              </td>
              <td className={COMMUNITY_TD}>
                <CommunityTimeCell iso={r.published_at ?? r.created_at} />
              </td>
              <td className={COMMUNITY_TD}>
                <AdminActionLink href={detailHref} variant="neutral">
                  상세
                </AdminActionLink>
              </td>
            </tr>
          );
        })}
      </CommunityTable>
    );
  }

  const selectAll = rows.length > 0 && !loading && !loadErr ? (
    <label className="flex items-center gap-2 px-1 text-[12px] text-sam-muted">
      <AdminManagementSelectionCheckbox
        role="header"
        state={selection.headerState}
        onToggle={selection.toggleAll}
        aria-label="현재 페이지 전체 선택"
      />
      현재 페이지 전체 선택
    </label>
  ) : null;

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-posts">
      <CommunityListShell
        title="게시글"
        description="회원·외부 수집·운영팀 글을 찾아보고 숨김·삭제·복구합니다."
        actions={
          <>
            <AdminActionLink href="/admin/community/notices" variant="neutral">
              공지·고정
            </AdminActionLink>
            <AdminActionButton variant="neutral" onClick={reload} disabled={loading}>
              새로고침
            </AdminActionButton>
          </>
        }
        banner={<AdminResultBanner ko={ko} result={banner} onClose={() => setBanner(null)} />}
        tabs={
          <CommunityTabs
            tabs={TABS.map((t) => ({ ...t, count: t.value === tab && !loading ? total : null }))}
            value={tab}
            onChange={(v) => set({ tab: v, status: null, reportedOnly: null, reported: null })}
          />
        }
        filters={filters}
        bulkBar={
          <>
            {selectAll}
            {bulkBar}
          </>
        }
        footer={
          !loading && !loadErr && rows.length > 0 ? (
            <CommunityPagination
              page={page}
              pageSize={COMMUNITY_PAGE_SIZE}
              total={total}
              onPage={(p) => set({ page: p > 1 ? p : null }, { keepPage: true })}
            />
          ) : null
        }
      >
        {body}
      </CommunityListShell>

      {sheet === "hide" || sheet === "soft_delete" ? (
        <CommunityActionSheet
          title={sheet === "hide" ? `게시글 ${n}건 숨기기` : `게시글 ${n}건 삭제`}
          rows={sheetRows}
          notice={
            sheet === "hide"
              ? "숨긴 글은 작성자에게만 보이고 안내 문구가 표시됩니다. 작성자에게 알림이 갑니다. 「다시 공개」로 되돌릴 수 있습니다."
              : "삭제한 글은 아무도 볼 수 없습니다. 작성자에게 알림이 갑니다. 「다시 공개」로 복구할 수 있습니다."
          }
          reason={{ minLength: 2, placeholder: "예: 광고성 게시글, 욕설 포함" }}
          destructive={sheet === "soft_delete"}
          confirmLabel={sheet === "hide" ? "숨기기" : "삭제"}
          onSubmit={(reason) => runStatusBulk(sheet === "hide" ? "hidden" : "deleted", reason)}
          onClose={() => setSheet(null)}
          onSettled={(kind) => {
            setSheet(null);
            if (kind === "stale") setBanner({ ok: false, code: COMMUNITY_STALE_MESSAGE });
            reload();
          }}
        />
      ) : null}
      {sheet === "restore" ? (
        <CommunityActionSheet
          title={`게시글 ${n}건 다시 공개`}
          rows={sheetRows}
          notice="선택한 글을 다시 모두에게 보이게 합니다."
          reason={null}
          confirmLabel="다시 공개"
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
          title={`게시글 ${n}건 영구 삭제`}
          rows={sheetRows}
          notice="되돌릴 수 없습니다. 삭제 상태로 30일이 지났고, 처리 안 된 신고·홍보·연결된 모임이 없는 글만 지워집니다. 조건에 맞지 않는 글은 건너뛰고 이유를 알려 드립니다. 지우기 전 내용은 운영 기록에 보존됩니다."
          reason={{ minLength: 2, placeholder: "영구 삭제 사유" }}
          retypeValue="영구 삭제"
          destructive
          confirmLabel="영구 삭제"
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
