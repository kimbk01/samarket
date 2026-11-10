import type { MessageKey } from "@/lib/i18n/messages";
import { isMessengerArchiveSearch } from "@/lib/community-messenger/messenger-archive-route";

/**
 * 채팅 하위 화면 주소 (채팅 시안 4판 「6. 그룹 대화」·「7. 채팅 설정」·「8. 채팅 검색」, Owner 「정확히 시안대로」 2026-11-10).
 * 보관함(`section=archive`)과 같은 방식 — `/community-messenger` 주소의 `section` 값으로 연다.
 * - `section=pick&mode=direct|group` = 친구 고르기 (1:1 대화 · 그룹 대화)
 * - `section=settings` (+ `&settings=call|conversation|meeting|friends`) = 채팅 설정 첫 화면 (· 상세)
 * - `section=search` = 채팅 검색
 * 머리글은 공통 하위 화면 머리글(`DetailHeader` — 뒤로 + 가운데 제목)이고 제목·뒤로 주소는 이 주소만으로 정한다(첫 프레임부터 같음).
 * 이 `section` 값은 대화·친구·통화 탭이 아니다 — `resolveMessengerSection` 은 「대화」로 읽고(아래 목록 유지), 화면은 하위 화면이 덮는다.
 */
export const MESSENGER_PICK_MODE_QUERY_KEY = "mode";
export const MESSENGER_SETTINGS_PAGE_QUERY_KEY = "settings";

export type MessengerPickMode = "direct" | "group";
export type MessengerSettingsPage = "root" | "call" | "conversation" | "meeting" | "friends";

export type MessengerSubScreen =
  | { kind: "pick"; mode: MessengerPickMode }
  | { kind: "settings"; page: MessengerSettingsPage }
  | { kind: "search" };

/** 하위 화면 `section` 값 — 대화·친구·통화·보관함 탭 값과 겹치지 않는다 */
export const MESSENGER_SUB_SCREEN_SECTIONS = ["pick", "settings", "search"] as const;

const SETTINGS_DETAIL_PAGES: readonly MessengerSettingsPage[] = ["call", "conversation", "meeting", "friends"];

function toParams(search: string | URLSearchParams | null | undefined): URLSearchParams | null {
  if (search == null) return null;
  return typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
}

export function parseMessengerSubScreen(search: string | URLSearchParams | null | undefined): MessengerSubScreen | null {
  const qs = toParams(search);
  if (!qs) return null;
  const section = qs.get("section")?.trim() ?? "";
  if (section === "pick") {
    return { kind: "pick", mode: qs.get(MESSENGER_PICK_MODE_QUERY_KEY)?.trim() === "group" ? "group" : "direct" };
  }
  if (section === "settings") {
    const raw = qs.get(MESSENGER_SETTINGS_PAGE_QUERY_KEY)?.trim() ?? "";
    const page = (SETTINGS_DETAIL_PAGES as readonly string[]).includes(raw) ? (raw as MessengerSettingsPage) : "root";
    return { kind: "settings", page };
  }
  if (section === "search") return { kind: "search" };
  return null;
}

/** 화면 상태 비교용 한 줄 키 (`pick:group` · `settings:call` · `search`) */
export function messengerSubScreenKey(screen: MessengerSubScreen | null): string | null {
  if (!screen) return null;
  if (screen.kind === "pick") return `pick:${screen.mode}`;
  if (screen.kind === "settings") return `settings:${screen.page}`;
  return "search";
}

export function parseMessengerSubScreenKey(key: string | null | undefined): MessengerSubScreen | null {
  if (!key) return null;
  const [kind, value] = key.split(":");
  if (kind === "pick") return { kind: "pick", mode: value === "group" ? "group" : "direct" };
  if (kind === "settings") {
    const page = (SETTINGS_DETAIL_PAGES as readonly string[]).includes(value ?? "")
      ? (value as MessengerSettingsPage)
      : "root";
    return { kind: "settings", page };
  }
  if (kind === "search") return { kind: "search" };
  return null;
}

export function buildMessengerSubScreenHref(screen: MessengerSubScreen, from?: string | null): string {
  const qs = new URLSearchParams();
  qs.set("section", screen.kind);
  if (screen.kind === "pick") qs.set(MESSENGER_PICK_MODE_QUERY_KEY, screen.mode);
  if (screen.kind === "settings" && screen.page !== "root") qs.set(MESSENGER_SETTINGS_PAGE_QUERY_KEY, screen.page);
  const f = from?.trim();
  if (f) qs.set("from", f);
  return `/community-messenger?${qs.toString()}`;
}

/** 하위 화면 제목 키 */
export function messengerSubScreenTitleKey(screen: MessengerSubScreen): MessageKey {
  if (screen.kind === "pick") {
    return screen.mode === "group" ? "cm_ui_new_conversation_group" : "cm_ui_new_conversation_direct";
  }
  if (screen.kind === "search") return "cm_chat_search_title";
  switch (screen.page) {
    case "call":
      return "cm_settings_page_call";
    case "conversation":
      return "cm_settings_page_conversation";
    case "meeting":
      return "cm_settings_page_meeting";
    case "friends":
      return "cm_settings_page_friends";
    default:
      return "cm_settings_title";
  }
}

/**
 * 기록이 없을 때 뒤로 주소 — 설정 상세 = 설정 첫 화면, 나머지(설정 첫 화면·친구 고르기·검색) = 대화 탭.
 * 기록이 있으면 머리글 뒤로는 기록 back(들어온 화면)이 우선이다(`preferHistoryBack`).
 */
export function messengerSubScreenBackHref(screen: MessengerSubScreen, from?: string | null): string {
  if (screen.kind === "settings" && screen.page !== "root") {
    return buildMessengerSubScreenHref({ kind: "settings", page: "root" }, from);
  }
  const qs = new URLSearchParams();
  qs.set("section", "chats");
  const f = from?.trim();
  if (f) qs.set("from", f);
  return `/community-messenger?${qs.toString()}`;
}

/** 채팅 하위 화면(친구 고르기·설정·검색) 1단 머리글 — 제목과 뒤로(기록 없을 때) 주소. 하위 화면 주소가 아니면 null. */
export function resolveMessengerSubScreenTier1(
  search: string | URLSearchParams | null | undefined
): { titleText: MessageKey; backHref: string } | null {
  const qs = toParams(search);
  const screen = parseMessengerSubScreen(qs);
  if (!qs || !screen) return null;
  return { titleText: messengerSubScreenTitleKey(screen), backHref: messengerSubScreenBackHref(screen, qs.get("from")) };
}

/** 대화·친구·통화 탭이 아닌 채팅 하위 화면(보관함 · 친구 고르기 · 설정 · 검색) 주소인가 — 허브 머리글 대신 공통 하위 화면 머리글 */
export function isMessengerHomeSubScreenSearch(search: string | URLSearchParams | null | undefined): boolean {
  return isMessengerArchiveSearch(search) || parseMessengerSubScreen(search) != null;
}
