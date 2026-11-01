"use client";

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
 * Read-only native calls, invoked directly on the plugin proxy (never resolved/awaited as a value:
 * Capacitor plugin proxies trap `then`, which would leave an awaiting promise unsettled).
 * 메서드가 없는 구버전·웹은 예외 → 「의도 없음」으로 기존 동작.
 */
export async function hasLaunchIntent(opts?: { includeCallRoutes?: boolean }): Promise<string | null> {
  const includeCall = opts?.includeCallRoutes === true;
  if (pushIntentNavigatedPath) return "push_navigated";
  const { registerPlugin } = await import("@capacitor/core");
  try {
    const incoming = registerPlugin<{ getPendingPushRoute: () => Promise<{ path?: string }> }>("NativeIncomingCall");
    const pending = await incoming.getPendingPushRoute();
    const path = typeof pending?.path === "string" ? pending.path.trim() : "";
    if (path.startsWith("/") && (includeCall || !path.startsWith("/community-messenger/calls"))) return "push_route";
  } catch {
    /* not implemented / unavailable → no push intent */
  }
  try {
    const app = registerPlugin<{ getLaunchUrl: () => Promise<{ url?: string } | undefined> }>("App");
    const launch = await app.getLaunchUrl();
    const url = launch?.url ?? "";
    if (url && !/^https:\/\/[^/]+\/?$/.test(url)) return "launch_url";
  } catch {
    /* ignore */
  }
  return pushIntentNavigatedPath ? "push_navigated" : null;
}
