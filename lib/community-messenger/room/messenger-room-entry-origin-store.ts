/**
 * P5 (Owner 구현 승인 2026-11-18) — 메신저 방이 「어떻게 열렸는가」 단일 판정.
 * 설계: docs/audit/messenger-chat-audit-2026-11-18/appendix-P5-back-navigation-first-tap-design.md §B2
 *
 * - `push`        : 알림 이동(사용자 터치 없는 `router.push`)으로 열림 — 바로 앞 기록이 「알림 이동으로 떠난 항목」.
 * - `first_entry` : 이 방이 앱의 첫 기록(App Link·프로세스 복원 reload 등) — 앱 안 직전 화면이 없음.
 * - `in_app`      : 그 밖 — 앱 안 직전 화면이 있음.
 *
 * 키: Navigation API `currentEntry.key`(reload 뒤에도 유지). Navigation API 가 없으면 `${history.length}:${pathname}`.
 * 저장: sessionStorage 1칸(`dibay:cm-room-entry`, 상한 50) — reload 뒤에도 같은 판정(§A7).
 * replace 는 항목 key 를 유지하므로 기록에 경로를 함께 두고, 경로가 다르면 새로 판정한다.
 * URL 쿼리는 쓰지 않는다 — 네이티브 알림 ACK 가 WebView 주소와 대기 경로를 비교하기 때문(§B2).
 */
import { isEntryLeftByPushNavigation } from "@/lib/push/push-navigation-back";
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";

export type MessengerRoomEntryOrigin = "push" | "in_app" | "first_entry";

type NavEntry = { key: string; index: number };
type NavigationLike = {
  currentEntry: NavEntry | null;
  entries: () => NavEntry[];
};

type EntryOriginRecord = { slot: string; path: string; origin: MessengerRoomEntryOrigin };

export const MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY = "dibay:cm-room-entry";
export const MESSENGER_ROOM_ENTRY_ORIGIN_MAX = 50;

const ORIGINS: ReadonlySet<string> = new Set(["push", "in_app", "first_entry"]);

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.entries !== "function") return null;
  return nav;
}

function readRecords(): EntryOriginRecord[] {
  try {
    const raw = window.sessionStorage.getItem(MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is EntryOriginRecord =>
        r != null &&
        typeof r === "object" &&
        typeof (r as EntryOriginRecord).slot === "string" &&
        typeof (r as EntryOriginRecord).path === "string" &&
        ORIGINS.has((r as EntryOriginRecord).origin)
    );
  } catch {
    return [];
  }
}

function writeRecord(rec: EntryOriginRecord): void {
  try {
    const next = readRecords().filter((r) => r.slot !== rec.slot);
    next.push(rec);
    window.sessionStorage.setItem(
      MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY,
      JSON.stringify(next.slice(-MESSENGER_ROOM_ENTRY_ORIGIN_MAX))
    );
  } catch {
    /* 저장 불가 — 판정은 매번 다시 계산(같은 결과) */
  }
}

function currentSlot(nav: NavigationLike | null): string {
  const key = nav?.currentEntry?.key;
  if (key) return key;
  return `${window.history.length}:${window.location.pathname}`;
}

function deriveOrigin(nav: NavigationLike | null): MessengerRoomEntryOrigin {
  const cur = nav?.currentEntry;
  if (nav && cur && typeof cur.index === "number") {
    if (cur.index <= 0) return "first_entry";
    const prev = nav.entries()[cur.index - 1];
    if (prev && isEntryLeftByPushNavigation(prev.key)) return "push";
    return "in_app";
  }
  return window.history.length <= 1 ? "first_entry" : "in_app";
}

/**
 * 지금 화면(방)의 진입 출처. 방 경로에서 처음 판정한 값은 저장해 reload 뒤에도 같게 한다.
 * 서버 렌더(창 없음)는 `in_app`(= 지금 동작).
 */
export function resolveMessengerRoomEntryOrigin(): MessengerRoomEntryOrigin {
  if (typeof window === "undefined") return "in_app";
  const nav = readNavigation();
  const slot = currentSlot(nav);
  const path = window.location.pathname;
  const saved = readRecords().find((r) => r.slot === slot && r.path === path);
  if (saved) return saved.origin;
  const origin = deriveOrigin(nav);
  if (isCommunityMessengerRoomRoutePathname(path)) writeRecord({ slot, path, origin });
  return origin;
}

/** Tests only. */
export function __resetMessengerRoomEntryOriginForTests(): void {
  try {
    window.sessionStorage.removeItem(MESSENGER_ROOM_ENTRY_ORIGIN_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
