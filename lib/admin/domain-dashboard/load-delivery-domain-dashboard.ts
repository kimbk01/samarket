/**
 * Delivery Domain Dashboard — 지표는 `lib/admin/metrics/delivery-metrics.ts` 단일 정의에서 읽는다 (§5).
 * 전체 관제 Action Center 배달 카드와 같은 지표 id·같은 처리 대기 레지스트리 값을 쓴다.
 * 값 확인 불가 = null (「확인 불가」, 0 표시 금지). 모든 지표는 처리 화면(필터 포함)으로 이동한다.
 * 읽기 전용 — 쓰기 없음.
 */
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  DELIVERY_METRIC_DEFINITIONS,
  type DeliveryMetricDefinition,
  type DeliveryMetricId,
  type DeliveryMetricSection,
  type DeliveryMetricValue,
} from "@/lib/admin/metrics/delivery-metrics";
import { loadDeliveryMetrics } from "@/lib/admin/metrics/load-delivery-metrics";
import type {
  AdminDomainActionItem,
  AdminDomainDashboardModel,
  AdminDomainMetric,
} from "@/lib/admin/domain-dashboard/types";

function sectionDefs(section: DeliveryMetricSection): DeliveryMetricDefinition[] {
  return DELIVERY_METRIC_DEFINITIONS.filter((d) => d.section === section);
}

function valueOf(values: ReadonlyMap<DeliveryMetricId, DeliveryMetricValue>, id: DeliveryMetricId): DeliveryMetricValue {
  return values.get(id) ?? { id, value: null, href: "", forbidden: false };
}

function sourceLabel(def: DeliveryMetricDefinition): string {
  return def.source.kind === "queue"
    ? `metric:${def.id}|admin_action_queue.${def.source.categories.join("+")}`
    : `metric:${def.id}|${def.source.description}`;
}

function toActionItems(
  defs: DeliveryMetricDefinition[],
  values: ReadonlyMap<DeliveryMetricId, DeliveryMetricValue>
): AdminDomainActionItem[] {
  return defs
    .map((def) => ({ def, v: valueOf(values, def.id) }))
    .filter(({ v, def }) => !v.forbidden && (v.value === null || v.value > 0 || def.showWhenZero))
    .map(({ def, v }) => ({
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      count: v.value,
      href: v.href || def.href,
      source: sourceLabel(def),
      owner: def.source.kind === "queue" ? def.source.categories.join("+") : "delivery_metrics",
    }));
}

function toMetrics(
  defs: DeliveryMetricDefinition[],
  values: ReadonlyMap<DeliveryMetricId, DeliveryMetricValue>
): AdminDomainMetric[] {
  return defs
    .map((def) => ({ def, v: valueOf(values, def.id) }))
    .filter(({ v }) => !v.forbidden)
    .map(({ def, v }) => ({
      id: def.id,
      labelKo: def.labelKo,
      labelEn: def.labelEn,
      value: v.value,
      href: v.href || def.href,
      source: sourceLabel(def),
    }));
}

export async function loadDeliveryDomainDashboard(): Promise<AdminDomainDashboardModel> {
  const sb = getSupabaseServer();
  const { values, sectionErrors } = await loadDeliveryMetrics(sb);

  return {
    domain: "delivery",
    titleKo: "배달 대시보드",
    titleEn: "Delivery dashboard",
    descriptionKo:
      "지금 처리할 일은 최근 7일 기준입니다. 7일이 지나도 종결되지 않은 주문은 「운영 위험」에 따로 표시합니다. 숫자를 누르면 같은 조건으로 필터된 처리 화면이 열립니다. 기간 기준: 마닐라 시간.",
    descriptionEn:
      "Work to do now covers the last 7 days. Orders still open after 7 days are listed separately under operational risk. Each number opens its processing screen with the same filter. Period basis: Manila time.",
    currentState: toMetrics(sectionDefs("state"), values),
    actionRequired: toActionItems(sectionDefs("action"), values),
    domainHealth: toMetrics(sectionDefs("health"), values),
    issues: toActionItems(sectionDefs("risk"), values),
    primaryEntries: [
      {
        id: "business",
        labelKo: "매장 운영",
        labelEn: "Store operations",
        href: "/admin/business",
        frequency: "FREQUENT",
      },
      {
        id: "store_applications",
        labelKo: "입점 심사",
        labelEn: "Store applications",
        href: "/admin/stores",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "orders",
        labelKo: "주문 목록",
        labelEn: "Orders",
        href: "/admin/stores/orders",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "products",
        labelKo: "메뉴·상품 검수",
        labelEn: "Menu / product review",
        href: "/admin/store-products",
        frequency: "FREQUENT",
      },
      {
        id: "ops_console",
        labelKo: "실시간 상황판",
        labelEn: "Live ops board",
        href: "/admin/ops-console",
        frequency: "FREQUENT",
      },
      {
        id: "delivery_operations_stats",
        labelKo: "배달 통계",
        labelEn: "Delivery statistics",
        href: "/admin/delivery-operations",
        frequency: "OCCASIONAL",
      },
      {
        id: "home_shelves",
        labelKo: "홈 화면 구성",
        labelEn: "Home screen layout",
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
    ],
    contextEntries: [
      {
        id: "ads",
        labelKo: "배달 광고",
        labelEn: "Delivery ads",
        href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#action-required`,
        frequency: "FREQUENT",
      },
      {
        id: "settlement",
        labelKo: "수수료 내역·검토",
        labelEn: "Commission ledger & review",
        href: "/admin/store-settlements",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "support",
        labelKo: "고객지원",
        labelEn: "Support",
        href: "/admin/support?filter=ACTIONABLE#action-required",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "finance",
        labelKo: "재무 현황",
        labelEn: "Finance overview",
        href: "/admin/finance#action-required",
        frequency: "FREQUENT",
      },
      {
        id: "store_financial_statement",
        labelKo: "매장 재무 명세서",
        labelEn: "Store financial statement",
        href: "/admin/finance",
        frequency: "DAILY_CRITICAL",
      },
      {
        id: "action_center",
        labelKo: "전체 처리 대기",
        labelEn: "All pending work",
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
