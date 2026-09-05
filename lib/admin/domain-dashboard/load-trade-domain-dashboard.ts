/**
 * Trade Domain Dashboard read-model — overview counts + recent listings (read-only).
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchAdminTradeOverviewCounts } from "@/lib/admin-products/admin-trade-overview-counts";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  buildAdminPrelaunchResetHref,
  DOMAIN_RESET_SCOPE_PRESETS,
} from "@/lib/admin/prelaunch-reset/domain-reset-entry";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";

export async function loadTradeDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sectionErrors: string[] = [];
  const sb = getSupabaseServer();

  let counts = null as Awaited<ReturnType<typeof fetchAdminTradeOverviewCounts>> | null;
  try {
    counts = await fetchAdminTradeOverviewCounts(sb);
  } catch (e) {
    sectionErrors.push(`trade_overview:${e instanceof Error ? e.message : "error"}`);
  }

  const recent: AdminDomainDashboardModel["recent"] = [];
  try {
    const { data, error } = await (sb as any)
      .from(POSTS_TABLE_READ)
      .select("id, title, status, created_at")
      .eq("type", "trade")
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) {
      sectionErrors.push(`trade_recent:${error.message}`);
    } else {
      for (const row of data ?? []) {
        recent.push({
          id: String(row.id),
          title: String(row.title ?? row.id),
          metaKo: `상태 ${String(row.status ?? "—")}`,
          metaEn: `status ${String(row.status ?? "—")}`,
          href: `/admin/products/${row.id}`,
          at: row.created_at ? String(row.created_at) : null,
        });
      }
    }
  } catch (e) {
    sectionErrors.push(`trade_recent:${e instanceof Error ? e.message : "error"}`);
  }

  const actionRequired = [
    {
      id: "product_reports",
      labelKo: "상품 신고 검토",
      labelEn: "Product report review",
      count: counts?.reportsPending ?? null,
      href: "/admin/reports?domain=trade&target_type=product",
      source: "reports.target_type=product open",
      owner: "reports",
      filter: "domain=trade&target_type=product",
    },
    {
      id: "promo_pending",
      labelKo: "광고/홍보 신청",
      labelEn: "Promotion applications",
      count: counts?.promoPending ?? null,
      href: "/admin/ad-applications?domain=trade",
      source: "point_promotion_orders.trade pending_review",
      owner: "point_promotion_orders",
      filter: "domain=trade",
    },
  ].filter((r) => r.count === null || (r.count ?? 0) > 0);

  return {
    domain: "trade",
    titleKo: "거래 운영 대시보드",
    titleEn: "Trade operations dashboard",
    descriptionKo: "게시물 상태·신고·홍보를 확인하고 관리 목록/큐로 이동합니다. 목록 관리는 게시물 관리에서 합니다.",
    descriptionEn: "Review listing state, reports, and promotions — manage lists separately in Posts management.",
    currentState: [
      {
        id: "total",
        labelKo: "전체 거래 게시물",
        labelEn: "All trade posts",
        value: counts?.listingsTotal ?? null,
        href: "/admin/posts-management",
        source: "posts.type=trade",
      },
      {
        id: "active",
        labelKo: "판매중",
        labelEn: "Active",
        value: counts?.listingsActive ?? null,
        href: "/admin/posts-management?status=active",
        source: "posts.status=active",
      },
      {
        id: "sold",
        labelKo: "판매완료",
        labelEn: "Sold",
        value: counts?.listingsSold ?? null,
        href: "/admin/posts-management?status=sold",
        source: "posts.status=sold",
      },
      {
        id: "hidden",
        labelKo: "숨김",
        labelEn: "Hidden",
        value: counts?.listingsHidden ?? null,
        href: "/admin/posts-management?status=hidden",
        source: "posts.status=hidden",
      },
      {
        id: "deleted",
        labelKo: "삭제(상태)",
        labelEn: "Deleted (status)",
        value: counts?.listingsDeleted ?? null,
        href: "/admin/posts-management?status=deleted",
        source: "posts.status=deleted",
      },
    ],
    actionRequired,
    domainHealth: [
      {
        id: "promo_active",
        labelKo: "홍보중",
        labelEn: "Promo active",
        value: counts?.promoActive ?? null,
        href: "/admin/trade-post-ads",
        source: "point_promotion_orders.trade active",
      },
    ],
    issues: actionRequired.filter((a) => a.id === "product_reports"),
    primaryEntries: [
      {
        id: "posts",
        labelKo: "게시물 관리",
        labelEn: "Posts management",
        href: "/admin/posts-management",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "trade_tab",
        labelKo: "중고거래",
        labelEn: "Used goods",
        href: "/admin/posts-management?tab=trade",
        frequency: "FREQUENT",
      },
      {
        id: "cars",
        labelKo: "중고차",
        labelEn: "Used cars",
        href: "/admin/posts-management?tab=used_car",
        frequency: "FREQUENT",
      },
      {
        id: "estate",
        labelKo: "부동산",
        labelEn: "Real estate",
        href: "/admin/posts-management?tab=real_estate",
        frequency: "FREQUENT",
      },
      {
        id: "jobs",
        labelKo: "알바/일자리",
        labelEn: "Jobs",
        href: "/admin/posts-management?tab=jobs",
        frequency: "FREQUENT",
      },
      {
        id: "flow",
        labelKo: "거래 프로세스",
        labelEn: "Trade flow",
        href: "/admin/trade-flow",
        frequency: "FREQUENT",
      },
      {
        id: "reviews",
        labelKo: "거래 후기",
        labelEn: "Trade reviews",
        href: "/admin/reviews",
        frequency: "OCCASIONAL",
      },
    ],
    contextEntries: [
      {
        id: "trade_chat",
        labelKo: "거래 채팅",
        labelEn: "Trade chats",
        href: "/admin/chats/trade",
        frequency: "FREQUENT",
      },
      {
        id: "promo",
        labelKo: "거래 광고/홍보",
        labelEn: "Trade promotions",
        href: "/admin/ad-applications?domain=trade",
        frequency: "FREQUENT",
      },
      {
        id: "members",
        labelKo: "회원/판매자",
        labelEn: "Members / sellers",
        href: "/admin/users?from=trade",
        frequency: "OCCASIONAL",
      },
      {
        id: "ads",
        labelKo: "광고/노출",
        labelEn: "Ads / exposure",
        href: "/admin/delivery-ads#action-required",
        frequency: "OCCASIONAL",
      },
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: "/admin/support",
        frequency: "OCCASIONAL",
      },
      {
        id: "action_center",
        labelKo: "전역 Action Center",
        labelEn: "Global Action Center",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "reset",
        labelKo: "테스트 거래 데이터 정리",
        labelEn: "Clean test trade data",
        href: buildAdminPrelaunchResetHref(DOMAIN_RESET_SCOPE_PRESETS.trade),
        frequency: "CONFIGURATION",
      },
    ],
    recent,
    sectionErrors,
  };
}
