/**
 * Phase 8B — Delivery Navigation = orderId identity union (단순 합산 금지).
 * customer / owner surface aggregator 분리.
 */
import type { StoreOrderSurfaceRole } from "@/lib/messenger/store-order/phase6-bootstrap";
import { PHASE8B_BADGE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export type OrderStatusContributionPhase8b = Readonly<{
  kind: "order_status";
  viewerUserId: string;
  surfaceRole: StoreOrderSurfaceRole;
  storeId: string | null;
  /** store_order:{orderId} 형태의 actionable 주문 identity */
  actionableOrderIdentityKeys: ReadonlyArray<string>;
  generation: number;
  computedAt: string;
}>;

export type StoreOrderUnreadContributionPhase8b = Readonly<{
  domain: "store_order";
  viewerUserId: string;
  surfaceRole: StoreOrderSurfaceRole;
  storeId: string | null;
  unreadOrderIdentityKeys: ReadonlyArray<string>;
  unreadMessageCount: number;
  unreadRoomCount: number;
  generation: number;
  computedAt: string;
}>;

export type DeliveryNavUnionResult = Readonly<{
  surfaceRole: StoreOrderSurfaceRole;
  storeId: string | null;
  badgeCount: number;
  unionIdentityKeys: ReadonlyArray<string>;
  /** 원본 분리 보존 */
  orderStatusKeys: ReadonlyArray<string>;
  unreadStoreOrderKeys: ReadonlyArray<string>;
  usedArithmeticSum: false;
}>;

function assertIdentityKeys(keys: ReadonlyArray<string>, label: string): void {
  for (const k of keys) {
    if (!k.startsWith("store_order:")) {
      throw new Error(`dibay_delivery_nav_identity_required:${label}:${k}`);
    }
  }
}

function assertSameSurface(
  a: { surfaceRole: StoreOrderSurfaceRole; storeId: string | null; viewerUserId: string },
  b: { surfaceRole: StoreOrderSurfaceRole; storeId: string | null; viewerUserId: string }
): void {
  if (a.surfaceRole !== b.surfaceRole) {
    throw new Error("dibay_delivery_nav_surface_mix_forbidden");
  }
  if (a.viewerUserId !== b.viewerUserId) {
    throw new Error("dibay_delivery_nav_viewer_mismatch");
  }
  if (a.surfaceRole === "owner") {
    if (!a.storeId || !b.storeId || a.storeId !== b.storeId) {
      throw new Error("dibay_delivery_nav_owner_store_mismatch");
    }
  }
}

/**
 * unique(actionableOrderIdentityKeys ∪ unreadStoreOrderIdentityKeys).size
 * countA + countB 금지.
 */
export function aggregateDeliveryNavUnion(input: {
  orderStatus: OrderStatusContributionPhase8b;
  storeOrderUnread: StoreOrderUnreadContributionPhase8b;
}): DeliveryNavUnionResult {
  if (PHASE8B_BADGE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8b_delivery_nav_production_wiring_forbidden");
  }
  assertSameSurface(input.orderStatus, input.storeOrderUnread);
  assertIdentityKeys(input.orderStatus.actionableOrderIdentityKeys, "order_status");
  assertIdentityKeys(input.storeOrderUnread.unreadOrderIdentityKeys, "store_order_unread");

  const union = new Set<string>();
  for (const k of input.orderStatus.actionableOrderIdentityKeys) {
    const t = k.trim();
    if (t) union.add(t);
  }
  for (const k of input.storeOrderUnread.unreadOrderIdentityKeys) {
    const t = k.trim();
    if (t) union.add(t);
  }

  return {
    surfaceRole: input.orderStatus.surfaceRole,
    storeId: input.orderStatus.storeId,
    badgeCount: union.size,
    unionIdentityKeys: [...union].sort(),
    orderStatusKeys: [...input.orderStatus.actionableOrderIdentityKeys],
    unreadStoreOrderKeys: [...input.storeOrderUnread.unreadOrderIdentityKeys],
    usedArithmeticSum: false,
  };
}

/** 단순 산술 합 API — 존재하면 계약 위반이므로 throw */
export function deliveryNavArithmeticSum(_a: number, _b: number): never {
  throw new Error("dibay_delivery_nav_arithmetic_sum_forbidden");
}
