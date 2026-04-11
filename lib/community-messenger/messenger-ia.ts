/**
 * 메신저 1차 정보 구조(IA): 친구 / 채팅 / 오픈채팅 / 보관함.
 * 백엔드 도메인 변경 없이 URL·UI 상태만 정리한다.
 */

export type MessengerMainSection = "friends" | "chats" | "open_chat" | "archive";

/** 채팅 탭 전용 2차 필터 — 친구/관계/보관과 섞지 않는다. */
export type MessengerChatSubFilter =
  | "all"
  | "unread"
  | "pinned"
  | "direct"
  | "private_group"
  | "trade"
  | "delivery";

const CHAT_SUB_FILTERS: ReadonlySet<string> = new Set([
  "all",
  "unread",
  "pinned",
  "direct",
  "private_group",
  "trade",
  "delivery",
]);

export function resolveMessengerSection(
  sectionParam: string | undefined,
  tabParam: string | undefined
): MessengerMainSection {
  const raw = sectionParam?.trim().toLowerCase();
  if (raw === "friends" || raw === "chats" || raw === "open_chat" || raw === "archive") {
    return raw;
  }
  const tab = tabParam?.trim().toLowerCase();
  if (tab === "friends") return "friends";
  if (tab === "open") return "open_chat";
  if (tab === "archived") return "archive";
  return "chats";
}

export function resolveMessengerChatSubFilter(
  filterParam: string | undefined,
  tabParam: string | undefined
): MessengerChatSubFilter {
  const f = filterParam?.trim().toLowerCase();
  if (f && CHAT_SUB_FILTERS.has(f)) return f as MessengerChatSubFilter;

  const tab = tabParam?.trim().toLowerCase();
  if (tab === "unread") return "unread";
  if (tab === "chats" || tab === "all") return "all";
  if (tab === "friend" || tab === "direct" || tab === "1:1") return "direct";
  if (tab === "group" || tab === "groups") return "private_group";
  if (tab === "trade") return "trade";
  if (tab === "delivery") return "delivery";
  if (tab === "pinned") return "pinned";
  if (tab === "all") return "all";
  return "all";
}

export function messengerSectionLabel(section: MessengerMainSection): string {
  switch (section) {
    case "friends":
      return "친구";
    case "chats":
      return "채팅";
    case "open_chat":
      return "오픈채팅";
    case "archive":
      return "보관함";
    default:
      return "채팅";
  }
}

export function messengerChatSubFilterLabel(filter: MessengerChatSubFilter): string {
  switch (filter) {
    case "all":
      return "전체";
    case "unread":
      return "안읽음";
    case "pinned":
      return "고정";
    case "direct":
      return "1:1";
    case "private_group":
      return "그룹";
    case "trade":
      return "거래";
    case "delivery":
      return "배달";
    default:
      return "전체";
  }
}
