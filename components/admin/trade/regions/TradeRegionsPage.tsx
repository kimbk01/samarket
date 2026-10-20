"use client";

/**
 * 지역 현황 (설계 v2 §C-11) — 시·군별 거래글 현황 (읽기 전용). 거래글 많은 순.
 * URL: period/from/to (게시물 등록일, 기본 전체) · page · size(20/50/100)
 * 집계는 서버가 시·군 단위로 한 번에 계산한다(행 = 글이 있는 시·군 수). 쪽 나누기는 그 집계 결과에 적용한다.
 */
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  useCommunityQueryState,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

type RegionRow = {
  lgu_id: string | null;
  name: string;
  posts: number;
  selling: number;
  reserved: number;
  sold: number;
  hidden: number;
  sellers: number;
  open_reports: number;
  active_promotions: number;
};

type RegionsResponse = { ok?: boolean; error?: string; total?: number; rows?: RegionRow[] };

const num = (v: number | null | undefined) => formatAdminNumber(v);

export function TradeRegionsPage() {
  const q = useCommunityQueryState();
  const period = q.get("period");
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (period === "custom") {
    if (q.get("from")) params.set("from", q.get("from"));
    if (q.get("to")) params.set("to", q.get("to"));
  }
  const customIncomplete = period === "custom" && (!q.get("from") || !q.get("to"));
  const { state, reload } = useCommunityAdminJson<RegionsResponse>(
    customIncomplete ? null : `/api/admin/trade/regions${params.toString() ? `?${params.toString()}` : ""}`
  );
  const rows = state.status === "ok" ? [...(state.data.rows ?? [])].sort((a, b) => b.posts - a.posts) : [];
  const hasUnknown = rows.some((r) => !r.lgu_id);
  const pageRows = rows.slice(q.limitOffset.offset, q.limitOffset.offset + q.limitOffset.limit);
  const total = state.status === "ok" ? rows.length : null;
  const tooMany = state.status === "error" && state.code === "too_many_rows";

  return (
    <CommunityListShell
      title="지역 현황"
      description="시·군별 거래글 현황입니다. 지역을 누르면 그 지역 거래글 목록으로 이동합니다."
      filterBar={<CommunityFilterBar showSearch={false} showPeriod onRefresh={reload} pending={state.status === "loading"} />}
      footer={
        <>
          {hasUnknown ? <p className="px-1 text-[12px] text-sam-muted">「지역 확인 불가」는 주소 정보가 없는 글입니다.</p> : null}
          <CommunityListPagination q={q} total={total} disabled={state.status === "loading"} />
        </>
      }
    >
      {customIncomplete ? (
        <AdminEmptyState ko message="직접 지정 기간의 시작일과 종료일을 모두 선택하세요." />
      ) : state.status === "loading" && !state.data ? (
        <AdminLoadingState ko />
      ) : tooMany ? (
        <AdminEmptyState ko message="대상 거래글이 너무 많습니다. 기간을 좁혀 다시 조회해 주세요." />
      ) : state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={reload} />
      ) : rows.length === 0 ? (
        <AdminEmptyState
          ko
          message="조건에 맞는 거래글이 없습니다."
          onReset={q.hasAny(["period", "from", "to"]) ? () => q.reset() : undefined}
        />
      ) : (
        <CommunityTable head={["지역", "거래글", "판매중", "예약중", "거래완료", "숨김·삭제", "판매자", "처리할 신고", "노출 중 홍보"]}>
          {pageRows.map((r) => (
            <tr key={r.lgu_id ?? "unknown"} className="border-b border-sam-border-soft">
              <td className={COMMUNITY_TD}>
                {r.lgu_id ? (
                  <Link
                    href={`/admin/posts-management?lguId=${encodeURIComponent(r.lgu_id)}`}
                    prefetch={false}
                    className="font-medium text-sam-primary hover:underline"
                  >
                    {r.name}
                  </Link>
                ) : (
                  <span className="text-sam-muted">{r.name || "지역 확인 불가"}</span>
                )}
              </td>
              <td className={`${COMMUNITY_TD} font-semibold`}>{num(r.posts)}</td>
              <td className={COMMUNITY_TD}>{num(r.selling)}</td>
              <td className={COMMUNITY_TD}>{num(r.reserved)}</td>
              <td className={COMMUNITY_TD}>{num(r.sold)}</td>
              <td className={COMMUNITY_TD}>{num(r.hidden)}</td>
              <td className={COMMUNITY_TD}>{num(r.sellers)}</td>
              <td className={`${COMMUNITY_TD} ${r.open_reports > 0 ? "font-semibold text-sam-danger" : ""}`}>{num(r.open_reports)}</td>
              <td className={COMMUNITY_TD}>{num(r.active_promotions)}</td>
            </tr>
          ))}
        </CommunityTable>
      )}
    </CommunityListShell>
  );
}
