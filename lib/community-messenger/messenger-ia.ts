/**
 * 메신저 1차 정보 구조(IA): 친구 / 채팅 / 모임 / 보관함.
 * 백엔드 도메인 변경 없이 URL·UI 상태만 정리한다.
 */

export type MessengerMainSection = "friends" | "chats" | "open_chat" | "archive" | "call_logs";

/** 메신저 홈 2단 섹션 탭 표시 순서 — 친구 · 통화 · 대화 · 보관함 (+그룹은 헤더 액션만) */
export const MESSENGER_MAIN_SECTION_TAB_ORDER: readonly MessengerMainSection[] = [
  "friends",
  "call_logs",
  "chats",
  "archive",
] as const;

/** 채팅 목록 행·액션 시트가 일반 탭인지 보관함 탭인지(복원·로컬 삭제 범위 문구 분기). `open_chat` 은 모임 탭 전용. */
export type MessengerChatListContext = "default" | "archive" | "open_chat";

export type MessengerArchiveSection =
  | "hidden_friends"
  | "blocked_friends"
  | "muted_chats"
  | "archived_chats"
  | "requests";

/** 받은함/목록 범위(전체·안읽음·고정) — 대화 유형과 한 줄에 섞지 않는다. */
export type MessengerChatInboxFilter = "all" | "unread" | "pinned";

/** 대화 유형(1:1·그룹·거래·배달) — 받은함 필터와 독립 축. */
export type MessengerChatKindFilter = "all" | "direct" | "private_group" | "trade" | "delivery";

/**
 * 모바일 채팅 목록 단일 칩. 현재 UI는 유형 중심(`전체/1:1/그룹/거래/배달`)만 전면 노출하고,
 * `안읽음/고정`은 행 뱃지/핀 표시로 표현한다. 레거시 URL 호환 때문에 타입은 유지한다.
 */
export type MessengerChatListChip =
  | "all"
  | "unread"
  | "pinned"
  | "direct"
  | "private_group"
  | "trade"
  | "delivery";

export const MESSENGER_CHAT_LIST_CHIP_ORDER: readonly MessengerChatListChip[] = [
  "all",
  "direct",
  "private_group",
  "trade",
  "delivery",
] as const;

const CHAT_INBOX_FILTERS: ReadonlySet<string> = new Set(["all", "unread", "pinned"]);
const CHAT_KIND_FILTERS: ReadonlySet<string> = new Set(["all", "direct", "private_group", "trade", "delivery"]);

/** @deprecated URL·상태는 inbox+kind 이원화. 레거시 단일 칩 호환용. */
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
  if (raw === "friends" || raw === "chats" || raw === "archive" || raw === "call_logs") {
    return raw;
  }
  /** 레거시 URL `?section=open_chat` — 탭은 제거, 대화 탭으로 진입 */
  if (raw === "open_chat") return "chats";
  const tab = tabParam?.trim().toLowerCase();
  if (tab === "friends") return "friends";
  if (tab === "open") return "chats";
  if (tab === "archived") return "archive";
  return "chats";
}

/**
 * 채팅 목록 필터: `filter`는 받은함(unread|pinned|all), `kind`는 대화 유형.
 * 예전 단일 `filter=direct` 등은 kind로만 해석한다.
 */
export function resolveMessengerChatFilters(
  filterParam: string | undefined,
  kindParam: string | undefined,
  tabParam: string | undefined
): { inbox: MessengerChatInboxFilter; kind: MessengerChatKindFilter } {
  const f = filterParam?.trim().toLowerCase();
  const tab = tabParam?.trim().toLowerCase();

  const kRaw = kindParam?.trim().toLowerCase();
  let kind: MessengerChatKindFilter = "all";
  if (kRaw && CHAT_KIND_FILTERS.has(kRaw)) {
    kind = kRaw === "all" ? "all" : (kRaw as MessengerChatKindFilter);
  } else if (f && CHAT_KIND_FILTERS.has(f) && f !== "all") {
    kind = f as MessengerChatKindFilter;
  } else {
    if (tab === "friend" || tab === "direct" || tab === "1:1") {
      kind = "direct";
    } else if (tab === "group" || tab === "groups") {
      kind = "private_group";
    } else if (tab === "trade") {
      kind = "trade";
    } else if (tab === "delivery") {
      kind = "delivery";
    }
  }

  let inbox: MessengerChatInboxFilter = "all";
  if (f === "unread" || f === "pinned") {
    inbox = f;
  } else if (f === "all") {
    inbox = "all";
  } else if (!f && (tab === "unread" || tab === "pinned")) {
    inbox = tab === "unread" ? "unread" : "pinned";
  }

  return { inbox, kind };
}

/** 레거시 단일 칩·북마크용: inbox+kind로 복원한 뒤 첫 번째 비-all 축만 반환. */
export function resolveMessengerChatSubFilter(
  filterParam: string | undefined,
  tabParam: string | undefined
): MessengerChatSubFilter {
  const { inbox, kind } = resolveMessengerChatFilters(filterParam, undefined, tabParam);
  if (kind !== "all") return kind;
  if (inbox !== "all") return inbox;
  const f = filterParam?.trim().toLowerCase();
  if (f && CHAT_SUB_FILTERS.has(f)) return f as MessengerChatSubFilter;
  return "all";
}

export function chipToInboxKind(chip: MessengerChatListChip): {
  inbox: MessengerChatInboxFilter;
  kind: MessengerChatKindFilter;
} {
  switch (chip) {
    case "all":
      return { inbox: "all", kind: "all" };
    case "unread":
      return { inbox: "unread", kind: "all" };
    case "pinned":
      return { inbox: "pinned", kind: "all" };
    case "direct":
      return { inbox: "all", kind: "direct" };
    case "private_group":
      return { inbox: "all", kind: "private_group" };
    case "trade":
      return { inbox: "all", kind: "trade" };
    case "delivery":
      return { inbox: "all", kind: "delivery" };
    default:
      return { inbox: "all", kind: "all" };
  }
}

/** inbox+kind → 단일 칩(목록 UI 동기화). */
export function inboxKindToChatListChip(
  inbox: MessengerChatInboxFilter,
  kind: MessengerChatKindFilter
): MessengerChatListChip {
  if (kind !== "all") {
    return kind;
  }
  return "all";
}

export { messengerChatListChipLabelI18n as messengerChatListChipLabel } from "@/lib/community-messenger/messenger-ia-i18n";

export function messengerChatFiltersToSearchParams(inbox: MessengerChatInboxFilter, kind: MessengerChatKindFilter): URLSearchParams {
  const qs = new URLSearchParams();
  if (inbox === "unread" || inbox === "pinned") {
    qs.set("filter", inbox);
  }
  if (kind !== "all") {
    qs.set("kind", kind);
  }
  return qs;
}

export { messengerSectionLabelI18n as messengerSectionLabel } from "@/lib/community-messenger/messenger-ia-i18n";

export function messengerFriendSwipeItemId(userId: string): string {
  return `friend:swipe:${String(userId ?? "").trim()}`;
}

export function messengerFriendMenuItemId(userId: string): string {
  return `friend:menu:${String(userId ?? "").trim()}`;
}

/**
 * Extract `userId` from Friends-tab swipe / quick-menu interaction ids.
 * Validates open UI against bootstrap `friends` even when derived list sets lag a frame.
 */

export function messengerFriendUserIdFromListInteractionId(interactionId: string): string | null {
  const raw = String(interactionId ?? "").trim();
  if (!raw) return null;
  const menuPrefix = "friend:menu:";
  if (raw.startsWith(menuPrefix)) {
    const uid = raw.slice(menuPrefix.length).trim();
    return uid || null;
  }
  const m = /^friend:swipe:(.+):(left|right)$/.exec(raw);
  if (!m?.[1]) return null;
  const uid = String(m[1]).trim();
  return uid || null;
}

export function messengerRoomSwipeItemId(roomId: string, listContext: MessengerChatListContext = "default"): string {
  return `room:swipe:${listContext}:${String(roomId ?? "").trim()}`;
}

export function messengerRoomMenuItemId(roomId: string, listContext: MessengerChatListContext = "default"): string {
  return `room:menu:${listContext}:${String(roomId ?? "").trim()}`;
}

export {
  messengerChatInboxFilterLabelI18n as messengerChatInboxFilterLabel,
  messengerChatKindFilterLabelI18n as messengerChatKindFilterLabel,
  messengerChatSubFilterLabelI18n as messengerChatSubFilterLabel,
  messengerChatListEmptyMessageI18n as messengerChatListEmptyMessage,
  messengerChatListEmptyMessageForChipI18n as messengerChatListEmptyMessageForChip,
} from "@/lib/community-messenger/messenger-ia-i18n";
