/**
 * E-1 (Owner 승인) — 배달 레거시 주문 쓰기 API 비활성 (DEF-8).
 *
 * 관리자 화면 어디에서도 호출하지 않는 레거시 주문 결정 경로는 410 으로 막는다. 코드는 지우지 않고
 * 게이트 뒤에 보존한다 (되살릴 때는 이 목록에서 빼고, 해당 경로도 expected_status 를 필수로 받는다).
 * 관리자 주문 결정의 유일한 경로: POST /api/admin/store-orders/[orderId]/intervene (주문 상세 「관리자 개입」).
 *
 * Server-only (NextResponse) — client components must not import this file.
 */
import { NextResponse } from "next/server";

export const ADMIN_LEGACY_ORDER_WRITE_DISABLED_ROUTES = [
  "POST /api/admin/store-orders/[orderId]/approve-refund",
  "PATCH /api/admin/store-orders/[orderId]/cancel-request",
  "POST /api/admin/store-orders/[orderId]/mark-paid",
  /** PATCH body decision fields (force_cancel · complete_refund · reject_refund · set_order_status). */
  "PATCH /api/admin/store-orders/[orderId]#decision",
] as const;

export type AdminLegacyOrderWriteRoute = (typeof ADMIN_LEGACY_ORDER_WRITE_DISABLED_ROUTES)[number];

export const ADMIN_LEGACY_ORDER_WRITE_GONE_ERROR = "legacy_endpoint_disabled";

/** Canonical replacement for every disabled decision route. */
export const ADMIN_ORDER_DECISION_CANONICAL_ROUTE = "POST /api/admin/store-orders/[orderId]/intervene";

const DISABLED: ReadonlySet<string> = new Set(ADMIN_LEGACY_ORDER_WRITE_DISABLED_ROUTES);

export function isAdminLegacyOrderWriteDisabled(route: AdminLegacyOrderWriteRoute): boolean {
  return DISABLED.has(route);
}

export function adminLegacyOrderWriteGoneBody(route: AdminLegacyOrderWriteRoute) {
  return {
    ok: false as const,
    error: ADMIN_LEGACY_ORDER_WRITE_GONE_ERROR,
    route,
    use: ADMIN_ORDER_DECISION_CANONICAL_ROUTE,
  };
}

export function adminLegacyOrderWriteGoneResponse(route: AdminLegacyOrderWriteRoute): NextResponse {
  return NextResponse.json(adminLegacyOrderWriteGoneBody(route), { status: 410 });
}
