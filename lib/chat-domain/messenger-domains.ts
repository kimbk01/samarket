import type { ChatRoom, GeneralChatMeta } from "@/lib/types/chat";

/**
 * 제품/런타임에서 구분하는 메신저 도메인 (단일 모듈에 로직 혼합 금지).
 * 관측·로그 라벨은 `domain=` 에 동일 문자열 사용 권장.
 *
 * **사용자에게 보이는 「채팅」은 `trade` · `community`(메신저) · `store_order` 세 가지만** 둔다.
 * `philife` · `store`(쇼핑 통합 스트림) · `voice_call`/`video_call` 은 같은 배열에 있어도
 * 제품 카피·탭 설명에서 3종과 섞지 않는다 — `@/lib/chat-domain/samarket-three-chat-pillars` 참고.
 */
export const MESSENGER_DOMAINS = [
  "trade",
  "philife",
  "store",
  "community",
  "store_order",
  "voice_call",
  "video_call",
] as const;

export type MessengerDomain = (typeof MESSENGER_DOMAINS)[number];

/**
 * 구조화 로그·모니터링 `labels.domain` 권장 값 (문자열은 `MessengerDomain` 과 동일).
 * 통합 채팅 목록처럼 단일 도메인이 아닌 경우는 생략한다.
 */
export const MESSENGER_MONITORING_LABEL_DOMAIN = {
  community: "community",
  trade: "trade",
  store_order: "store_order",
} as const satisfies Record<string, MessengerDomain>;

/** 각 도메인의 소유 코드 경로(에이전트/리뷰 시 교차 import 금지 판단용) */
export const MESSENGER_DOMAIN_OWNERSHIP: Record<
  MessengerDomain,
  readonly string[]
> = {
  trade: ["lib/chats", "lib/chats/server", "app/api/chat"],
  philife: ["lib/chats", "app/(main)/philife"],
  store: ["lib/chats", "lib/chats/server"],
  community: ["lib/community-messenger", "app/api/community-messenger"],
  store_order: ["lib/order-chat", "lib/shared-order-chat", "app/api/order-chat"],
  voice_call: ["lib/community-messenger", "app/api/community-messenger/calls"],
  video_call: [
    "lib/community-messenger/call-media-stack",
    "app/api/community-messenger/calls",
  ],
};

/**
 * 통합 `ChatRoom` 메타에서 UI·API 분기용 도메인 추론.
 * 커뮤니티 전용 라우트(부트스트랩만 쓰는 경우)는 별도 진입점에서 `"community"` 를 명시한다.
 */
export function inferMessengerDomainFromChatRoom(
  room: Pick<ChatRoom, "chatDomain" | "generalChat">
): MessengerDomain {
  const g: GeneralChatMeta | null | undefined = room.generalChat;
  if (g?.kind === "store_order") return "store_order";
  if (
    g?.kind === "community" ||
    g?.kind === "group" ||
    g?.kind === "open_chat" ||
    g?.kind === "business" ||
    g?.kind === "legacy_general"
  ) {
    return "community";
  }
  const d = room.chatDomain;
  if (d === "trade" || d === "philife" || d === "store") return d;
  if (d === "community" || d === "store_order") return d;
  return "trade";
}
