/**
 * 알림 목적지가 있는 시작의 스플래시 해제 보류 (설계 docs/design/push-tap-entry-fix-design-2026-11-13.md P1).
 *
 * 실측 2026-11-10(Samsung 운영 1.2.6(39)): 앱이 꺼진 상태에서 알림을 누르면 네이티브가 `/` 를 먼저 열고,
 * 웹 해제 신호가 홈 첫 그림에서 나가 홈이 0.5~1.5초 보인 뒤 방으로 이동했다.
 *
 * 계약(앱 진입 하드락 H1): 해제 권한·경로는 그대로 — 이 모듈은 「언제 해제해도 되는지」만 답한다.
 * 새 해제 경로·표시 타이머 없음. 기다림은 네이티브 응답 1회뿐이고, 응답이 없는 고장은 네이티브 고장 판정이 푼다.
 *
 * 상태: unknown → none | pending(path) → settled.
 * - 네이티브 보관 목적지 조회(`NativeIncomingCall.getPendingPushRoute`)는 hydration 전에도 부를 수 있게
 *   `window.Capacitor.nativePromise` 를 직접 쓴다(동적 import 없음). 메서드가 없는 환경(웹·iOS·구버전)은 즉시 none.
 * - 통화 경로는 대상이 아니다(통화 시작 흐름 불변) → none.
 * - 순수 모듈: 타이머·DOM 조작 없음.
 */

export type LaunchPushIntentState =
  | { kind: "unknown" }
  | { kind: "none" }
  | { kind: "pending"; path: string }
  | { kind: "settled"; reason: string };

type CapacitorNativePromise = (
  pluginName: string,
  methodName: string,
  options: Record<string, unknown>
) => Promise<unknown>;

let state: LaunchPushIntentState = { kind: "unknown" };
let probeStarted = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const run of [...listeners]) {
    try {
      run();
    } catch {
      /* ignore */
    }
  }
}

function setState(next: LaunchPushIntentState): void {
  state = next;
  emit();
}

function pathnameOf(path: string): string {
  const raw = path.trim();
  if (!raw.startsWith("/")) return "";
  return (raw.split(/[?#]/)[0] ?? "") || "/";
}

/** 통화 경로(수신·수락·거절 포함)는 게이트 대상이 아니다. */
export function isLaunchPushIntentExcludedPath(path: string): boolean {
  return pathnameOf(path).startsWith("/community-messenger/calls");
}

function readNativePromise(): CapacitorNativePromise | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { nativePromise?: unknown; isNativePlatform?: () => boolean } })
    .Capacitor;
  if (!cap || typeof cap.nativePromise !== "function") return null;
  try {
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return null;
  } catch {
    return null;
  }
  return cap.nativePromise as CapacitorNativePromise;
}

/** 네이티브 응답을 상태로 바꾼다(시험에서도 사용). */
export function applyLaunchPushIntentProbeResult(result: unknown): void {
  if (state.kind !== "unknown") return;
  const path =
    result && typeof result === "object" && typeof (result as { path?: unknown }).path === "string"
      ? ((result as { path: string }).path ?? "").trim()
      : "";
  if (!path.startsWith("/") || isLaunchPushIntentExcludedPath(path)) {
    setState({ kind: "none" });
    return;
  }
  setState({ kind: "pending", path });
}

/** 문서당 1회 — 네이티브 보관 목적지를 조회한다. 조회 불가면 즉시 none. */
export function startLaunchPushIntentProbe(): void {
  if (probeStarted) return;
  probeStarted = true;
  const nativePromise = readNativePromise();
  if (!nativePromise) {
    setState({ kind: "none" });
    return;
  }
  let call: Promise<unknown>;
  try {
    call = nativePromise("NativeIncomingCall", "getPendingPushRoute", {});
  } catch {
    setState({ kind: "none" });
    return;
  }
  call.then(
    (result) => applyLaunchPushIntentProbeResult(result),
    () => {
      if (state.kind === "unknown") setState({ kind: "none" });
    }
  );
}

export function getLaunchPushIntentState(): LaunchPushIntentState {
  return state;
}

/**
 * 알림 목적지 처리가 끝남(이동·버림·로그인 시트·작성 중 글 유지·고객센터 모달 등).
 * pending 이 아닐 때는 아무것도 하지 않는다.
 */
export function settleLaunchPushIntent(reason: string): void {
  if (state.kind !== "pending") return;
  setState({ kind: "settled", reason });
}

/**
 * 지금 경로에서 스플래시를 해제해도 되는가.
 * - unknown: 아직 모름 → false (조회가 끝나면 다시 판단)
 * - pending: 지금 경로가 그 목적지일 때만 true
 * - none·settled: true
 */
export function mayReleaseSplashAtPath(currentPathname: string | null | undefined): boolean {
  if (state.kind === "unknown") return false;
  if (state.kind !== "pending") return true;
  const target = pathnameOf(state.path);
  const current = pathnameOf(currentPathname ?? "");
  return Boolean(target) && target === current;
}

/** 상태가 바뀔 때마다 호출(해제 재시도용). */
export function onLaunchPushIntentChange(run: () => void): () => void {
  listeners.add(run);
  return () => {
    listeners.delete(run);
  };
}

/** Tests only. */
export function __resetLaunchPushIntentGateForTests(): void {
  state = { kind: "unknown" };
  probeStarted = false;
  listeners.clear();
}
