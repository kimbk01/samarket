"use client";

/**
 * 커뮤니티 문의 · 이의신청 (설계 §C-16 · §F-4) — 공통 고객지원 케이스(`support_cases`)의 커뮤니티 범위 화면.
 * 답변·담당자 배정·종결·재오픈은 기존 상담 화면(/admin/support/{id})에서 한다 (재구현하지 않는다).
 * URL: type=appeal · status=waiting|waiting_user|resolved|all · q · reference_type/reference_id · page
 */
import Link from "next/link";
import { useMemo } from "react";
import { adminListOffsetForPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  COMMUNITY_TD,
  CommunityFilterField,
  CommunityListShell,
  CommunityPagination,
  CommunityResetFilters,
  CommunitySearchInput,
  CommunityTable,
  CommunityTabs,
  CommunityTimeCell,
  communityDetailHref,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { supportCategoryLabel } from "@/lib/support/support-display-labels";
import { supportAdminStatusLabel } from "@/lib/support/support-status-label";
import { resolveSupportReferenceAdminHref } from "@/lib/support/support-reference-admin-href";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";

const PAGE_SIZE = 50;

const STATUS_TAB: Record<string, string> = {
  waiting: "ACTIONABLE",
  waiting_user: "WAITING_USER",
  resolved: "RESOLVED",
  all: "ALL",
};

const STATUS_TONE: Record<string, AdminTone> = {
  OPEN: "waiting",
  WAITING_ADMIN: "waiting",
  WAITING_USER: "progress",
  RESOLVED: "success",
  ARCHIVED: "neutral",
};

/** 참조 대상 — 커뮤니티 화면 이름으로 */
const REFERENCE_LABEL: Record<string, string> = {
  COMMUNITY_POST: "게시글",
  COMMUNITY_COMMENT: "댓글",
  COMMUNITY_REPORT: "신고",
  COMMUNITY_SANCTION: "활동 제한",
  POINT_CHARGE_REQUEST: "충전 신청",
  POINT_PROMOTION_ORDER: "게시글 홍보",
  TRADE_POST: "거래글",
  TRADE_CHAT_ROOM: "거래 채팅",
  TRADE_SANCTION: "거래 활동 제한",
};

/** 화면 범위 — 커뮤니티(기본) · 거래 (같은 support_cases, 범위 필터만 다름) */
export type SupportScope = "community" | "trade";

/** 참조는 해당 워크스페이스 화면으로 보낸다 (다른 관리 영역으로 나가지 않게) */
function referenceHref(scope: SupportScope, type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  const enc = encodeURIComponent(id);
  const base = scope === "trade" ? "/admin/trade" : "/admin/community";
  if (type === "POINT_CHARGE_REQUEST") return `${base}/point-charges?status=all&chargeId=${enc}`;
  if (type === "POINT_PROMOTION_ORDER") return scope === "trade" ? "/admin/trade/promotions?tab=all" : "/admin/community/promotions?tab=all";
  if (type === "TRADE_POST") return `/admin/products/${enc}`;
  if (type === "TRADE_SANCTION") return `/admin/trade/restrictions?status=all`;
  if (type === "TRADE_CHAT_ROOM") return `/admin/chats?type=trade&q=${enc}`;
  return resolveSupportReferenceAdminHref(type, id)?.href ?? null;
}

type CaseRow = {
  id: string;
  public_case_no: string;
  requester_user_id: string;
  requester_display_name: string | null;
  category: string;
  subject: string;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
  assigned_admin_id: string | null;
  admin_unread_count: number;
  last_message_at: string;
  created_at: string;
};

type ListResponse = { ok?: boolean; error?: string; cases?: CaseRow[]; total?: number; limit?: number; offset?: number };

export function AdminCommunitySupportPage({ scope = "community" }: { scope?: SupportScope } = {}) {
  const { safeT } = useI18n();
  const q = useCommunityQueryState();
  const appeal = q.get("type") === "appeal";
  const status = q.get("status") in STATUS_TAB ? q.get("status") : "waiting";
  const trade = scope === "trade";

  const params = new URLSearchParams({ group: scope, tab: STATUS_TAB[status] });
  if (appeal) params.set("type", "appeal");
  if (q.get("q")) params.set("search", q.get("q"));
  if (q.get("reference_type") && q.get("reference_id")) {
    params.set("reference_type", q.get("reference_type"));
    params.set("reference_id", q.get("reference_id"));
  }
  // Server-side pagination — `total` 은 현재 필터 기준 정확한 건수.
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(adminListOffsetForPage(q.page, PAGE_SIZE)));
  const { state, reload } = useCommunityAdminJson<ListResponse>(`/api/admin/support/cases?${params.toString()}`);
  const rows = useMemo(() => (state.status === "ok" ? state.data.cases ?? [] : []), [state]);
  const total = state.status === "ok" ? state.data.total ?? rows.length : 0;

  return (
    <CommunityListShell
      title={appeal ? "이의신청" : trade ? "거래 문의" : "커뮤니티 문의"}
      description={
        appeal
          ? "회원이 숨김·삭제·활동 제한에 이의를 제기한 문의입니다. 답변·처리는 상담 화면에서 합니다."
          : trade
            ? "거래글·거래 채팅·거래 제한·거래 홍보 관련 회원 문의입니다. 답변·담당자 배정은 상담 화면에서 합니다."
            : "포인트·충전·홍보·게시물·신고·제재 관련 회원 문의입니다. 답변·담당자 배정은 상담 화면에서 합니다."
      }
      tabs={
        <div className="space-y-2">
          <CommunityTabs
            value={appeal ? "appeal" : "inquiry"}
            onChange={(v) => q.set({ type: v === "appeal" ? "appeal" : null })}
            tabs={[
              { value: "inquiry", label: trade ? "거래 문의" : "커뮤니티 문의" },
              { value: "appeal", label: "이의신청" },
            ]}
          />
          <CommunityTabs
            value={status}
            onChange={(v) => q.set({ status: v })}
            tabs={[
              { value: "waiting", label: "처리 대기" },
              { value: "waiting_user", label: "회원 답변 대기" },
              { value: "resolved", label: "처리 완료" },
              { value: "all", label: "전체" },
            ]}
          />
        </div>
      }
      filters={
        <>
          <CommunityFilterField label="검색">
            <CommunitySearchInput value={q.get("q")} onCommit={(v) => q.set({ q: v })} placeholder="접수 번호 · 제목" />
          </CommunityFilterField>
          {q.get("reference_type") && q.get("reference_id") ? (
            <CommunityFilterField label="참조 대상">
              <span className="flex items-center gap-2 text-[13px] text-sam-fg">
                {REFERENCE_LABEL[q.get("reference_type")] ?? "선택한 대상"} 관련 문의만
                <button
                  type="button"
                  className="text-sam-muted underline"
                  onClick={() => q.set({ reference_type: null, reference_id: null })}
                >
                  해제
                </button>
              </span>
            </CommunityFilterField>
          ) : null}
          <CommunityResetFilters onReset={() => q.reset(["type"])} />
        </>
      }
      footer={
        state.status === "ok" && (total > 0 || q.page > 1) ? (
          <CommunityPagination page={q.page} pageSize={PAGE_SIZE} total={total} onPage={(p) => q.set({ page: p })} />
        ) : null
      }
    >
      {state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState ko message={appeal ? "이 상태의 이의신청이 없습니다." : "이 상태의 커뮤니티 문의가 없습니다."} />
      ) : (
        <CommunityTable head={["문의", "회원", "분류", "참조 대상", "담당자", "상태", "마지막 메시지"]}>
          {rows.map((c) => {
            const refHref = referenceHref(scope, c.reference_type, c.reference_id);
            const refLabel = c.reference_type ? REFERENCE_LABEL[c.reference_type] ?? "관련 항목" : null;
            return (
              <tr key={c.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className={`${COMMUNITY_TD} max-w-[22rem]`}>
                  <Link
                    href={communityDetailHref(`/admin/support/${encodeURIComponent(c.id)}`, q.selfHref)}
                    className="font-medium text-sky-800 hover:underline"
                  >
                    {c.subject || "제목 없음"}
                  </Link>
                  <div className="text-[12px] text-sam-muted">
                    {c.public_case_no}
                    {c.admin_unread_count > 0 ? ` · 새 메시지 ${c.admin_unread_count}` : ""}
                  </div>
                </td>
                <td className={COMMUNITY_TD}>
                  <Link
                    href={communityDetailHref(`${trade ? "/admin/trade/members/" : "/admin/community/members/"}${encodeURIComponent(c.requester_user_id)}`, q.selfHref)}
                    className="text-sky-800 hover:underline"
                  >
                    {c.requester_display_name?.trim() || "이름 없음"}
                  </Link>
                </td>
                <td className={COMMUNITY_TD}>{supportCategoryLabel(safeT, c.category)}</td>
                <td className={COMMUNITY_TD}>
                  {refLabel ? (
                    refHref ? (
                      <Link href={communityDetailHref(refHref, q.selfHref)} className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-[12px] font-medium text-sky-800 hover:underline">
                        {refLabel} 보기
                      </Link>
                    ) : (
                      <span className="text-[12px] text-sam-muted">{refLabel}</span>
                    )
                  ) : (
                    <span className="text-sam-muted">—</span>
                  )}
                </td>
                <td className={COMMUNITY_TD}>{c.assigned_admin_id ? "배정됨" : <span className="text-sam-muted">미배정</span>}</td>
                <td className={COMMUNITY_TD}>
                  <AdminToneBadge tone={STATUS_TONE[c.status] ?? "neutral"}>{supportAdminStatusLabel(c.status, true)}</AdminToneBadge>
                </td>
                <td className={COMMUNITY_TD}>
                  <CommunityTimeCell iso={c.last_message_at || c.created_at} />
                </td>
              </tr>
            );
          })}
        </CommunityTable>
      )}
    </CommunityListShell>
  );
}
