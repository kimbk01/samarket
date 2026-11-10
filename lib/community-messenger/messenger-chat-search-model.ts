import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 채팅 검색 (채팅 시안 4판 「8. 채팅 검색」) — 탭 = 전체 · 대화 · 친구 · 메시지.
 * 결과는 홈이 이미 가진 목록에서 찾는다(대화 = 대화방 이름·미리보기, 친구 = 친구 이름, 메시지 = 대화방 마지막 메시지).
 * 서버 메시지 본문 검색 API 는 없다 — 「메시지」는 목록이 가진 마지막 메시지(미리보기)만 찾는다.
 * 「모임」(참여할 수 있는 모임) 결과는 예전 검색 시트에 있던 것을 지우지 않고 「전체」 맨 아래에 둔다.
 */
export type MessengerChatSearchTab = "all" | "rooms" | "friends" | "messages";
export type MessengerChatSearchSection = "rooms" | "friends" | "messages" | "meetings";

export const MESSENGER_CHAT_SEARCH_TABS: readonly { tab: MessengerChatSearchTab; labelKey: MessageKey }[] = [
  { tab: "all", labelKey: "cm_chat_search_tab_all" },
  { tab: "rooms", labelKey: "cm_chat_search_tab_rooms" },
  { tab: "friends", labelKey: "cm_chat_search_tab_friends" },
  { tab: "messages", labelKey: "cm_chat_search_tab_messages" },
];

export function messengerChatSearchSections(tab: MessengerChatSearchTab): readonly MessengerChatSearchSection[] {
  switch (tab) {
    case "rooms":
      return ["rooms"];
    case "friends":
      return ["friends"];
    case "messages":
      return ["messages"];
    default:
      return ["rooms", "friends", "messages", "meetings"];
  }
}

/** 최근 검색 저장 — 맨 앞에 넣고 같은 말은 하나만, 최대 8개 (예전 검색 시트와 같은 규칙) */
export function pushMessengerRecentSearch(prev: readonly string[], value: string): string[] {
  const keyword = value.trim();
  if (!keyword) return [...prev];
  return [keyword, ...prev.filter((item) => item !== keyword)].slice(0, 8);
}
