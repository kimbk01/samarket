/**
 * Phase 1 — Domain ownership + Shell 조합 계약.
 * Shell 은 완성 RowModel / Badge count 만 읽고 조합한다. 원본 Room 배열 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertChatDomainOwnership } from "@/lib/chat-domain/ports/domain-ownership";

export const MESSENGER_DOMAIN_PORT_CAPABILITIES = [
  "router",
  "identity",
  "list",
  "row_model",
  "presentation",
  "header",
  "preview",
  "bootstrap",
  "cache",
  "realtime",
  "read",
  "unread",
  "badge",
  "notification",
  "sound",
  "permission",
] as const;

export type MessengerDomainPortCapability = (typeof MESSENGER_DOMAIN_PORT_CAPABILITIES)[number];

/** 기존 ownership assert 재사용 — capability 문자열은 room_identity 등으로 매핑 */
const LEGACY_CAPABILITY_MAP: Record<
  MessengerDomainPortCapability,
  "router" | "room_identity" | "badge" | "unread" | "notification" | "sound" | "bootstrap" | "refresh" | "realtime" | "cache" | "read"
> = {
  router: "router",
  identity: "room_identity",
  list: "bootstrap",
  row_model: "bootstrap",
  presentation: "bootstrap",
  header: "bootstrap",
  preview: "bootstrap",
  bootstrap: "bootstrap",
  cache: "cache",
  realtime: "realtime",
  read: "read",
  unread: "unread",
  badge: "badge",
  notification: "notification",
  sound: "sound",
  permission: "read",
};

export function assertMessengerDomainWrite(
  owner: ChatDomain,
  target: ChatDomain,
  capability: MessengerDomainPortCapability
): void {
  assertChatDomainOwnership(owner, target, LEGACY_CAPABILITY_MAP[capability]);
}

/** Shell 이 받을 수 있는 완성 목록 조각 — 원본 Room[] 아님 */
export type MessengerShellListSlice<TRow = unknown> = Readonly<{
  domain: ChatDomain;
  rows: ReadonlyArray<TRow>;
  generation: string;
}>;

export type MessengerShellBadgeContribution = Readonly<{
  domain: ChatDomain;
  /** Domain SSOT count — Shell 이 수정하지 않음 */
  count: number;
}>;

/**
 * 홈 조합 계약 (타입).
 *
 * 채팅 홈 =
 *   tradeHub (허브 VM) +
 *   storeOrderHub (허브 VM) +
 *   generalDirectRows + groupRows (일반 목록 — Domain RowModel 조합)
 *
 * trade/store_order 방 행은 홈 일반 목록에 넣지 않는다.
 * 원본 Room 배열 flatMap / roomType 재분류 금지.
 */
export type MessengerShellHomeComposeInput = Readonly<{
  generalRows: MessengerShellListSlice;
  groupRows: MessengerShellListSlice;
  tradeHub: MessengerShellBadgeContribution & { previewRow?: unknown; hub?: unknown };
  storeOrderHub: MessengerShellBadgeContribution & { previewRow?: unknown; hub?: unknown };
}>;

export type MessengerShellNavBadgePolicy = Readonly<{
  /** 하단 채팅 = general_direct + group 만 */
  messengerTabDomains: ReadonlyArray<"general_direct" | "group">;
  tradeHubDomain: "trade";
  storeOrderHubDomain: "store_order";
  /** 하단 배달의 주문채팅 contribution */
  deliveryNavStoreOrderContribution: "store_order";
}>;

export const MESSENGER_SHELL_NAV_BADGE_POLICY: MessengerShellNavBadgePolicy = {
  messengerTabDomains: ["general_direct", "group"],
  tradeHubDomain: "trade",
  storeOrderHubDomain: "store_order",
  deliveryNavStoreOrderContribution: "store_order",
};

/** Shell 은 Domain count 를 합산만 — 원본 수정 금지 */
export function sumMessengerShellBadgeContributions(
  contributions: ReadonlyArray<MessengerShellBadgeContribution>
): number {
  let total = 0;
  for (const c of contributions) {
    total += Math.max(0, Math.floor(c.count));
  }
  return total;
}
