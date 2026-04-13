/**
 * 사마켓 제품·에이전트 기준 **사용자에게 보이는 「채팅」은 아래 세 가지만** 둔다.
 *
 * - **Philife**(`philife`), **스토어 쇼핑 통합 채팅 스트림**(`store`), **음성·영상**(`voice_call`/`video_call`)은
 *   `MESSENGER_DOMAINS` 에 남아 있어도 **네 번째 채팅이 아니다** — 구현·문서·카피에서 3종과 섞지 않는다.
 *
 * @see `lib/chat-domain/messenger-domains.ts` — 런타임 도메인 키 전체
 * @see `lib/chat-domain/ports/call-signaling-boundary.ts` — 통화는 텍스트 채팅 API와 분리
 */

/** 사용자 대면 채팅 채널 식별자 (하단 탭·허브와 정렬) */
export const SAMARKET_CHAT_PILLAR_IDS = ["trade", "community", "store_order"] as const;
export type SamarketChatPillarId = (typeof SAMARKET_CHAT_PILLAR_IDS)[number];

export const SAMARKET_CHAT_PILLARS = {
  trade: {
    id: "trade" as const satisfies SamarketChatPillarId,
    labelKo: "거래 채팅",
    descriptionKo:
      "중고·마켓 상품 문의 등. `lib/chats` 거래 세그먼트, 목록·일반 방은 메신저(`?section=chats&kind=trade`, `/community-messenger/rooms/…`), 후기 진입만 `/chats/…?review=1`.",
    messengerDomainKey: "trade" as const,
    codePaths: ["lib/chats", "lib/chats/server", "app/api/chat"] as const,
  },
  messenger: {
    id: "community" as const satisfies SamarketChatPillarId,
    labelKo: "메신저",
    descriptionKo:
      "친구·그룹·오픈채팅 등 **전용 허브** — `lib/community-messenger`, `/community-messenger` 만. Philife 탭과 동일 제품으로 취급하지 않는다.",
    messengerDomainKey: "community" as const,
    codePaths: ["lib/community-messenger", "app/api/community-messenger"] as const,
  },
  storeOrder: {
    id: "store_order" as const satisfies SamarketChatPillarId,
    labelKo: "배달·매장 주문 채팅",
    descriptionKo:
      "주문 단위 채팅. `lib/order-chat`, `generalChat.kind === \"store_order\"`. **`store`(통합 채팅 스트림)와 이름·도메인이 다르다.**",
    messengerDomainKey: "store_order" as const,
    codePaths: ["lib/order-chat", "lib/shared-order-chat", "app/api/order-chat"] as const,
  },
} as const;

/**
 * 3종 채팅과 **혼동하면 안 되는** 표면 — 같은 앱 안에 있어도 제품 문구·탭·로그에서 분리한다.
 */
export const SAMARKET_CHAT_BOUNDARY_NOT_PILLARS = {
  philife: {
    messengerDomainKeys: ["philife"] as const,
    labelKo: "Philife 연동 채팅",
    noteKo: "피드·게시판 쪽 DM/채팅은 `lib/chats` philife 세그먼트. **메신저 허브와 별도 표면.**",
    codePaths: ["lib/chats", "app/(main)/philife"] as const,
  },
  storeUnifiedChatStream: {
    messengerDomainKeys: ["store"] as const,
    labelKo: "스토어(쇼핑) 통합 채팅 스트림",
    noteKo: "`lib/chats` store 세그먼트. **주문 채팅(`store_order`)이 아니다.**",
    codePaths: ["lib/chats", "lib/chats/server"] as const,
  },
  voiceAndVideo: {
    messengerDomainKeys: ["voice_call", "video_call"] as const,
    labelKo: "음성·영상 통화",
    noteKo: "시그널·ICE 전용. **텍스트 채팅 3종의 확장이 아니다.**",
    codePaths: ["lib/community-messenger", "app/api/community-messenger/calls"] as const,
  },
} as const;

/** `MessengerDomain` 키가 사용자 대면 「채팅 3종」에 해당하는지 */
export function isSamarketChatPillarMessengerDomain(
  domain: string
): domain is "trade" | "community" | "store_order" {
  return domain === "trade" || domain === "community" || domain === "store_order";
}
