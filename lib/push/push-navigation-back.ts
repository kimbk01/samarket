/**
 * 결함 E 수정 — 알림 이동으로 떠난 기록 항목 바로 다음 화면에서만 Android 시스템 뒤로를 `history.back()` 으로.
 * 설계 docs/design/push-entry-back-fix-design-2026-11-13.md (Owner 「구현 승인」 2026-11-13).
 *
 * 원인(실측 11-13): 알림 이동은 사용자 활성화 없이 `router.push` → Chromium 이 떠난 항목을 브라우저 뒤로에서
 * 건너뛴다 → WebView canGoBack=false → Capacitor 기본 뒤로 무동작. `history.back()` 은 영향 없음.
 *
 * 범위: 현재 화면의 **바로 앞 항목이 알림 이동으로 떠난 항목**일 때만 담당(overlay-back-stack 의 단일 리스너 유지).
 * 그 밖의 화면·Navigation API 없는 WebView·iOS(드라이버 미설치) = 지금 동작 그대로. 타이머 없음.
 *
 * P5(2026-11-18 · 부록 P5 §A7·§B2): 표시 목록을 모듈 메모리 → sessionStorage(`dibay:push-left-entries`, 상한 50)로 옮겼다.
 * 문서 reload(새 배포 반영 등) 뒤에도 Navigation API 항목 key 는 유지되므로 같은 화면에서 뒤로 담당이 이어진다.
 * reload 뒤 첫 동기화는 `restorePushNavigationBackAfterReload()`(PushRouteListener 마운트 1회).
 */
import { setPushNavigationBackActive } from "@/lib/ui/overlay-back-stack";

type NavEntry = { key: string; index: number };
type NavigationLike = {
  currentEntry: NavEntry | null;
  entries: () => NavEntry[];
  addEventListener: (type: "currententrychange", fn: () => void) => void;
  removeEventListener: (type: "currententrychange", fn: () => void) => void;
};

const LEFT_BY_PUSH_STORAGE_KEY = "dibay:push-left-entries";
const LEFT_BY_PUSH_MAX = 50;
/** sessionStorage 를 못 쓰는 환경(사생활 모드 등)의 대체 — 지금 동작(모듈 메모리)과 같다. */
let memoryFallback: string[] = [];
let subscribed: NavigationLike | null = null;

function readLeftByPush(): string[] {
  try {
    const raw = window.sessionStorage.getItem(LEFT_BY_PUSH_STORAGE_KEY);
    if (raw == null) return memoryFallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return memoryFallback;
  }
}

function writeLeftByPush(keys: string[]): void {
  const next = keys.slice(-LEFT_BY_PUSH_MAX);
  memoryFallback = next;
  try {
    window.sessionStorage.setItem(LEFT_BY_PUSH_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* 저장 불가 — memoryFallback 만 */
  }
}

/** 이 항목 key 가 「알림 이동으로 떠난 항목」인가. */
export function isEntryLeftByPushNavigation(key: string | null | undefined): boolean {
  if (typeof window === "undefined" || !key) return false;
  return readLeftByPush().includes(key);
}

function subscribe(nav: NavigationLike): void {
  if (subscribed === nav) return;
  subscribed?.removeEventListener("currententrychange", sync);
  nav.addEventListener("currententrychange", sync);
  subscribed = nav;
}

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.entries !== "function" || typeof nav.addEventListener !== "function") return null;
  return nav;
}

/** 현재 화면의 바로 앞 항목이 알림 이동으로 떠난 항목인가. */
export function isPushNavigationBackActive(): boolean {
  const nav = readNavigation();
  if (!nav) return false;
  const left = readLeftByPush();
  if (left.length === 0) return false;
  const cur = nav.currentEntry;
  if (!cur || typeof cur.index !== "number" || cur.index <= 0) return false;
  const prev = nav.entries()[cur.index - 1];
  return Boolean(prev && left.includes(prev.key));
}

function sync(): void {
  setPushNavigationBackActive(isPushNavigationBackActive());
}

/**
 * 알림 이동(`router.push`) **직전**에 호출 — 지금 항목을 「알림 이동으로 떠난 항목」으로 표시.
 * 이동이 끝나면(currententrychange) 새 화면의 바로 앞이 이 항목이므로 담당이 켜진다.
 */
export function markLeavingByPushNavigation(): void {
  const nav = readNavigation();
  if (!nav || !nav.currentEntry) return;
  const key = nav.currentEntry.key;
  const left = readLeftByPush().filter((k) => k !== key);
  left.push(key);
  writeLeftByPush(left);
  subscribe(nav);
  sync();
}

/**
 * 문서 reload 뒤 1회 — 저장된 표시가 있으면 구독을 다시 걸고 지금 화면의 담당을 맞춘다(A7).
 * 표시가 없으면 아무것도 하지 않는다(지금 동작).
 */
export function restorePushNavigationBackAfterReload(): void {
  const nav = readNavigation();
  if (!nav || readLeftByPush().length === 0) return;
  subscribe(nav);
  sync();
}

/** Tests only. */
export function __resetPushNavigationBackForTests(): void {
  memoryFallback = [];
  try {
    window.sessionStorage.removeItem(LEFT_BY_PUSH_STORAGE_KEY);
  } catch {
    /* noop */
  }
  subscribed?.removeEventListener("currententrychange", sync);
  subscribed = null;
  setPushNavigationBackActive(false);
}
