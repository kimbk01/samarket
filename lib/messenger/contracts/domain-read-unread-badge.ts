/**
 * Phase 8A/8B — Domain Read / Unread / Badge Architecture SSOT.
 * Phase 8B: D1-2 단위 LOCK · D1-1 Atomic RPC migration 작성 (production wiring 금지).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  D1_2_APP_ICON_UNIT,
  D1_2_APP_ICON_UNIT_OPEN,
} from "@/lib/messenger/contracts/badge-unit-policy-phase8b";

export const PHASE8A_BADGE_PRODUCTION_WIRING = false as const;

/**
 * D1-1: Atomic RPC SQL 은 작성됨. production route wiring / cutover 는 미적용.
 */
export const D1_1_ATOMIC_READ_RPC_OPEN = false as const;
export const D1_1_ATOMIC_READ_RPC_IMPLEMENTED = true as const;
export const D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING = false as const;

export { D1_2_APP_ICON_UNIT_OPEN, D1_2_APP_ICON_UNIT };

export type DomainReadAuthority =
  | "participant_cursor"
  | "badge_target"
  | "notification_event";

export type DomainUnreadSourceAuthority =
  | "server_snapshot"
  | "domain_cache"
  | "realtime_patch";

export type DomainReadRequest = Readonly<{
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
  viewerUserId: string;
  generation: number;
  readCursor?: string | null;
  lastReadMessageId?: string | null;
  idempotencyKey: string;
}>;

export type DomainReadTransactionPlan = Readonly<{
  domain: ChatDomain;
  roomId: string;
  identityKey: string;
  viewerUserId: string;
  generation: number;
  idempotencyKey: string;
  authorities: ReadonlyArray<DomainReadAuthority>;
  atomicRpcName:
    | "dibay_messenger_domain_atomic_mark_read"
    | "dibay_store_order_atomic_mark_read";
  d1_1Open: typeof D1_1_ATOMIC_READ_RPC_OPEN;
  d1_1Implemented: typeof D1_1_ATOMIC_READ_RPC_IMPLEMENTED;
  productionWiring: typeof D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING;
  notes: "participant_cursor + badge_target + notification_event must succeed together in one DB transaction";
}>;

export type DomainReadConsistencyResult =
  | Readonly<{
      status: "consistent";
      domain: ChatDomain;
      roomId: string;
      generation: number;
      appliedAuthorities: ReadonlyArray<DomainReadAuthority>;
      unreadMessageCountAfter: number;
      unreadRoomCleared: true;
      plan: DomainReadTransactionPlan;
    }>
  | Readonly<{
      status: "partial";
      domain: ChatDomain;
      roomId: string;
      generation: number;
      appliedAuthorities: ReadonlyArray<DomainReadAuthority>;
      failedAuthorities: ReadonlyArray<DomainReadAuthority>;
      plan: DomainReadTransactionPlan;
      treatedAsSuccess: false;
      rolledBack: true;
    }>
  | Readonly<{
      status: "stale";
      domain: ChatDomain;
      roomId: string;
      currentGeneration: number;
      incomingGeneration: number;
    }>
  | Readonly<{
      status: "forbidden";
      domain: ChatDomain;
      roomId: string;
      reason: string;
    }>
  | Readonly<{
      status: "duplicate";
      domain: ChatDomain;
      roomId: string;
      idempotencyKey: string;
      priorStatus: DomainReadConsistencyResult["status"];
    }>
  | Readonly<{
      status: "identity_mismatch" | "domain_mismatch" | "rollback";
      domain: ChatDomain;
      roomId: string;
      reason: string;
    }>;

export type DomainUnreadContribution = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  unreadMessageCount: number;
  unreadRoomCount: number;
  unreadIdentityKeys: ReadonlyArray<string>;
  latestUnreadGeneration: number;
  generation: number;
  sourceAuthority: DomainUnreadSourceAuthority;
  computedAt: string;
  surfaceRole?: "customer" | "owner" | null;
  storeId?: string | null;
}>;

export type GeneralDirectUnreadContribution = DomainUnreadContribution & {
  domain: "general_direct";
};
export type GroupUnreadContribution = DomainUnreadContribution & { domain: "group" };
export type TradeUnreadContribution = DomainUnreadContribution & { domain: "trade" };
export type StoreOrderUnreadContribution = DomainUnreadContribution & {
  domain: "store_order";
  surfaceRole: "customer" | "owner";
  storeId: string | null;
  unreadOrderIdentityKeys: ReadonlyArray<string>;
};

export type DomainAppIconContribution = Readonly<{
  domain: ChatDomain;
  viewerUserId: string;
  unreadMessageCount: number;
  unreadRoomCount: number;
  notificationEventCount: number;
  generation: number;
  d1_2UnitSelection: typeof D1_2_APP_ICON_UNIT;
  d1_2Open: typeof D1_2_APP_ICON_UNIT_OPEN;
}>;

export type OrderStatusContribution = Readonly<{
  kind: "order_status";
  viewerUserId: string;
  orderStatusCount: number;
  actionableOrderIdentityKeys: ReadonlyArray<string>;
  generation: number;
  computedAt: string;
}>;

export function buildDomainReadTransactionPlan(
  req: DomainReadRequest
): DomainReadTransactionPlan {
  const rpc =
    req.chatDomain === "store_order"
      ? ("dibay_store_order_atomic_mark_read" as const)
      : ("dibay_messenger_domain_atomic_mark_read" as const);
  return {
    domain: req.chatDomain,
    roomId: req.roomId.trim(),
    identityKey: req.domainIdentityKey.trim(),
    viewerUserId: req.viewerUserId.trim(),
    generation: req.generation,
    idempotencyKey: req.idempotencyKey.trim(),
    authorities: ["participant_cursor", "badge_target", "notification_event"],
    atomicRpcName: rpc,
    d1_1Open: D1_1_ATOMIC_READ_RPC_OPEN,
    d1_1Implemented: D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
    productionWiring: D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
    notes: "participant_cursor + badge_target + notification_event must succeed together in one DB transaction",
  };
}

export function assertPhase8aBadgeProductionWiringOff(): void {
  if (PHASE8A_BADGE_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8a_badge_production_wiring_must_remain_false");
  }
}

export function assertCountUnitsNotMixed(input: {
  labeledAs: "message" | "room" | "notification_event";
  valueUsedAs?: "message" | "room" | "notification_event";
}): void {
  if (input.valueUsedAs && input.valueUsedAs !== input.labeledAs) {
    throw new Error(
      `dibay_badge_count_unit_mixed:${input.labeledAs}->${input.valueUsedAs}`
    );
  }
}

export function assertShellDoesNotConvertUnreadUnits(op: string): never {
  throw new Error(`dibay_shell_forbids_unread_unit_conversion:${op}`);
}
