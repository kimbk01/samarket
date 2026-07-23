/**
 * 채팅 홈 화면 구조 계약 (UX 유지 · Domain 소유권만 분리).
 *
 * 사용자에게 보이는 진입 구조는 바꾸지 않는다.
 * Shell 은 완성 ViewModel 만 조합한다. 원본 Room[] 재분류 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

/** 채팅 홈에 직접 나열되는 Domain — trade/store_order 금지 */
export const MESSENGER_HOME_INBOX_ROW_DOMAINS = ["general_direct", "group"] as const;
export type MessengerHomeInboxRowDomain = (typeof MESSENGER_HOME_INBOX_ROW_DOMAINS)[number];

/** 허브 행만 홈에 표시 — 전용 리스트로 진입 */
export const MESSENGER_HOME_HUB_DOMAINS = ["trade", "store_order"] as const;
export type MessengerHomeHubDomain = (typeof MESSENGER_HOME_HUB_DOMAINS)[number];

export const MESSENGER_HOME_SURFACE_INVARIANTS = [
  "general_direct_and_group_share_inbox_screen",
  "general_direct_and_group_data_authority_independent",
  "trade_only_via_trade_hub_and_trade_list",
  "store_order_only_via_order_hub_and_order_list",
  "trade_or_store_order_row_on_general_inbox_is_fail",
  "messenger_nav_badge_general_direct_plus_group_only",
  "trade_store_order_badges_independent_of_messenger_nav",
  "no_ux_redesign_only_domain_ownership_split",
] as const;

export function assertDomainAllowedOnHomeInboxList(domain: ChatDomain): void {
  if (domain === "trade" || domain === "store_order") {
    throw new Error(`dibay_home_inbox_forbids_domain:${domain}`);
  }
  if (domain !== "general_direct" && domain !== "group") {
    throw new Error(`dibay_home_inbox_unknown_domain:${domain}`);
  }
}

export function assertDomainIsHomeHubOnly(domain: ChatDomain): void {
  if (domain !== "trade" && domain !== "store_order") {
    throw new Error(`dibay_home_hub_domain_required:${domain}`);
  }
}

/**
 * Shell 일반 메신저 목록 조합 입력.
 * 각 Domain ListPort 가 만든 RowModel 만 — Room 원본 없음.
 */
export type MessengerHomeInboxComposeInput<TGeneral = unknown, TGroup = unknown> = Readonly<{
  generalDirectRows: ReadonlyArray<TGeneral>;
  groupRows: ReadonlyArray<TGroup>;
  /** 시간순 병합은 Shell 책임 — Domain 재판정 없이 timestamp 만 사용 */
  sortKey: (row: { domain: MessengerHomeInboxRowDomain; lastMessageAt: string }) => string;
}>;

export type MessengerHomeHubSlot<THub> = Readonly<{
  domain: MessengerHomeHubDomain;
  hub: THub;
}>;
