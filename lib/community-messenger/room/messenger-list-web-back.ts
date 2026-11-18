/**
 * N1 (PR-2 · 독립 검토 반영 3판, 구현 기록 docs/audit/messenger-chat-fix-pr2-n1-implementation-2026-11-18.md) —
 * 알림으로 연 메신저 방의 ◁·‹ 가 「방 종류 목록」으로 갈 때, 그다음 목록의 ◁ 가 이전 방·같은 목록으로 가지 않게 한다.
 *
 * 원칙: Chromium 「건너뛰기」 항목을 추측하지 않는다(웹이 볼 수 없고, 사용자 터치가 있으면 생기지 않으며 traverse 뒤에도 남는다).
 * Navigation API `navigation.entries()`(url·key·index)로 웹이 목적지를 정해 `navigation.traverseTo(key)` 로 이동한다.
 * 웹이 부르는 이동은 건너뛰기 규칙과 무관하다는 근거는 `history.back()` 실측(docs/design/push-entry-back-fix-design-2026-11-13.md §1)뿐
 * — traverseTo 실기 동작은 NOT_PROVEN.
 *
 * (a) 방 → 목록: 현재 항목 앞쪽에서 목록 주소(경로 + 목록 구분 쿼리)가 같은 가장 가까운 항목 j 를 찾고, j 와 현재 사이가 메신저 방
 *     항목·알림으로 떠난 항목뿐이면 `traverseTo(j)`(기록 mode traverse). 아니면 `router.replace`(기록 mode replace).
 *     traverseTo 가 동기 예외·committed reject 이면(아직 방에 있을 때만) `router.replace` 로 대체 이동(D3).
 * (b) 도착한 목록 항목에 「웹 뒤로 담당」 기록(sessionStorage `dibay:cm-list-web-back`, 상한 50). 그 목록이 현재 항목인 동안
 *     페이지 뒤로 주인(`overlay-back-stack` P5 슬롯)으로 등록한다. ◁ 목적지(D2):
 *     - traverse 로 온 목록: 바로 앞 항목 중 같은 목록이 아닌 첫 항목(앱 안에서 들른 방도 그대로 — 지금 기록 그대로 뒤로).
 *     - replace 로 온 목록: 알림 진입 직전의 방(알림으로 떠난 방·알림으로 열린 방)만 건너뛴 뒤, 같은 목록이 아닌 첫 항목.
 *     목적지가 없으면(첫 기록 목록) 등록하지 않는다 — 지금 동작. traverseTo 실패 시 `history.go(차이)` 로 대체(D3).
 * (c) Navigation API(traverseTo 포함)가 없거나 iOS 앱(D5 — N2 「iPhone 측정 먼저」)이면 지금 동작(`router.replace`)만 — 기록 없음.
 * (d) 문서 reload 뒤에는 `restoreMessengerListWebBackAfterReload()`(앱 전역 `MessengerListWebBackRestore` 마운트 1회)가
 *     저장된 기록으로 구독·등록을 되살린다(D1).
 *
 * 결함 E(`lib/push/push-navigation-back.ts`)와의 관계: 표시는 그대로 둔다. `overlay-back-stack` 처리 순서가
 * 오버레이 → 페이지 주인 → 결함 E 이므로 목록에 이 주인이 있으면 결함 E 의 `history.back()` 보다 먼저 처리된다.
 * PushRouteListener·통화 라우트는 수정하지 않는다.
 */
import { isCommunityMessengerRoomRoutePathname } from "@/lib/community-messenger/messenger-room-pathname";
import { hasLikelyIosCapacitorShell, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
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

export type MessengerListArrival = "traverse" | "replace";
type ListWebBackRecord = { key: string; list: string; mode: MessengerListArrival };

export const MESSENGER_LIST_WEB_BACK_STORAGE_KEY = "dibay:cm-list-web-back";
const MESSENGER_LIST_WEB_BACK_MAX = 50;

let memoryFallback: ListWebBackRecord[] = [];
let storageWriteFailed = false;
let subscribed: NavigationLike | null = null;
let releaseOwner: (() => void) | null = null;

function isIosAppShell(): boolean {
  return resolveCapacitorShellPlatform() === "ios" || hasLikelyIosCapacitorShell();
}

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  if (isIosAppShell()) return null;
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
        typeof (r as ListWebBackRecord).list === "string" &&
        ((r as ListWebBackRecord).mode === "traverse" || (r as ListWebBackRecord).mode === "replace")
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

function isRoomEntry(entry: NavEntry | undefined): boolean {
  if (!entry?.url) return false;
  try {
    return isCommunityMessengerRoomRoutePathname(new URL(entry.url, window.location.origin).pathname);
  } catch {
    return false;
  }
}

function isLeftByPush(entry: NavEntry | undefined): boolean {
  return Boolean(entry && isEntryLeftByPushNavigation(entry.key));
}

/**
 * 웹이 정한 항목으로 이동. 동기 예외·committed reject 이면 — 아직 이동 전 항목에 있을 때만 — `fallback`(D3).
 */
function traverseOrFallback(nav: NavigationLike, key: string, fallback: () => void): void {
  const startKey = nav.currentEntry?.key ?? null;
  const fallbackIfStill = () => {
    if (nav.currentEntry?.key === startKey) fallback();
  };
  let r: TraverseResult;
  try {
    r = nav.traverseTo(key);
  } catch {
    fallbackIfStill();
    return;
  }
  r?.committed?.catch(fallbackIfStill);
  r?.finished?.catch(() => {});
}

function findRecord(key: string | null | undefined): ListWebBackRecord | null {
  if (!key) return null;
  return readRecords().find((r) => r.key === key) ?? null;
}

function recordListWebBack(key: string, list: string, mode: MessengerListArrival): void {
  writeRecords([...readRecords().filter((r) => r.key !== key), { key, list, mode }]);
}

/** 목록 ◁ 목적지(D2). */
function resolveListBackEntry(nav: NavigationLike, rec: ListWebBackRecord): NavEntry | null {
  const cur = nav.currentEntry;
  if (!cur || typeof cur.index !== "number") return null;
  const entries = nav.entries();
  let k = cur.index - 1;
  if (rec.mode === "replace") {
    /** 알림 진입 직전의 방만 건너뛴다 — 알림으로 떠난 방, 알림으로 열린 방(바로 앞이 알림으로 떠난 항목). */
    while (k >= 0) {
      const e = entries[k];
      if (!isRoomEntry(e)) break;
      if (isLeftByPush(e) || (k > 0 && isLeftByPush(entries[k - 1]))) {
        k -= 1;
        continue;
      }
      break;
    }
  }
  for (; k >= 0; k -= 1) {
    const e = entries[k];
    if (e && messengerListIdentity(e.url) !== rec.list) return e;
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
  const cur = nav.currentEntry;
  if (!rec || !cur) return;
  const target = resolveListBackEntry(nav, rec);
  if (!target) return;
  const delta = target.index - cur.index;
  traverseOrFallback(nav, target.key, () => window.history.go(delta));
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
  const replaceToList = () => {
    /** replace 는 항목 key 를 유지한다 — 이동 뒤(currententrychange) 목록 주소가 되면 담당이 켜진다. */
    recordListWebBack(cur.key, list, "replace");
    router.replace(href, { scroll: false });
  };
  const entries = nav.entries();
  for (let j = cur.index - 1; j >= 0; j -= 1) {
    const e = entries[j];
    if (!e) break;
    if (messengerListIdentity(e.url) === list) {
      recordListWebBack(e.key, list, "traverse");
      traverseOrFallback(nav, e.key, replaceToList);
      return;
    }
    if (!isRoomEntry(e) && !isLeftByPush(e)) break;
  }
  replaceToList();
}

/**
 * 문서 reload 뒤 1회(D1) — 저장된 기록이 있으면 구독을 다시 걸고 지금 화면의 담당을 맞춘다.
 * 기록이 없거나 Navigation API 가 없거나 iOS 앱이면 아무것도 하지 않는다.
 */
export function restoreMessengerListWebBackAfterReload(): void {
  const nav = readNavigation();
  if (!nav || readRecords().length === 0) return;
  subscribe(nav);
  syncMessengerListWebBack();
}

/** Tests only — 문서 reload 흉내: 메모리 상태(구독·주인)만 버리고 저장소는 둔다. */
export function __dropMessengerListWebBackMemoryForTests(): void {
  subscribed?.removeEventListener("currententrychange", syncMessengerListWebBack);
  subscribed = null;
  if (releaseOwner) {
    const release = releaseOwner;
    releaseOwner = null;
    release();
  }
  memoryFallback = [];
  storageWriteFailed = false;
}

/** Tests only. */
export function __resetMessengerListWebBackForTests(): void {
  __dropMessengerListWebBackMemoryForTests();
  try {
    window.sessionStorage.removeItem(MESSENGER_LIST_WEB_BACK_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
