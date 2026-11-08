"use client";

/**
 * 지역 현황 (설계 v2 §C-11) — 시·군별 거래글 현황 (읽기 전용). 거래글 많은 순.
 * URL: from/to (게시물 등록일 PHT, 기본 전체) · (호환) period
 * 행 = 거래글이 있는 시·군 (지역 카탈로그 `trade_national_lgu` 범위) — DB 집계 RPC(`admin_trade_region_stats`)가
 * 기간 내 거래글 전체를 지역별로 모아 정렬·페이지(20/50/100)까지 한다 (고정 건수 상한 없음).
 */
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
  const q = useCommunityListQuery();
  const params = q.apiParams({ period: true });
  const { state, reload } = useCommunityAdminJson<RegionsResponse>(`/api/admin/trade/regions?${params.toString()}`);
  /** 서버 정렬(거래글 많은 순 → 지역 id) 그대로 */
  const rows = state.data?.rows ?? [];
  const total = state.status === "ok" ? Number(state.data.total ?? 0) : null;
  const hasUnknown = rows.some((r) => !r.lgu_id);

  return (
    <CommunityListShell
      title={t("admin_trade_regions_title")}
      description={t("admin_trade_regions_desc")}
      filterBar={<CommunityFilterBar lq={q} showSearch={false} pending={state.status === "loading"} />}
      footer={
        <>
          {hasUnknown ? <p className="px-1 text-[12px] text-sam-muted">{t("admin_trade_regions_unknown_note")}</p> : null}
          <CommunityListPagination lq={q} total={total} disabled={state.status === "loading"} />
        </>
      }
    >
      <CommunityListBody state={state} empty={rows.length === 0} lq={q} onRetry={reload} emptyMessage={t("admin_trade_regions_empty")}>
        <CommunityTable head={[t("common_region"), t("admin_trade_regions_th_posts"), t("admin_trade_regions_th_selling"), t("admin_trade_regions_th_reserved"), t("admin_trade_regions_th_sold"), t("admin_trade_regions_th_hidden"), t("admin_trade_th_seller"), t("admin_trade_regions_th_open_reports"), t("admin_trade_regions_th_promoted")]}>
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
                  <span className="text-sam-muted">{r.name || t("admin_trade_regions_unknown")}</span>
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
