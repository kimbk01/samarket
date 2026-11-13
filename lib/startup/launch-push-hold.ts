/**
 * 알림 목적지가 있는 시작의 스플래시 해제 보류 — 재설계 A (docs/design/push-tap-entry-redesign-2026-11-13.md).
 *
 * 1차(#252)는 Android 전용 플러그인을 비동기로 기다려 iOS 에서 응답이 없어 시작 화면이 멈췄다(11-13 장애).
 * 이번에는 **기다림·비동기 호출이 없다**: Android 네이티브가 문서 로드 전에 저장한 알림 목적지를
 * `window.DibayBootBridge.pendingLaunchRoutePath()`(JavascriptInterface, 동기)로 1회 읽는다.
 * 메서드가 없는 환경(iOS — 브리지 객체 자체가 없음 · 웹 · 구버전 Android) → 목적지 없음 = 기존 동작 그대로.
 *
 * 해제 허용 조건: 목적지 없음 · 지금 경로가 목적지 · 알림 수신자가 「이동 아닌 결과」로 끝냄(markLaunchPushHandled).
 * 순수 모듈: 타이머 없음.
 */

let readDone = false;
let target: string | null = null;
let handled = false;
const listeners = new Set<() => void>();

function pathnameOf(path: string): string {
  const raw = path.trim();
  if (!raw.startsWith("/")) return "";
  return (raw.split(/[?#]/)[0] ?? "") || "/";
}

/** 문서당 1회 동기 읽기. 이후에는 같은 값(목적지가 처리돼 네이티브 값이 지워져도 판단이 흔들리지 않게). */
export function readLaunchPushTarget(): string | null {
  if (readDone) return target;
  readDone = true;
  if (typeof window === "undefined") return null;
  try {
    const bridge = (window as unknown as { DibayBootBridge?: { pendingLaunchRoutePath?: unknown } })
      .DibayBootBridge;
    if (!bridge || typeof bridge.pendingLaunchRoutePath !== "function") return null;
    const raw = (bridge.pendingLaunchRoutePath as () => unknown)();
    const path = typeof raw === "string" ? raw.trim() : "";
    if (!path.startsWith("/") || pathnameOf(path).startsWith("/community-messenger/calls")) return null;
    target = path;
  } catch {
    target = null;
  }
  return target;
}

/** 지금 경로에서 스플래시를 해제해도 되는가. */
export function mayReleaseLaunchSplashAt(currentPathname: string | null | undefined): boolean {
  const t = readLaunchPushTarget();
  if (!t || handled) return true;
  return pathnameOf(currentPathname ?? "") === pathnameOf(t);
}

/** 알림 수신자가 목적지로 이동하지 않는 결과로 끝냄(로그인 시트·버림·모달 등) — 현재 화면에서 해제 허용. */
export function markLaunchPushHandled(): void {
  if (handled) return;
  handled = true;
  for (const run of [...listeners]) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
}

export function onLaunchPushHandled(run: () => void): () => void {
  listeners.add(run);
  return () => {
    listeners.delete(run);
  };
}

/** Tests only. */
export function __resetLaunchPushHoldForTests(): void {
  readDone = false;
  target = null;
  handled = false;
  listeners.clear();
}
