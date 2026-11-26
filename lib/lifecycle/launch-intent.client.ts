"use client";

import { readLaunchPushTarget } from "@/lib/startup/launch-push-hold";

/**
 * Lifecycle SSOT §8 — 앱 시작 시 「의도 목적지(Push·Deep Link)」가 있는지.
 * 인트로(LaunchIntroRoot)와 복원·Safe Entry(LifecycleRouteEffects)가 같은 판정을 쓴다.
 *
 * 1) 네이티브가 보관한 푸시 목적지(Android `NativeIncomingCall.getPendingPushRoute`, 앱 종료 상태 푸시 탭)
 * 2) 네이티브 launch URL(Deep Link)
 * 3) 이번 문서에서 이미 처리한 푸시 이동(웹 `PushRouteListener` 가 표시) — iOS 처럼 네이티브 보관값이 없는
 *    플랫폼에서 푸시 탭 이벤트가 복원보다 먼저 온 경우
 * 통화 경로: 인트로는 기존대로 의도로 본다(`includeCallRoutes: true`). 복원 판정은 통화 변경 규정상 기존 동작을
 * 바꾸지 않도록 통화 경로를 의도로 보지 않는다.
 */

let pushIntentNavigatedPath: string | null = null;

/** `PushRouteListener` 가 푸시 목적지로 이동을 시작할 때 표시한다(이번 문서 한정). */
export function markPushLaunchIntentNavigated(path: string): void {
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("/community-messenger/calls")) return;
  pushIntentNavigatedPath = p;
}

export function readPushLaunchIntentNavigated(): string | null {
  return pushIntentNavigatedPath;
}

/**
 * 시작 의도 확인 한 단계의 상한 — 하드락 H2-3(시작 경로의 모든 비동기 대기는 상한·예외 처리). 값은 새로 만들지 않고
 * 알림 목적지 대기 상한(`LAUNCH_PUSH_DESTINATION_WAIT_CAP_MS` 8초)과 같다. 넘으면 그 확인은 「의도 없음」(조회 불가와 같은 기존 동작).
 * 정상 시작에서는 발동하지 않는다(실측 응답 0.14~0.56초).
 */
export const LAUNCH_INTENT_CHECK_CAP_MS = 8_000;

function withinCap<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, LAUNCH_INTENT_CHECK_CAP_MS);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

/** Android 동기 브리지(문서 시작 전 네이티브가 저장한 알림 목적지 · `launch-push-hold`)가 있는가 */
function hasAndroidSyncPushBridge(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as unknown as { DibayBootBridge?: { pendingLaunchRoutePath?: unknown } }).DibayBootBridge;
  return !!bridge && typeof bridge.pendingLaunchRoutePath === "function";
}

/**
 * Read-only native calls, invoked directly on the plugin proxy (never resolved/awaited as a value:
 * Capacitor plugin proxies trap `then`, which would leave an awaiting promise unsettled).
 * 메서드가 없는 구버전·웹은 예외 → 「의도 없음」으로 기존 동작.
 *
 * 재감사 2026-11-26 §5-3 F1 (`docs/audit/app-entry-reaudit-responsibility-ssot-2026-11-26.md` · Owner 「계약 권장대로 진행」):
 * 실측(Samsung 운영 동일 코드 4회) — 복원 이동이 알림 목적지 확인 왕복(0.40~0.56초) 뒤에 딥링크 확인(0.14~0.21초)을
 * **차례로** 기다려 나갔다. 판정 의미는 그대로 두고:
 * - 복원 판정용(통화 경로 제외)이고 Android 동기 브리지가 있으면, 알림 목적지는 문서 시작 때 읽은 같은 저장값
 *   (`readLaunchPushTarget` — 네이티브 `pendingLaunchRoutePath` = `getPendingPushRoute` 와 같은 저장소·유효 시간·통화 제외)을 쓴다.
 * - 나머지 확인은 동시에 보낸다(결과 우선순위는 그대로: 알림 → 딥링크 → 이번 문서 알림 이동).
 * - 인트로용(통화 경로 포함)은 동기 값이 통화 경로를 빼므로 지금처럼 네이티브에 묻는다.
 */
export async function hasLaunchIntent(opts?: { includeCallRoutes?: boolean }): Promise<string | null> {
  const includeCall = opts?.includeCallRoutes === true;
  if (pushIntentNavigatedPath) return "push_navigated";
  const { registerPlugin } = await import("@capacitor/core");
  const pushCheck: Promise<string | null> =
    !includeCall && hasAndroidSyncPushBridge()
      ? Promise.resolve(readLaunchPushTarget() ? "push_route" : null)
      : withinCap(
          (async () => {
            const incoming = registerPlugin<{ getPendingPushRoute: () => Promise<{ path?: string }> }>("NativeIncomingCall");
            const pending = await incoming.getPendingPushRoute();
            const path = typeof pending?.path === "string" ? pending.path.trim() : "";
            return path.startsWith("/") && (includeCall || !path.startsWith("/community-messenger/calls"))
              ? "push_route"
              : null;
          })(),
          null
        );
  const urlCheck: Promise<string | null> = withinCap(
    (async () => {
      const app = registerPlugin<{ getLaunchUrl: () => Promise<{ url?: string } | undefined> }>("App");
      const launch = await app.getLaunchUrl();
      const url = launch?.url ?? "";
      return url && !/^https:\/\/[^/]+\/?$/.test(url) ? "launch_url" : null;
    })(),
    null
  );
  const [push, url] = await Promise.all([pushCheck, urlCheck]);
  if (push) return push;
  if (url) return url;
  return pushIntentNavigatedPath ? "push_navigated" : null;
}
