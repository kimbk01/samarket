/**
 * 공통 AUTH 로그인 상태 SSOT — Google·Kakao·Apple·내부 로그인 / 로그인 화면·AuthModal 공용.
 *
 * idle → provider → returned → confirming → navigating → (화면 이탈 = 완료)
 *                └──────────────┴──────────────┴→ failed / cancelled → idle (+ 문구)
 *
 * 규칙:
 * - provider 이후 단계에서는 로그인 버튼·폼을 다시 열지 않는다 (mutex 유지).
 * - returned·confirming·navigating 중에는 로그인 화면(폼)으로 돌아가지 않는다.
 * - 성공은 navigation 이 실제로 일어나 화면을 떠날 때 끝난다 — 서버 확인 직후 해제 금지.
 * - 실패·취소는 오직 실제 신호(에러 콜백·SDK reject·사용자 복귀 이벤트)로만 판정한다.
 *   임의 타이머로 성공·실패를 판정하지 않는다. 지연 시간은 「지연 안내」에만 쓴다.
 */

export type AuthLoginPhase = "idle" | "provider" | "returned" | "confirming" | "navigating";

/** 공급자 화면을 어떻게 띄웠는지 — 복귀 이벤트를 취소 신호로 볼 수 있는지 결정한다. */
export type AuthLoginLaunchKind =
  | "native_sdk"
  /** Android Custom Tab — 콜백 없이 앱으로 돌아오면 취소 (취소 이벤트를 주지 않음) */
  | "custom_tab"
  /** iOS ASWebAuthenticationSession — 취소는 런처 reject 로만 온다. 복귀 이벤트로 판정 금지 */
  | "as_web_auth"
  | "web_redirect"
  | null;

/** 지연 안내만 표시 (성공·실패 판정 아님). 사용자가 직접 다시 시도할 수 있다. */
export const AUTH_LOGIN_DELAY_NOTICE_MS = 12_000;

export function isAuthLoginCompletingPhase(phase: AuthLoginPhase): boolean {
  return phase === "returned" || phase === "confirming" || phase === "navigating";
}

export function isAuthLoginBusyPhase(phase: AuthLoginPhase): boolean {
  return phase !== "idle";
}

/**
 * 앱/탭 복귀(visibilitychange·pageshow)를 「사용자 취소」로 판정해도 되는지.
 * - 공급자 화면 단계(provider)에서만.
 * - Native SDK 는 SDK 자체가 성공/취소를 돌려주므로 복귀 이벤트로 판정하지 않는다.
 * - Custom Tab 은 실제로 앱이 가려졌다가(hidden) 돌아온 경우만 — 콜백 없이 돌아오면 취소.
 * - 웹 리다이렉트는 bfcache 복원(pageshow persisted)일 때만.
 */
export function shouldTreatForegroundReturnAsCancel(input: {
  phase: AuthLoginPhase;
  launchKind: AuthLoginLaunchKind;
  sawHiddenSinceLaunch: boolean;
  eventType: "visibilitychange" | "pageshow";
  pageshowPersisted: boolean;
}): boolean {
  if (input.phase !== "provider") return false;
  if (input.launchKind === "custom_tab") return input.sawHiddenSinceLaunch;
  if (input.launchKind === "web_redirect") {
    return input.eventType === "pageshow" && input.pageshowPersisted;
  }
  return false;
}
