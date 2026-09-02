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
  | { type: "RESET" };

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
      return "IDLE";
    case "RESOLVE_START":
      if (state === "VISIBLE") return state;
      return "RESOLVING";
    case "RESOLVE_EMPTY":
      return "IDLE";
    case "RESOLVE_WINNER":
      if (state === "DISMISSED" || state === "SUPPRESSED" || state === "VISIBLE") return state;
      return "READY";
    case "SHOW":
      return state === "READY" ? "VISIBLE" : state;
    case "DISMISS":
      return "DISMISSED";
    case "SUPPRESS":
      return "SUPPRESSED";
    default:
      return state;
  }
}

/** Only VISIBLE may mount advertisement presentation shell. */
export function mayMountPlatformPopupPresentation(state: PlatformPopupHostState): boolean {
  return state === "VISIBLE";
}
