/**
 * 메신저 1차 정보 구조(IA): 친구 / 채팅 / 오픈채팅 / 보관함.
 * 백엔드 도메인 변경 없이 URL·UI 상태만 정리한다.
 */

export type MessengerMainSection = "friends" | "chats" | "open_chat" | "archive";

/** 받은함/목록 범위(전체·안읽음·고정) — 대화 유형과 한 줄에 섞지 않는다. */
export type MessengerChatInboxFilter = "all" | "unread" | "pinned";

/** 대화 유형(1:1·그룹·거래·배달) — 받은함 필터와 독립 축. */
export type MessengerChatKindFilter = "all" | "direct" | "private_group" | "trade" | "delivery";

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
  if (raw === "friends" || raw === "chats" || raw === "open_chat" || raw === "archive") {
    return raw;
  }
  const tab = tabParam?.trim().toLowerCase();
  if (tab === "friends") return "friends";
  if (tab === "open") return "open_chat";
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

export function messengerChatInboxFilterLabel(filter: MessengerChatInboxFilter): string {
  switch (filter) {
    case "all":
      return "전체";
    case "unread":
      return "안읽음";
    case "pinned":
      return "고정";
    default:
      return "전체";
  }
}

export function messengerChatKindFilterLabel(filter: MessengerChatKindFilter): string {
  switch (filter) {
    case "all":
      return "전체";
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

export function messengerChatSubFilterLabel(filter: MessengerChatSubFilter): string {
  if (CHAT_INBOX_FILTERS.has(filter)) {
    return messengerChatInboxFilterLabel(filter as MessengerChatInboxFilter);
  }
  return messengerChatKindFilterLabel(filter as MessengerChatKindFilter);
}

/**
 * 채팅 목록이 비었을 때 — 거래/배달 탭은 DB `summary` JSON(v1) 또는 키워드로만 분류되므로
 * 일반 대화만 있으면 비어 보이는 것이 정상임을 안내한다.
 */
export function messengerChatListEmptyMessage(kind: MessengerChatKindFilter): string {
  if (kind === "trade") {
    return "거래로 분류된 대화가 없습니다. 중고 거래채팅에서「SAMessenger에서 이 거래 열기」 또는 스토어 주문 채팅에서「SAMessenger에서 이 주문 열기」로 연결하면 맥락이 붙습니다. 친구 이름만 있는 일반 1:1은 거래 탭에 포함되지 않습니다.";
  }
  if (kind === "delivery") {
    return "배달로 분류된 대화가 없습니다. 배달 주문 채팅에서 메신저로 열면 배달 맥락이 붙은 방만 이 탭에 나타납니다.";
  }
  return "조건에 맞는 대화가 없습니다.";
}
