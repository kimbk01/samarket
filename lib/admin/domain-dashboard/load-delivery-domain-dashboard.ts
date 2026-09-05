/**
 * Delivery Domain Dashboard — compose business ops KPI + Action Queue (read-only).
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { loadAdminBusinessListOps } from "@/lib/admin-business/load-admin-business-list";
import {
  BUSINESS_OPS_DELIVERING_ORDER_STATUSES,
  BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES,
} from "@/lib/admin-business/business-ops-presentation";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import type { AdminDomainDashboardModel } from "@/lib/admin/domain-dashboard/types";

function qUnavailable(unavailable: Set<string>, key: string): boolean {
  return unavailable.has(key);
}

export async function loadDeliveryDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sectionErrors: string[] = [];
  const sb = getSupabaseServer();

  let kpi = null as
    | NonNullable<Extract<Awaited<ReturnType<typeof loadAdminBusinessListOps>>, { ok: true }>["kpi"]>
    | null;
  try {
    const list = await loadAdminBusinessListOps(sb, { page: 1, pageSize: 1 });
    if (list.ok) kpi = list.kpi;
    else sectionErrors.push(`business_ops_kpi:${list.error}`);
  } catch (e) {
    sectionErrors.push(`business_ops_kpi:${e instanceof Error ? e.message : "error"}`);
  }

  let queue = null as Awaited<ReturnType<typeof loadAdminActionQueueCounts>> | null;
  try {
    queue = await loadAdminActionQueueCounts({ storesSb: sb as any, notesSb: sb as any });
  } catch (e) {
    sectionErrors.push(`action_queue:${e instanceof Error ? e.message : "error"}`);
  }

  const unavailable = new Set(queue?.unavailable ?? []);

  const [completedOrders, cancelledOrders, pendingOrders] = await Promise.all([
    adminDomainCountExact(() =>
      (sb as any).from("store_orders").select("id", { count: "exact", head: true }).eq("order_status", "completed")
    ),
    adminDomainCountExact(() =>
      (sb as any).from("store_orders").select("id", { count: "exact", head: true }).eq("order_status", "cancelled")
    ),
    adminDomainCountExact(() =>
      (sb as any)
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("order_status", "pending")
    ),
  ]);

  const delivering = await adminDomainCountExact(() =>
    (sb as any)
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .in("order_status", [...BUSINESS_OPS_DELIVERING_ORDER_STATUSES])
  );

  const inProgress =
    kpi?.inProgressOrders ??
    (await adminDomainCountExact(() =>
      (sb as any)
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .in("order_status", [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES])
    ));

  const actionRequired = [
    {
      id: "orders_attention",
      labelKo: "주문 처리 필요",
      labelEn: "Orders need attention",
      count: qUnavailable(unavailable, "orders_attention")
        ? null
        : (queue?.orders_attention ?? null),
      href: "/admin/store-orders?order_status=refund_requested",
      source: "admin_action_queue.orders_attention",
      owner: "store_orders",
      filter: "refund_requested",
    },
    {
      id: "pending_orders",
      labelKo: "신규/미확인 주문",
      labelEn: "New / pending orders",
      count: pendingOrders,
      href: "/admin/store-orders?order_status=pending",
      source: "store_orders.order_status=pending",
      owner: "store_orders",
      filter: "pending",
    },
    {
      id: "settlements",
      labelKo: "정산 확인 필요",
      labelEn: "Settlement review needed",
      count: qUnavailable(unavailable, "settlements_actionable")
        ? null
        : (queue?.settlements_actionable ?? kpi?.settlementNeedsCheck ?? null),
      href: "/admin/store-settlements?settlement_status=scheduled",
      source: "admin_action_queue.settlements_actionable|business_ops_kpi",
      owner: "store_settlements",
      filter: "scheduled",
    },
    {
      id: "store_applications",
      labelKo: "매장 승인 대기",
      labelEn: "Store approval pending",
      count: qUnavailable(unavailable, "store_applications")
        ? null
        : (queue?.store_applications ?? kpi?.pendingApproval ?? null),
      href: "/admin/business?approval=pending_family",
      source: "admin_action_queue.store_applications|business_ops_kpi",
      owner: "stores",
      filter: "pending_family",
    },
    {
      id: "store_reports",
      labelKo: "신고/문제 매장",
      labelEn: "Reported / problem stores",
      count: qUnavailable(unavailable, "store_reports")
        ? null
        : (queue?.store_reports ?? kpi?.openReports ?? null),
      href: "/admin/business?report=open",
      source: "admin_action_queue.store_reports|business_ops_kpi",
      owner: "store_reports",
      filter: "report=open",
    },
    {
      id: "delivery_ad_ops",
      labelKo: "배달 광고 처리 필요",
      labelEn: "Delivery ads need admin",
      count: qUnavailable(unavailable, "delivery_ad_ops") ? null : (queue?.delivery_ad_ops ?? null),
      href: DELIVERY_AD_ADMIN_ROUTES.hub,
      source: "admin_action_queue.delivery_ad_ops",
      owner: "delivery_ad_ops",
    },
    {
      id: "support",
      labelKo: "고객지원 처리 필요",
      labelEn: "Support needs attention",
      count: qUnavailable(unavailable, "support_actionable")
        ? null
        : (queue?.support_actionable ?? null),
      href: "/admin/support",
      source: "admin_action_queue.support_actionable",
      owner: "support_cases",
    },
  ].filter((row) => row.count === null || (row.count ?? 0) > 0);

  return {
    domain: "delivery",
    titleKo: "배달 운영 대시보드",
    titleEn: "Delivery operations dashboard",
    descriptionKo: "매장·주문·정산·신고를 한눈에 보고 바로 처리 큐로 이동합니다.",
    descriptionEn: "See stores, orders, settlements, and reports — jump straight to queues.",
    currentState: [
      {
        id: "stores_total",
        labelKo: "전체 매장",
        labelEn: "All stores",
        value: kpi?.totalStores ?? null,
        href: "/admin/business",
        source: "business_ops_kpi.totalStores",
      },
      {
        id: "open_now",
        labelKo: "영업 중",
        labelEn: "Open now",
        value: kpi?.openNow ?? null,
        href: "/admin/business?open=open",
        source: "business_ops_kpi.openNow",
      },
      {
        id: "closed_now",
        labelKo: "영업 종료",
        labelEn: "Closed",
        value: kpi?.closedNow ?? null,
        href: "/admin/business?open=closed",
        source: "business_ops_kpi.closedNow",
      },
      {
        id: "restricted",
        labelKo: "운영 제한",
        labelEn: "Restricted",
        value: kpi?.restricted ?? null,
        href: "/admin/business?restriction=yes",
        source: "business_ops_kpi.restricted",
      },
    ],
    actionRequired,
    domainHealth: [
      {
        id: "orders_in_progress",
        labelKo: "진행 주문",
        labelEn: "In-progress orders",
        value: inProgress,
        href: "/admin/stores/orders",
        source: "store_orders.in_progress",
      },
      {
        id: "orders_delivering",
        labelKo: "배달 중",
        labelEn: "Delivering",
        value: delivering,
        href: "/admin/store-orders?order_status=delivering",
        source: "store_orders.delivering|arrived",
      },
      {
        id: "orders_completed",
        labelKo: "완료",
        labelEn: "Completed",
        value: completedOrders,
        href: "/admin/store-orders?order_status=completed",
        source: "store_orders.completed",
      },
      {
        id: "orders_cancelled",
        labelKo: "취소",
        labelEn: "Cancelled",
        value: cancelledOrders,
        href: "/admin/store-orders?order_status=cancelled",
        source: "store_orders.cancelled",
      },
    ],
    issues: [
      {
        id: "delivery_alerts",
        labelKo: "배달 알림/이슈",
        labelEn: "Delivery alerts",
        count: qUnavailable(unavailable, "delivery_alerts") ? null : (queue?.delivery_alerts ?? null),
        href: "/admin/delivery-operations",
        source: "admin_action_queue.delivery_alerts",
        owner: "delivery_alerts",
      },
    ].filter((r) => r.count === null || (r.count ?? 0) > 0),
    primaryEntries: [
      {
        id: "business",
        labelKo: "매장 목록",
        labelEn: "Stores",
        href: "/admin/business",
        frequency: "FREQUENT",
      },
      {
        id: "orders",
        labelKo: "주문 관리",
        labelEn: "Orders",
        href: "/admin/stores/orders",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "products",
        labelKo: "상품/메뉴",
        labelEn: "Products / menus",
        href: "/admin/stores",
        frequency: "FREQUENT",
      },
      {
        id: "home_shelves",
        labelKo: "HOME 구성",
        labelEn: "HOME shelves",
        href: "/admin/stores-home-shelves",
        frequency: "OCCASIONAL",
      },
      {
        id: "category",
        labelKo: "카테고리 정책",
        labelEn: "Category policy",
        href: "/admin/stores/application-settings?menu=stores&focus=category",
        frequency: "CONFIGURATION",
      },
      {
        id: "ops",
        labelKo: "배달 운영 콘솔",
        labelEn: "Delivery ops console",
        href: "/admin/delivery-operations",
        frequency: "FREQUENT",
      },
    ],
    contextEntries: [
      {
        id: "ads",
        labelKo: "배달 광고",
        labelEn: "Delivery ads",
        href: DELIVERY_AD_ADMIN_ROUTES.hub,
        frequency: "FREQUENT",
      },
      {
        id: "settlement",
        labelKo: "정산",
        labelEn: "Settlements",
        href: "/admin/store-settlements",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: "/admin/support",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "finance",
        labelKo: "재무",
        labelEn: "Finance",
        href: "/admin/finance",
        frequency: "FREQUENT",
      },
      {
        id: "store_financial_statement",
        labelKo: "매장 재무 명세서",
        labelEn: "Store financial statement",
        href: "/admin/business",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "action_center",
        labelKo: "전역 Action Center",
        labelEn: "Global Action Center",
        href: "/admin#action-center",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "notifications",
        labelKo: "알림",
        labelEn: "Notifications",
        href: "/admin/notifications",
        frequency: "OCCASIONAL",
      },
    ],
    recent: [],
    sectionErrors,
  };
}
