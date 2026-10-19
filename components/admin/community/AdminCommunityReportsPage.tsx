"use client";

/**
 * 신고 처리함 `/admin/community/reports` (설계 §C-2 · 목록 화면 틀 §C-0-1).
 * ① 제목·설명 ② 상태 탭(묶음 수) ③ 검색·유형·기간(PHT)·상세 필터·초기화 ⑤ 대상별 묶음 표 ⑥ 서버 페이지네이션(50).
 * 같은 대상(target_type+target_id)의 신고는 1행 「신고 n건」 — 행을 누르면 오른쪽 처리 시트(공용 처리 패널).
 * 탭·필터·페이지는 URL 에 있다 → 상세 페이지 다녀와도 그대로.
 * 이 원장은 community_reports 만 — 모임 신고는 링크 탭으로 이동, 회원·사장님 문의는 고객지원.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminMe } from "@/hooks/useAdminMe";
import type {
  CommunityReportGroupList,
  CommunityReportGroupRow,
  CommunityReportInboxTab,
  CommunityReportTargetFilter,
} from "@/lib/community-feed/admin-community-reports";
import { ARO_IA_001_OWNERS, ARO_IA_001_SUPPORT_PATH } from "@/lib/admin/aro-ia-001-community-common-links";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";
import { adminCommunityLabel, splitCommunityReportReason } from "@/lib/admin/status-labels/community-status-labels";
import { AdminManagementSurfaceRoot } from "@/components/admin/management";
import {
  COMMUNITY_TD,
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
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState } from "@/components/admin/ui/AdminStateViews";
import {
  CommunityReportDecisionPanel,
  nextReportActions,
} from "@/components/admin/community/reports/CommunityReportDecisionPanel";
import { CommunityReportSourceSwitch } from "@/components/admin/community/reports/CommunityReportSourceSwitch";
import {
  COMMUNITY_STALE_TEXT,
  CommunityBannerView,
  CommunityDrawer,
  communityActionFetch,
  communityAdminErrorText,
  communityPlainExcerpt,
  communityWarningsOf,
  type CommunityBanner,
} from "@/components/admin/community/reports/community-report-admin-shared";

export type AdminCommunityReportsFilters = {
  tab: CommunityReportInboxTab;
  type: CommunityReportTargetFilter;
  q: string;
  targetId: string;
  topicSlug: string;
  reporterId: string;
  authorId: string;
  periodError: string | null;
};

const TAB_LABEL: Record<CommunityReportInboxTab, string> = {
  pending: "처리 대기",
  reviewing: "검토 중",
  resolved: "신고 인정",
  dismissed: "신고 기각",
  all: "전체",
};

const EMPTY_TEXT: Record<CommunityReportInboxTab, string> = {
  pending: "처리할 신고가 없습니다.",
  reviewing: "검토 중인 신고가 없습니다.",
  resolved: "인정한 신고가 없습니다.",
  dismissed: "기각한 신고가 없습니다.",
  all: "신고가 없습니다.",
};

export function AdminCommunityReportsPage({
  result,
  filters,
  pageSize,
  highlightId = "",
}: {
  result: CommunityReportGroupList;
  filters: AdminCommunityReportsFilters;
  pageSize: number;
  highlightId?: string;
}) {
  const router = useRouter();
  const { t: tr, language } = useI18n();
  const ko = language !== "en";
  const qs = useCommunityQueryState();
  const { permissions, isSuperAdmin, loading: meLoading } = useAdminMe();
  const canModerate = meLoading || communityAreaAllowed(permissions, "moderation", isSuperAdmin);
  const [openId, setOpenId] = useState<string>(highlightId.trim());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<CommunityBanner>(null);

  const hasDetailFilter = Boolean(filters.targetId || filters.authorId || filters.reporterId || filters.topicSlug);

  const targetLabel = (g: CommunityReportGroupRow) => {
    if (g.target.target_type === "user") return "회원";
    const displayTarget = g.target.display_target ?? (g.target.target_type === "comment" ? "comment" : "post");
    return displayTarget === "reply"
      ? tr("admin_community_target_type_reply")
      : displayTarget === "comment"
        ? tr("admin_community_target_type_comment")
        : tr("admin_community_target_type_post");
  };

  /** 「검토 시작」 L0 — 대표 신고 open → reviewing */
  const startReview = async (g: CommunityReportGroupRow) => {
    setBusyKey(g.key);
    setBanner(null);
    const { result: r, json } = await communityActionFetch(
      `/api/admin/community-reports/${encodeURIComponent(g.primary_report_id)}`,
      "PATCH",
      { status: "reviewing", expectedStatus: g.primary_status }
    );
    setBusyKey(null);
    router.refresh();
    if (r.ok) {
      const warn = communityWarningsOf(json);
      setBanner({ tone: warn.length ? "warning" : "success", text: "검토를 시작했습니다.", extra: warn });
    } else if (r.status === 409) {
      setBanner({ tone: "warning", text: COMMUNITY_STALE_TEXT });
    } else {
      setBanner({ tone: "error", text: communityAdminErrorText(r.code, ko) });
    }
  };

  const page = qs.page;
  const groups = result.groups;

  return (
    <AdminManagementSurfaceRoot wave="w3" proofSurface="community-reports">
      <span className="sr-only" data-admin-community-reports-owner={ARO_IA_001_OWNERS.report} />
      <CommunityListShell
        title="신고 처리함"
        description="회원이 신고한 게시글·댓글·회원을 확인하고 인정 또는 기각합니다."
        actions={
          <>
            <AdminActionLink href={ARO_IA_001_SUPPORT_PATH} variant="quiet" data-admin-cross-link="community-report-to-support">
              회원 문의는 고객지원
            </AdminActionLink>
            <AdminActionButton variant="secondary" onClick={() => router.refresh()}>
              새로고침
            </AdminActionButton>
          </>
        }
        banner={
          <>
            <CommunityReportSourceSwitch current="feed" />
            <CommunityBannerView banner={banner} onClose={() => setBanner(null)} />
            {filters.periodError ? (
              <CommunityBannerView
                banner={{ tone: "error", text: communityAdminErrorText(filters.periodError, ko) }}
              />
            ) : null}
          </>
        }
        tabs={
          <CommunityTabs
            value={filters.tab}
            onChange={(v) => qs.set({ status: v, pending: null })}
            tabs={(Object.keys(TAB_LABEL) as CommunityReportInboxTab[]).map((k) => ({
              value: k,
              label: TAB_LABEL[k],
              count: result.ok ? result.counts[k] : null,
            }))}
          />
        }
        filters={
          <>
            <CommunityFilterField label="검색">
              <CommunitySearchInput
                value={filters.q}
                onCommit={(v) => qs.set({ q: v })}
                placeholder="대상 제목·내용·닉네임"
              />
            </CommunityFilterField>
            <CommunityFilterField label="신고 대상">
              <CommunitySelect
                value={filters.type}
                onChange={(v) => qs.set({ type: v })}
                options={[
                  { value: "", label: "전체" },
                  { value: "post", label: tr("admin_community_target_type_post") },
                  { value: "comment", label: tr("admin_community_target_type_comment") },
                  { value: "user", label: "회원" },
                ]}
              />
            </CommunityFilterField>
            <CommunityPeriodFilter
              period={qs.get("period")}
              from={qs.get("from")}
              to={qs.get("to")}
              onChange={(v) => qs.set({ period: v.period, from: v.from, to: v.to })}
            />
            {hasDetailFilter ? (
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                {filters.targetId ? (
                  <FilterChip label="특정 대상의 신고" onClear={() => qs.set({ targetId: null })} />
                ) : null}
                {filters.authorId ? (
                  <FilterChip label="특정 작성자가 받은 신고" onClear={() => qs.set({ authorId: null })} />
                ) : null}
                {filters.reporterId ? (
                  <FilterChip label="특정 회원이 낸 신고" onClear={() => qs.set({ reporterId: null })} />
                ) : null}
                {filters.topicSlug ? (
                  <FilterChip label="특정 카테고리" onClear={() => qs.set({ topicSlug: null })} />
                ) : null}
              </div>
            ) : null}
            <CommunityResetFilters onReset={() => qs.reset(["status"])} />
          </>
        }
        footer={
          result.ok && result.total > 0 ? (
            <>
              <CommunityPagination
                page={page}
                pageSize={pageSize}
                total={result.total}
                onPage={(p) => qs.set({ page: p > 1 ? p : null })}
              />
              {result.truncated ? (
                <p className="px-1 text-[12px] text-sam-muted">최근 신고 5,000건 기준으로 묶었습니다. 기간을 좁혀 확인하세요.</p>
              ) : null}
            </>
          ) : null
        }
      >
        {!result.ok ? (
          <AdminErrorState ko={ko} code="load_failed" onRetry={() => router.refresh()} />
        ) : groups.length === 0 ? (
          <AdminEmptyState ko={ko} message={EMPTY_TEXT[filters.tab]} />
        ) : (
          <CommunityTable head={["대상", "작성자", "신고", "최근 사유", "최근 신고", "상태", "처리"]}>
            {groups.map((g) => {
              const t = g.target;
              const displayTarget = t.display_target ?? (t.target_type === "comment" ? "comment" : "post");
              const title =
                t.target_type === "user"
                  ? t.author_label ?? "회원"
                  : displayTarget === "post"
                    ? t.post_title?.trim() || tr("admin_posts_no_title")
                    : communityPlainExcerpt(t.target_content_preview, 60) || "내용 없음";
              const { code, text } = splitCommunityReportReason(g.latest_reason);
              const reason = adminCommunityLabel("report_reason", code, ko);
              const canReview = canModerate && nextReportActions(g.primary_status, isSuperAdmin).includes("review");
              const open = () => setOpenId(g.primary_report_id);
              return (
                <tr
                  key={g.key}
                  onClick={open}
                  className={`cursor-pointer border-b border-sam-border-soft hover:bg-sam-app ${
                    openId === g.primary_report_id ? "bg-amber-50" : ""
                  }`}
                >
                  <td className={COMMUNITY_TD}>
                    <span className="flex max-w-[22rem] flex-col gap-0.5">
                      <span className="sam-text-xxs font-semibold text-sam-muted">{targetLabel(g)}</span>
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-medium text-sam-fg">{title}</span>
                        {t.moderation_href ? (
                          <Link
                            href={communityDetailHref(t.moderation_href, qs.selfHref)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 sam-text-xxs text-sky-800 hover:underline"
                          >
                            {t.target_type === "user" ? "회원 보기" : "원문 관리"}
                          </Link>
                        ) : null}
                      </span>
                      {displayTarget !== "post" && t.post_title ? (
                        <span className="truncate sam-text-xxs text-sam-muted">글: {t.post_title}</span>
                      ) : null}
                      {t.target_found === false ? (
                        <span className="sam-text-xxs text-red-800">영구 삭제된 대상</span>
                      ) : t.target_status && t.target_status !== "active" ? (
                        <span>
                          <CommunityStatusBadge domain="content_status" value={t.target_status} ko={ko} />
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                    <CommunityAuthorCell
                      userId={t.post_author_id}
                      nickname={t.author_identity?.nickname}
                      handle={t.author_identity?.username}
                    />
                  </td>
                  <td className={`${COMMUNITY_TD} whitespace-nowrap`}>
                    <span className="font-semibold text-sam-fg">{g.report_count}건</span>
                    <span className="block sam-text-xxs text-sam-muted">
                      {tr("admin_feed_reports_col_reporter")} {g.reporter_count}명
                    </span>
                  </td>
                  <td className={COMMUNITY_TD}>
                    <span className="font-medium text-sam-fg">{reason.known ? reason.label : "기타"}</span>
                    {text ? <p className="line-clamp-2 max-w-[16rem] sam-text-xxs text-sam-muted">{text}</p> : null}
                  </td>
                  <td className={COMMUNITY_TD}>
                    <CommunityTimeCell iso={g.latest_at} />
                  </td>
                  <td className={COMMUNITY_TD}>
                    <CommunityStatusBadge domain="report_status" value={g.group_status} ko={ko} />
                  </td>
                  <td className={COMMUNITY_TD} onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1" data-admin-report-cta-state={g.primary_status}>
                      {canReview ? (
                        <AdminActionButton
                          variant="secondary"
                          className="min-h-8 px-2 py-1 text-[12px]"
                          disabled={busyKey === g.key}
                          onClick={() => void startReview(g)}
                        >
                          {busyKey === g.key ? "처리 중" : "검토 시작"}
                        </AdminActionButton>
                      ) : null}
                      <AdminActionButton variant="primary" className="min-h-8 px-2 py-1 text-[12px]" onClick={open}>
                        {g.primary_status === "open" || g.primary_status === "reviewing" ? "처리하기" : "보기"}
                      </AdminActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </CommunityTable>
        )}
      </CommunityListShell>

      {openId ? (
        <CommunityDrawer
          title="신고 처리"
          onClose={() => setOpenId("")}
          footer={
            <div className="flex justify-end">
              <Link
                href={communityDetailHref(`/admin/reports/${encodeURIComponent(openId)}`, qs.selfHref)}
                className="text-[13px] font-medium text-sky-800 hover:underline"
              >
                전체 화면으로 보기
              </Link>
            </div>
          }
        >
          <CommunityReportDecisionPanel key={openId} reportId={openId} onMutated={() => router.refresh()} />
        </CommunityDrawer>
      ) : null}
    </AdminManagementSurfaceRoot>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sam-border bg-sam-app px-2 py-1 text-sam-fg">
      {label}
      <button type="button" onClick={onClear} aria-label={`${label} 해제`} className="font-semibold text-sam-muted">
        ×
      </button>
    </span>
  );
}
