/**
 * 결함 E 수정 — 알림 이동으로 떠난 기록 항목 바로 다음 화면에서만 Android 시스템 뒤로를 `history.back()` 으로.
 * 설계 docs/design/push-entry-back-fix-design-2026-11-13.md (Owner 「구현 승인」 2026-11-13).
 *
 * 원인(실측 11-13): 알림 이동은 사용자 활성화 없이 `router.push` → Chromium 이 떠난 항목을 브라우저 뒤로에서
 * 건너뛴다 → WebView canGoBack=false → Capacitor 기본 뒤로 무동작. `history.back()` 은 영향 없음.
 *
 * 범위: 현재 화면의 **바로 앞 항목이 알림 이동으로 떠난 항목**일 때만 담당(overlay-back-stack 의 단일 리스너 유지).
 * 그 밖의 화면·Navigation API 없는 WebView·iOS(드라이버 미설치) = 지금 동작 그대로. 타이머 없음.
 */
import { setPushNavigationBackActive } from "@/lib/ui/overlay-back-stack";

type NavEntry = { key: string; index: number };
type NavigationLike = {
  currentEntry: NavEntry | null;
  entries: () => NavEntry[];
  addEventListener: (type: "currententrychange", fn: () => void) => void;
  removeEventListener: (type: "currententrychange", fn: () => void) => void;
};

const leftByPush = new Set<string>();
let subscribed: NavigationLike | null = null;

function readNavigation(): NavigationLike | null {
  if (typeof window === "undefined") return null;
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (!nav || typeof nav.entries !== "function" || typeof nav.addEventListener !== "function") return null;
  return nav;
}

/** 현재 화면의 바로 앞 항목이 알림 이동으로 떠난 항목인가. */
export function isPushNavigationBackActive(): boolean {
  const nav = readNavigation();
  if (!nav || leftByPush.size === 0) return false;
  const cur = nav.currentEntry;
  if (!cur || typeof cur.index !== "number" || cur.index <= 0) return false;
  const prev = nav.entries()[cur.index - 1];
  return Boolean(prev && leftByPush.has(prev.key));
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
  leftByPush.add(nav.currentEntry.key);
  if (subscribed !== nav) {
    subscribed?.removeEventListener("currententrychange", sync);
    nav.addEventListener("currententrychange", sync);
    subscribed = nav;
  }
  sync();
}

/** Tests only. */
export function __resetPushNavigationBackForTests(): void {
  leftByPush.clear();
  subscribed?.removeEventListener("currententrychange", sync);
  subscribed = null;
  setPushNavigationBackActive(false);
}
