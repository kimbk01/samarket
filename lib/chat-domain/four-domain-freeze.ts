/**
 * Phase B freeze — 4 Domain canonical contract (문서 SSOT와 동기).
 * docs/community-messenger/2026-07-23-four-domain-phase-b-freeze.md
 *
 * DO NOT: 런타임 Domain 추론 SSOT로 승격 · pillars `community`와 동일시 · Native Call 수정.
 * Phase C+ 에서 DB 컬럼·API가 이 문자열을 그대로 쓴다.
 */

export const CHAT_DOMAINS = [
  "general_direct",
  "group",
  "trade",
  "store_order",
] as const;

export type ChatDomain = (typeof CHAT_DOMAINS)[number];

export type StoreOrderRole = "customer" | "owner";

/** Identity builders — pure; DB write는 Phase C+ API만. */
export function buildGeneralDirectIdentity(userA: string, userB: string): string {
  const [a, b] = [userA.trim(), userB.trim()].sort();
  return `gd:${a}:${b}`;
}

export function buildGroupIdentity(roomId: string): string {
  return `group:${roomId.trim()}`;
}

export function buildTradeIdentity(
  itemId: string,
  sellerId: string,
  buyerId: string,
): string {
  const [a, b] = [sellerId.trim(), buyerId.trim()].sort();
  return `trade:${itemId.trim()}:${a}:${b}`;
}

/**
 * Room UNIQUE identity (1 order → 1 CM room).
 * Role-scoped keys below are for participant/viewer projection only — not room UNIQUE.
 */
export function buildStoreOrderRoomIdentity(orderId: string): string {
  return `so:order:${orderId.trim()}`;
}

/** Viewer/list/badge projection key — not `community_messenger_rooms.domain_identity`. */
export function buildStoreOrderIdentity(
  role: StoreOrderRole,
  orderId: string,
  actorUserId: string,
): string {
  return `so:${role}:${orderId.trim()}:${actorUserId.trim()}`;
}

/**
 * Surface → 단일 writer 경로 (Phase H). Hub + Domain list + Bell/AppIcon slice-1 wired.
 */
export const TARGET_SURFACE_WRITERS = {
  hubBadge: "lib/chat-domain/projections/hub-badge-projection.ts",
  bellBadge: "lib/chat-domain/projections/bell-badge-projection.ts",
  appIconBadge: "lib/chat-domain/projections/app-icon-badge-projection.ts",
  listGeneralDirect: "lib/chat-domain/list/general-direct-list-writer.ts",
  listGroup: "lib/chat-domain/list/group-list-writer.ts",
  listTrade: "lib/chat-domain/list/trade-list-writer.ts",
  listStoreOrder: "lib/chat-domain/list/store-order-list-writer.ts",
} as const;

/**
 * 7/14 trash — 복원 시 file-lock FAIL.
 * (구 Domain Authority / badge projection 덤프)
 */
export const FORBIDDEN_RESTORE_PATHS = [
  "lib/community-messenger/realtime/domain-room-state-store.ts",
  "lib/community-messenger/realtime/reduce-domain-room-event.ts",
  "lib/notifications/build-notification-badge-projection.ts",
  "lib/messenger/contracts/domain-badge-surface-store.ts",
  "lib/chat-domain/chat-domain.ts",
  /** Phase J deleted — callers were 0 */
  "components/community-messenger/room/CommunityMessengerRoomSegmentShellLayout.tsx",
  "components/community-messenger/room/CommunityMessengerRoomStableEntryShellLight.tsx",
  "components/community-messenger/room/CommunityMessengerRoomRouteEntryShell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomPass0Shell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomPass1StableShell.tsx",
  "components/community-messenger/room/CommunityMessengerRoomStableEntryShell.tsx",
] as const;

/**
 * REMOVE 후보 — Phase J 전 실삭제 금지.
 * optimistic hub: 허용 호출 파일은 아래 집합으로 freeze (신규 호출부 추가 시 FAIL).
 */
export const REMOVE_OPTIMISTIC_HUB_CALLERS_FROZEN = [] as const;

/** Remaining REMOVE chrome — R7b still has product callers (ComposerEarly). */
export const REMOVE_ROOM_CHROME_SHELLS = [
  "components/community-messenger/room/CommunityMessengerRoomPass1ComposerShell.tsx",
] as const;
