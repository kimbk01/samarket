"use client";

/**
 * 지역 현황 (설계 v2 §C-11) — 시·군별 거래글 현황 (읽기 전용). 거래글 많은 순.
 * URL: from/to (게시물 등록일 PHT, 기본 전체) · (호환) period
 * 행 = 거래글이 있는 시·군 (지역 카탈로그 `trade_national_lgu` 범위) — 서버가 기간 내 거래글을 모아 집계한다.
 * 집계 결과를 DB 에서 한 번에 페이지로 나누려면 집계 뷰/RPC 가 필요해 (운영 DB 승인 사항) 페이지 없이 전부 표시한다.
 */
import Link from "next/link";
import {
  COMMUNITY_TD,
  CommunityFilterBar,
  CommunityListBody,
  CommunityListShell,
  CommunityTable,
  useCommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { useCommunityAdminJson } from "@/components/admin/community/members/use-community-admin-data";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
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
  const q = useCommunityListQuery();
  const params = q.apiParams({ period: true });
  params.delete("limit");
  params.delete("offset");
  const { state, reload } = useCommunityAdminJson<RegionsResponse>(`/api/admin/trade/regions?${params.toString()}`);
  const rows = [...(state.data?.rows ?? [])].sort((a, b) => b.posts - a.posts);
  const hasUnknown = rows.some((r) => !r.lgu_id);
  const tooMany = state.status === "error" && state.code === "too_many_rows";

  return (
    <CommunityListShell
      title="지역 현황"
      description="시·군별 거래글 현황입니다. 지역을 누르면 그 지역 거래글 목록으로 이동합니다."
      filterBar={<CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"} />}
      footer={
        hasUnknown ? <p className="px-1 text-[12px] text-sam-muted">「지역 확인 불가」는 주소 정보가 없는 글입니다.</p> : null
      }
    >
      {tooMany ? (
        <AdminEmptyState ko message="대상 거래글이 너무 많습니다. 기간을 좁혀 다시 조회해 주세요." onReset={q.isFiltered ? q.reset : undefined} />
      ) : (
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
      )}
    </CommunityListShell>
  );
}
