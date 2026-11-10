import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";

/**
 * 보관함 화면 주소 (채팅 시안 4판, Owner 「정확히 시안대로」 2026-11-10 · docs/design/chat-v4 「4. 보관함」).
 * - `/community-messenger?section=archive` = 보관함 첫 화면 (채팅·친구 묶음 목록)
 * - `&archive=<항목>` = 항목 상세 (보관한 채팅 · 알림 끈 대화 · 숨긴 친구 · 차단한 친구 · 거절한 요청)
 * - `&archiveFrom=friends` = 친구 탭 「관리」·설정 「친구 관리」로 들어옴 → 「친구」 묶음 먼저, 뒤로(기록 없음) = 친구 탭
 * 화면 머리글은 공통 하위 화면 머리글(`DetailHeader` — 뒤로 + 가운데 제목)이고 제목·뒤로 주소는 이 주소만으로 정한다(첫 프레임부터 같음).
 */
export const MESSENGER_ARCHIVE_SECTION_QUERY_KEY = "archive";
export const MESSENGER_ARCHIVE_FROM_QUERY_KEY = "archiveFrom";

/** 보관함으로 들어온 탭 */
export type MessengerArchiveEntry = "chats" | "friends";
/** 보관함 첫 화면 묶음 */
export type MessengerArchiveGroup = "chats" | "friends";

const ARCHIVE_SECTIONS: readonly MessengerArchiveSection[] = [
  "archived_chats",
  "muted_chats",
  "hidden_friends",
  "blocked_friends",
  "requests",
];

export function parseMessengerArchiveSection(raw: string | null | undefined): MessengerArchiveSection | null {
  const v = raw?.trim() ?? "";
  return (ARCHIVE_SECTIONS as readonly string[]).includes(v) ? (v as MessengerArchiveSection) : null;
}

export function parseMessengerArchiveEntry(raw: string | null | undefined): MessengerArchiveEntry {
  return raw?.trim() === "friends" ? "friends" : "chats";
}

/** 친구 탭에서 들어오면 「친구」 묶음 먼저, 대화 탭에서 들어오면 「채팅」 먼저 */
export function messengerArchiveGroupOrder(entry: MessengerArchiveEntry): readonly MessengerArchiveGroup[] {
  return entry === "friends" ? ["friends", "chats"] : ["chats", "friends"];
}

/** 항목 상세 머리글 제목 (보관함 첫 화면 줄 이름과 같은 글자) */
export function messengerArchiveSectionTitleKey(section: MessengerArchiveSection): MessageKey {
  switch (section) {
    case "archived_chats":
      return "cm_archive_row_archived_chats";
    case "muted_chats":
      return "cm_archive_row_muted_chats";
    case "hidden_friends":
      return "cm_archive_row_hidden_friends";
    case "blocked_friends":
      return "cm_archive_row_blocked_friends";
    case "requests":
      return "cm_friend_rejected_section";
    default:
      return "nav_messenger_archive";
  }
}

function withEntryOrigin(qs: URLSearchParams, from: string | null | undefined): URLSearchParams {
  const f = from?.trim();
  if (f) qs.set("from", f);
  return qs;
}

export function buildMessengerArchiveHref(input: {
  entry: MessengerArchiveEntry;
  section?: MessengerArchiveSection | null;
  /** 메신저 진입 출처 `?from=` 유지 */
  from?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("section", "archive");
  if (input.entry === "friends") qs.set(MESSENGER_ARCHIVE_FROM_QUERY_KEY, "friends");
  if (input.section) qs.set(MESSENGER_ARCHIVE_SECTION_QUERY_KEY, input.section);
  return `/community-messenger?${withEntryOrigin(qs, input.from).toString()}`;
}

/** 보관함 첫 화면에서 뒤로(기록 없을 때) — 들어온 탭 */
export function buildMessengerArchiveExitHref(entry: MessengerArchiveEntry, from?: string | null): string {
  const qs = new URLSearchParams();
  qs.set("section", entry === "friends" ? "friends" : "chats");
  return `/community-messenger?${withEntryOrigin(qs, from).toString()}`;
}

export function isMessengerArchiveSearch(search: string | URLSearchParams | null | undefined): boolean {
  if (search == null) return false;
  const qs = typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  return qs.get("section")?.trim() === "archive";
}

/**
 * 보관함(·항목 상세) 1단 머리글 — 제목과 뒤로(기록 없을 때) 주소. 보관함 주소가 아니면 null.
 * 항목 상세의 뒤로 = 보관함 첫 화면, 첫 화면의 뒤로 = 들어온 탭(대화·친구).
 */
export function resolveMessengerArchiveTier1(
  search: string | URLSearchParams | null | undefined
): { titleText: MessageKey; backHref: string } | null {
  if (search == null) return null;
  const qs = typeof search === "string" ? new URLSearchParams(search.replace(/^\?/, "")) : search;
  if (qs.get("section")?.trim() !== "archive") return null;
  const entry = parseMessengerArchiveEntry(qs.get(MESSENGER_ARCHIVE_FROM_QUERY_KEY));
  const from = qs.get("from");
  const section = parseMessengerArchiveSection(qs.get(MESSENGER_ARCHIVE_SECTION_QUERY_KEY));
  if (section) {
    return {
      titleText: messengerArchiveSectionTitleKey(section),
      backHref: buildMessengerArchiveHref({ entry, from }),
    };
  }
  return { titleText: "nav_messenger_archive", backHref: buildMessengerArchiveExitHref(entry, from) };
}
