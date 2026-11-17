/**
 * N1 (docs/audit/messenger-chat-fix-design-2026-11-18.md PR-2 · 독립 검토 반영 2판) — 알림으로 연 메신저 방의 ◁·‹ 가
 * 「방 종류 목록」으로 갈 때, 그다음 목록의 ◁ 가 이전 방·같은 목록으로 가지 않게 한다.
 *
 * 원칙: Chromium 「건너뛰기」 항목을 추측하지 않는다. Navigation API `navigation.entries()`(url·key·index)로 웹이 목적지를
 * 직접 정하고 `navigation.traverseTo(key)` 로 이동한다(웹이 부르는 이동은 건너뛰기 규칙과 무관 —
 * docs/design/push-entry-back-fix-design-2026-11-13.md §1 의 `history.back()` 실측 근거. traverseTo 의 실기 동작은 NOT_PROVEN).
 *
 * (a) 방 → 목록: 현재 항목 앞쪽에서 목록 주소(경로 + 목록 구분 쿼리)가 같은 가장 가까운 항목 j 를 찾고, j 와 현재 사이가
 *     메신저 방 항목·알림으로 떠난 항목뿐이면 `traverseTo(j)`. 아니면 지금처럼 `router.replace`.
 * (b) 이렇게 도착한 목록 항목에 「웹 뒤로 담당」 기록(key + 목록 구분, sessionStorage `dibay:cm-list-web-back`, 상한 50)을 남긴다.
 *     그 목록이 현재 항목인 동안 페이지 뒤로 주인(`overlay-back-stack` P5 슬롯)으로 등록 → ◁ 는 앞쪽 항목 중
 *     「메신저 방도 아니고 같은 목록도 아닌」 가장 가까운 항목으로 `traverseTo`(= 목록 이전 화면).
 *     그런 항목이 없으면(첫 기록 목록) 등록하지 않는다 — 지금 동작(웹 담당 없음 → 앱 종료 경로).
 * (c) Navigation API(traverseTo 포함)가 없으면 지금 동작(`router.replace`)만 — 기록 없음(N2 측정 대기).
 *
 * 결함 E(`lib/push/push-navigation-back.ts`)와의 관계: 표시는 그대로 둔다. `overlay-back-stack` 처리 순서가
 * 오버레이 → 페이지 주인 → 결함 E 이므로 목록에 이 주인이 있으면 결함 E 의 `history.back()` 보다 먼저 처리된다.
 * PushRouteListener·통화 라우트는 수정하지 않는다.
 *
 * 한계: 문서 reload 뒤에는 구독이 다시 걸리지 않는다(이 모듈이 로드되는 방 화면에 들어오기 전까지) — 그 동안은 지금 동작.
 */
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";
import { isEntryLeftByPushNavigation } from "@/lib/push/push-navigation-back";
import { setPageBackOwner } from "@/lib/ui/overlay-back-stack";

type NavEntry = { key: string; index: number; url: string | null };
type TraverseResult = { committed?: Promise<unknown>; finished?: Promise<unknown> } | undefined;
type NavigationLike = {
  currentEntry: NavEntry | null;
  entries: () => NavEntry[];
  traverseTo: (key: string) => TraverseResult;
  addEventListener: (type: "currententrychange", fn: () => void) => void;
  removeEventListener: (type: "currententrychange", fn: () => void) => void;
};

type ListWebBackRecord = { key: string; list: string };

export const MESSENGER_LIST_WEB_BACK_STORAGE_KEY = "dibay:cm-list-web-back";
const MESSENGER_LIST_WEB_BACK_MAX = 50;

let memoryFallback: ListWebBackRecord[] = [];
let storageWriteFailed = false;
let subscribed: NavigationLike | null = null;
let releaseOwner: (() => void) | null = null;

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (
    !nav ||
    typeof nav.entries !== "function" ||
    typeof nav.traverseTo !== "function" ||
    typeof nav.addEventListener !== "function"
  ) {
    return null;
  }
  return nav;
}

function readRecords(): ListWebBackRecord[] {
  if (storageWriteFailed) return memoryFallback;
  try {
    const raw = window.sessionStorage.getItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY);
    if (raw == null) return memoryFallback;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is ListWebBackRecord =>
        r != null &&
        typeof r === "object" &&
        typeof (r as ListWebBackRecord).key === "string" &&
        typeof (r as ListWebBackRecord).list === "string"
    );
  } catch {
    return memoryFallback;
  }
}

function writeRecords(records: ListWebBackRecord[]): void {
  const next = records.slice(-MESSENGER_LIST_WEB_BACK_MAX);
  memoryFallback = next;
  try {
    window.sessionStorage.setItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY, JSON.stringify(next));
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
  }
}

/**
 * 목록 구분 — 같은 앱 주소의 경로 + 목록을 가르는 쿼리만(`/community-messenger` 의 `section`(기본 chats), `storeId`).
 * `from`·`cm_*` 같은 출처 표시 쿼리는 무시한다. 다른 출처·잘못된 주소는 null.
 */
export function messengerListIdentity(href: string | null | undefined): string | null {
  if (typeof window === "undefined" || !href) return null;
  let u: URL;
  try {
    u = new URL(href, window.location.origin);
  } catch {
    return null;
  }
  if (u.origin !== window.location.origin) return null;
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const parts = [path];
  if (path === "/community-messenger") parts.push(`section=${u.searchParams.get("section")?.trim() || "chats"}`);
  const storeId = u.searchParams.get("storeId")?.trim();
  if (storeId) parts.push(`storeId=${storeId}`);
  return parts.join("?");
}

function isRoomEntry(entry: NavEntry): boolean {
  if (!entry.url) return false;
  try {
    return isCommunityMessengerRoomRoutePathname(new URL(entry.url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

function traverse(nav: NavigationLike, key: string): void {
  try {
    const r = nav.traverseTo(key);
    r?.committed?.catch(() => {});
    r?.finished?.catch(() => {});
  } catch {
    /* 이동 불가 — 아무것도 하지 않음 */
  }
}

function findRecord(key: string | null | undefined): ListWebBackRecord | null {
  if (!key) return null;
  return readRecords().find((r) => r.key === key) ?? null;
}

function recordListWebBack(key: string, list: string): void {
  writeRecords([...readRecords().filter((r) => r.key !== key), { key, list }]);
}

/** 목록 ◁ 목적지 — 앞쪽 항목 중 메신저 방도 같은 목록도 아닌 가장 가까운 항목. */
function resolveListBackEntry(nav: NavigationLike, rec: ListWebBackRecord): NavEntry | null {
  const cur = nav.currentEntry;
  if (!cur || typeof cur.index !== "number") return null;
  const entries = nav.entries();
  for (let k = cur.index - 1; k >= 0; k -= 1) {
    const e = entries[k];
    if (!e) continue;
    if (isRoomEntry(e)) continue;
    if (messengerListIdentity(e.url) === rec.list) continue;
    return e;
  }
  return null;
}

/** 지금 목록 항목의 웹 뒤로 담당이면 그 기록. 현재 주소가 기록된 목록과 다르면(replace 직전 방 등) null. */
function currentListRecord(nav: NavigationLike): ListWebBackRecord | null {
  const cur = nav.currentEntry;
  const rec = findRecord(cur?.key);
  if (!cur || !rec) return null;
  if (messengerListIdentity(cur.url) !== rec.list) return null;
  return rec;
}

function runListWebBack(): void {
  const nav = readNavigation();
  if (!nav) return;
  const rec = currentListRecord(nav);
  if (!rec) return;
  const target = resolveListBackEntry(nav, rec);
  if (target) traverse(nav, target.key);
}

/** 현재 항목 기준으로 페이지 뒤로 주인 등록·해제(중복 등록 없음). */
export function syncMessengerListWebBack(): void {
  const nav = readNavigation();
  const rec = nav ? currentListRecord(nav) : null;
  const wanted = Boolean(nav && rec && resolveListBackEntry(nav, rec));
  if (wanted && !releaseOwner) {
    releaseOwner = setPageBackOwner(runListWebBack);
  } else if (!wanted && releaseOwner) {
    const release = releaseOwner;
    releaseOwner = null;
    release();
  }
}

function subscribe(nav: NavigationLike): void {
  if (subscribed === nav) return;
  subscribed?.removeEventListener("currententrychange", syncMessengerListWebBack);
  nav.addEventListener("currententrychange", syncMessengerListWebBack);
  subscribed = nav;
}

/**
 * 방 ◁·‹ 의 「방 종류 목록」 이동 — (a)·(b)·(c). `runMessengerRoomBackTarget` 의 replace 분기만 부른다.
 */
export function navigateMessengerRoomToList(
  router: { replace: (href: string, options?: { scroll?: boolean }) => void },
  href: string
): void {
  const nav = readNavigation();
  const cur = nav?.currentEntry;
  const list = messengerListIdentity(href);
  if (!nav || !cur || typeof cur.index !== "number" || !list) {
    router.replace(href, { scroll: false });
    return;
  }
  subscribe(nav);
  const entries = nav.entries();
  for (let j = cur.index - 1; j >= 0; j -= 1) {
    const e = entries[j];
    if (!e) break;
    if (messengerListIdentity(e.url) === list) {
      recordListWebBack(e.key, list);
      traverse(nav, e.key);
      return;
    }
    if (!isRoomEntry(e) && !isEntryLeftByPushNavigation(e.key)) break;
  }
  /** replace 는 항목 key 를 유지한다 — 이동 뒤(currententrychange) 목록 주소가 되면 담당이 켜진다. */
  recordListWebBack(cur.key, list);
  router.replace(href, { scroll: false });
}

/** Tests only. */
export function __resetMessengerListWebBackForTests(): void {
  memoryFallback = [];
  storageWriteFailed = false;
  try {
    window.sessionStorage.removeItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY);
  } catch {
    /* noop */
  }
  subscribed?.removeEventListener("currententrychange", syncMessengerListWebBack);
  subscribed = null;
  if (releaseOwner) {
    const release = releaseOwner;
    releaseOwner = null;
    release();
  }
}
