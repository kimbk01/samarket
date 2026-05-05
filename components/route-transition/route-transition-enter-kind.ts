import type { MutableRefObject } from "react";
import {
  resolveCanonicalNavIndex,
  shouldSuppressMessengerRoomMainShellSlide,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";

function syncLastForwardAxisAfterKind(
  kind: RouteTransitionEnterKind,
  ref: MutableRefObject<"ltr" | "rtl" | null>
): void {
  if (kind === "ltr-forward") {
    ref.current = "ltr";
    return;
  }
  if (kind === "rtl-forward") {
    ref.current = "rtl";
    return;
  }
  if (kind === "ltr-back" || kind === "rtl-back") {
    ref.current = null;
  }
}

export function computeRouteTransitionEnterKind(
  prevPath: string,
  nextPath: string,
  opts: {
    popstateBack: boolean;
    lastForwardAxisRef: MutableRefObject<"ltr" | "rtl" | null>;
  }
): RouteTransitionEnterKind {
  let kind: RouteTransitionEnterKind;

  if (prevPath === nextPath) {
    kind = "none";
  } else if (shouldSuppressMessengerRoomMainShellSlide(prevPath, nextPath)) {
    kind = "none";
  } else {
    const ixPrev = resolveCanonicalNavIndex(prevPath);
    const ixNext = resolveCanonicalNavIndex(nextPath);

    if (ixPrev === null || ixNext === null) {
      kind = "none";
    } else if (ixPrev === ixNext) {
      kind = "subtle";
    } else if (opts.popstateBack) {
      const axis = opts.lastForwardAxisRef.current;
      if (axis === "ltr") kind = "rtl-back";
      else if (axis === "rtl") kind = "ltr-back";
      else kind = ixNext > ixPrev ? "ltr-back" : "rtl-back";
    } else if (ixNext > ixPrev) {
      kind = "ltr-forward";
    } else {
      kind = "rtl-forward";
    }
  }

  syncLastForwardAxisAfterKind(kind, opts.lastForwardAxisRef);
  return kind;
}
