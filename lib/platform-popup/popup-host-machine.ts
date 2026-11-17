/**
 * CUT 2 — GlobalPopupHost state machine (pure).
 */

export const PLATFORM_POPUP_HOST_STATES = [
  "IDLE",
  "DEFERRED",
  "RESOLVING",
  "READY",
  "VISIBLE",
  "DISMISSED",
  "SUPPRESSED",
  "INVALIDATED",
  /** Settled empty resolve — must not re-enter resolve until identity/surface resets. */
  "EMPTY",
] as const;
export type PlatformPopupHostState = (typeof PLATFORM_POPUP_HOST_STATES)[number];

export type PlatformPopupHostEvent =
  | { type: "ELIGIBLE" }
  | { type: "DEFER" }
  | { type: "RESOLVE_START" }
  | { type: "RESOLVE_EMPTY" }
  | { type: "RESOLVE_WINNER" }
  | { type: "SHOW" }
  | { type: "DISMISS" }
  | { type: "SUPPRESS" }
  | { type: "INVALIDATE" }
  | { type: "RESET" }
  /** 진입 감사 PO-2 — 같은 진입 대기열의 다음 팝업으로(닫은·자동 닫힌 직후). 이미지 준비 단계(READY)부터 다시 */
  | { type: "QUEUE_NEXT" };

export function reducePlatformPopupHostState(
  state: PlatformPopupHostState,
  event: PlatformPopupHostEvent
): PlatformPopupHostState {
  switch (event.type) {
    case "RESET":
      return "IDLE";
    case "DEFER":
      if (state === "VISIBLE") return "INVALIDATED";
      return "DEFERRED";
    case "INVALIDATE":
      return "INVALIDATED";
    case "ELIGIBLE":
      if (state === "VISIBLE" || state === "RESOLVING" || state === "READY") return state;
      if (state === "EMPTY") return "IDLE";
      return "IDLE";
    case "RESOLVE_START":
      if (state === "VISIBLE") return state;
      return "RESOLVING";
    case "RESOLVE_EMPTY":
      // FIRST DIVERGENCE close: do not return IDLE (hostState dep would re-fetch same input).
      return "EMPTY";
    case "RESOLVE_WINNER":
      if (state === "DISMISSED" || state === "SUPPRESSED" || state === "VISIBLE") return state;
      return "READY";
    case "SHOW":
      return state === "READY" ? "VISIBLE" : state;
    case "DISMISS":
      return "DISMISSED";
    case "SUPPRESS":
      return "SUPPRESSED";
    case "QUEUE_NEXT":
      return state === "VISIBLE" || state === "DISMISSED" || state === "SUPPRESSED" ? "READY" : state;
    default:
      return state;
  }
}

/** Only VISIBLE may mount advertisement presentation shell. */
export function mayMountPlatformPopupPresentation(state: PlatformPopupHostState): boolean {
  return state === "VISIBLE";
}
