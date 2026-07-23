/**
 * Phase 8B — Atomic mark-read RPC TypeScript 계약.
 * production route 에서 호출 금지 (D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING = false).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
  D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
} from "@/lib/messenger/contracts/domain-read-unread-badge";

export const DIBAY_MESSENGER_DOMAIN_ATOMIC_MARK_READ_RPC =
  "dibay_messenger_domain_atomic_mark_read" as const;

export const DIBAY_STORE_ORDER_ATOMIC_MARK_READ_RPC =
  "dibay_store_order_atomic_mark_read" as const;

export type AtomicMarkReadRpcSuccess = Readonly<{
  status: "consistent";
  domain: ChatDomain;
  identityKey: string;
  roomId: string;
  participantUnreadCount: number;
  clearedTargetCount: number;
  clearedNotificationEventCount: number;
  remainingDomainUnreadMessageCount: number;
  remainingDomainUnreadRoomCount: number;
  /** user + current chatDomain unread notification events */
  remainingDomainNotificationEventCount: number;
  /** user 전역 unread notification events */
  remainingGlobalNotificationEventCount: number;
  generation: number;
  idempotencyKey: string;
}>;

export type AtomicMarkReadRpcFailure = Readonly<{
  status: "forbidden" | "stale" | "identity_mismatch" | "domain_mismatch" | "rollback";
  domain?: ChatDomain | null;
  roomId?: string | null;
  reason: string;
  /** transaction rolled back — no partial persist */
  rolledBack: true;
}>;

export type AtomicMarkReadRpcResult = AtomicMarkReadRpcSuccess | AtomicMarkReadRpcFailure;

export type MessengerDomainAtomicMarkReadArgs = Readonly<{
  p_user_id: string;
  p_room_id: string;
  p_chat_domain: "general_direct" | "group" | "trade";
  p_domain_identity_key: string;
  p_generation: number;
  p_last_read_message_id: string | null;
  p_idempotency_key: string;
}>;

export type StoreOrderAtomicMarkReadArgs = Readonly<{
  p_user_id: string;
  p_room_id: string;
  p_chat_domain: "store_order";
  p_domain_identity_key: string;
  p_generation: number;
  p_last_read_message_id: string | null;
  p_idempotency_key: string;
  p_surface_role: "customer" | "owner";
  p_order_id: string;
  p_store_id: string;
}>;

/**
 * Call2 / after() 정리 계획 (권위 = Atomic RPC 단일 writer).
 * production 전환은 cutover Phase 에서만.
 */
export const PHASE8B_CALL2_AFTER_CLEANUP_PLAN = {
  authorityWriter: "atomic_rpc_single",
  postNotificationRoomRead: "demote_to_read_only_verify_or_remove_at_cutover",
  afterEngineShadow: "must_not_be_claimed_as_atomicity",
  bestEffortTargetClear: "remove_as_second_writer_at_cutover",
  dualWriterInProduction: false,
  productionWiringNow: D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING,
  rpcImplemented: D1_1_ATOMIC_READ_RPC_IMPLEMENTED,
} as const;

export function assertAtomicRpcNotCalledInProductionWiring(): void {
  if (D1_1_ATOMIC_READ_RPC_PRODUCTION_WIRING) {
    throw new Error("dibay_phase8b_atomic_rpc_production_wiring_must_remain_false");
  }
}

/**
 * Migration SQL 정적 가드 — trade target_type alone clear 금지.
 */
export function assertAtomicMarkReadSqlTradeTargetIdentityScoped(migrationSql: string): void {
  if (/OR\s*\(\s*p_chat_domain\s*=\s*'trade'\s*AND\s*nt\.target_type\s*=\s*'trade'\s*\)/.test(migrationSql)) {
    throw new Error("dibay_atomic_mark_read_trade_target_type_only_clear_forbidden");
  }
  if (!/remainingDomainNotificationEventCount/.test(migrationSql)) {
    throw new Error("dibay_atomic_mark_read_missing_domain_event_count");
  }
  if (!/remainingGlobalNotificationEventCount/.test(migrationSql)) {
    throw new Error("dibay_atomic_mark_read_missing_global_event_count");
  }
  if (/remainingNotificationEventCount/.test(migrationSql)) {
    throw new Error("dibay_atomic_mark_read_ambiguous_global_event_count_key_forbidden");
  }
  // identity must be required on target clear (not OR'd as optional alone without room)
  if (!/nt\.domain_identity_key\s*=\s*btrim\(p_domain_identity_key\)/.test(migrationSql)) {
    throw new Error("dibay_atomic_mark_read_target_identity_required");
  }
}

export type AtomicHarnessNotificationTarget = Readonly<{
  targetType: "chat_room" | "trade" | "other";
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string | null;
  scope: string;
  unread: boolean;
}>;

export type AtomicHarnessNotificationEvent = Readonly<{
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
  unread: boolean;
}>;

/**
 * Pure predicate mirroring CM RPC target clear (trade identity scoped).
 */
export function wouldClearNotificationTargetOnMarkRead(input: {
  chatDomain: "general_direct" | "group" | "trade";
  domainIdentityKey: string;
  roomId: string;
  target: AtomicHarnessNotificationTarget;
}): boolean {
  const t = input.target;
  if (!t.unread) return false;
  if (t.chatDomain !== input.chatDomain) return false;
  if (t.domainIdentityKey !== input.domainIdentityKey) return false;
  if (!["consumer", "user", "member"].includes(t.scope)) return false;
  if (t.targetType === "chat_room" && t.roomId === input.roomId) return true;
  if (input.chatDomain === "trade" && t.targetType === "trade") return true;
  return false;
}

export function wouldClearNotificationEventOnMarkRead(input: {
  chatDomain: ChatDomain;
  domainIdentityKey: string;
  roomId: string;
  event: AtomicHarnessNotificationEvent;
}): boolean {
  const e = input.event;
  if (!e.unread) return false;
  if (e.chatDomain !== input.chatDomain) return false;
  return e.roomId === input.roomId || e.domainIdentityKey === input.domainIdentityKey;
}

/**
 * Isolated harness — 권위 단계 중 하나라도 fail 이면 형편 변경 0 (rollback 시뮬).
 * partial 저장 금지.
 */
export type AtomicHarnessAuthorityState = Readonly<{
  participantUnread: number;
  targetUnread: number;
  eventUnread: number;
  generation: number;
}>;

export function simulateAtomicMarkReadTransaction(input: {
  before: AtomicHarnessAuthorityState;
  generation: number;
  forceFailAt?: "participant" | "target" | "event" | null;
  domainEventUnreadBefore?: number;
  globalEventUnreadBefore?: number;
}): { result: AtomicMarkReadRpcResult; after: AtomicHarnessAuthorityState } {
  assertAtomicRpcNotCalledInProductionWiring();
  const before = { ...input.before };
  if (input.generation < before.generation) {
    return {
      result: {
        status: "stale",
        reason: "stale_generation",
        rolledBack: true,
      },
      after: before,
    };
  }
  if (input.forceFailAt === "participant") {
    return {
      result: { status: "rollback", reason: "participant_failed", rolledBack: true },
      after: before,
    };
  }
  const participantUnread = 0;
  let targetUnread = before.targetUnread;
  let eventUnread = before.eventUnread;
  if (input.forceFailAt === "target") {
    return {
      result: { status: "rollback", reason: "target_failed", rolledBack: true },
      after: before,
    };
  }
  targetUnread = 0;
  if (input.forceFailAt === "event") {
    return {
      result: { status: "rollback", reason: "event_failed", rolledBack: true },
      after: before,
    };
  }
  eventUnread = 0;
  const domainLeft = Math.max(0, (input.domainEventUnreadBefore ?? before.eventUnread) - before.eventUnread);
  const globalLeft = Math.max(0, (input.globalEventUnreadBefore ?? before.eventUnread) - before.eventUnread);
  return {
    result: {
      status: "consistent",
      domain: "general_direct",
      identityKey: "general_direct:a:b",
      roomId: "r",
      participantUnreadCount: participantUnread,
      clearedTargetCount: before.targetUnread > 0 ? 1 : 0,
      clearedNotificationEventCount: before.eventUnread,
      remainingDomainUnreadMessageCount: 0,
      remainingDomainUnreadRoomCount: 0,
      remainingDomainNotificationEventCount: domainLeft,
      remainingGlobalNotificationEventCount: globalLeft,
      generation: input.generation,
      idempotencyKey: "harness",
    },
    after: {
      participantUnread,
      targetUnread,
      eventUnread,
      generation: input.generation,
    },
  };
}
