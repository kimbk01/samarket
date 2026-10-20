"use client";

/**
 * 지역 현황 (설계 v2 §C-11) — 시·군별 거래글 현황 (읽기 전용). 거래글 많은 순.
 * URL: from/to (게시물 등록일 PHT, 기본 전체) · (호환) period
 * 행 = 거래글이 있는 시·군 (지역 카탈로그 `trade_national_lgu` 범위) — DB 집계 RPC(`admin_trade_region_stats`)가
 * 기간 내 거래글 전체를 지역별로 모아 정렬·페이지(20/50/100)까지 한다 (고정 건수 상한 없음).
 */
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListPagination,
  CommunityListShell,
  CommunityTable,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
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

type RegionsResponse = { ok?: boolean; error?: string; total?: number; post_total?: number | null; rows?: RegionRow[] };

const num = (v: number | null | undefined) => formatAdminNumber(v);

export function TradeRegionsPage() {
  const q = useCommunityListQuery();
  const params = q.apiParams({ period: true });
  const { state, reload } = useCommunityAdminJson<RegionsResponse>(`/api/admin/trade/regions?${params.toString()}`);
  /** 서버 정렬(거래글 많은 순 → 지역 id) 그대로 */
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const hasUnknown = rows.some((r) => !r.lgu_id);

  return (
    <CommunityListShell
      title="지역 현황"
      description="시·군별 거래글 현황입니다. 지역을 누르면 그 지역 거래글 목록으로 이동합니다."
      filterBar={<CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"} />}
      footer={
        <>
          {hasUnknown ? <p className="px-1 text-[12px] text-sam-muted">「지역 확인 불가」는 주소 정보가 없는 글입니다.</p> : null}
          <CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />
        </>
      }
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage="거래글이 없습니다.">
        <CommunityTable head={["지역", "거래글", "판매중", "예약중", "거래완료", "숨김·삭제", "판매자", "처리할 신고", "노출 중 홍보"]}>
          {rows.map((r) => (
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
      </CommunityListBody>
    </CommunityListShell>
  );
}
