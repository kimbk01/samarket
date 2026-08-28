import type { MutableRefObject } from "react";
import type { RouteTransitionEnterKind } from "@/components/route-transition/route-transition-config";
import {
  commerceConsumerStackDepth,
  isCommerceConsumerStackPath,
} from "@/lib/delivery/customer/commerce-consumer-stack-slide";

/** Gift commerce child flows — same 440ms as main shell push. */
export const COMMERCE_CHILD_PAGE_SLIDE_MS = 440;

export const COMMERCE_CHILD_ROUTE_ENTER_CLASSES = [
  "commerce-child-route-enter-rtl-forward",
  "commerce-child-route-enter-ltr-back",
  "commerce-child-route-enter-subtle",
] as const;

export function isCommerceConsumerChildSlideHostPath(path: string | null | undefined): boolean {
  const d = commerceConsumerStackDepth(path);
  return d >= 1;
}

/**
 * Internal gift-commerce child navigation (mall↔product, instance detail).
 * Hub entry/exit (depth 0) stays on AppRouteTransition.
 */
export function shouldSuppressCommerceConsumerMainShellSlide(
  prevPath: string,
  nextPath: string
): boolean {
  if (!isCommerceConsumerStackPath(prevPath) || !isCommerceConsumerStackPath(nextPath)) {
    return false;
  }
  const dPrev = commerceConsumerStackDepth(prevPath);
  const dNext = commerceConsumerStackDepth(nextPath);
  return dPrev >= 1 && dNext >= 1;
}

export function computeCommerceChildTransitionKind(
  prevPath: string,
  nextPath: string,
  opts: {
    popstateBack: boolean;
    lastForwardAxisRef: MutableRefObject<"ltr" | "rtl" | null>;
  }
): RouteTransitionEnterKind {
  if (prevPath === nextPath) return "none";
  if (!isCommerceConsumerStackPath(prevPath) || !isCommerceConsumerStackPath(nextPath)) return "none";

  const dPrev = commerceConsumerStackDepth(prevPath);
  const dNext = commerceConsumerStackDepth(nextPath);
  if (dPrev < 1 || dNext < 1) return "none";

  if (opts.popstateBack) {
    return dNext < dPrev ? "ltr-back" : "rtl-back";
  }
  if (dNext > dPrev) {
    opts.lastForwardAxisRef.current = "rtl";
    return "rtl-forward";
  }
  if (dNext < dPrev) {
    return "ltr-back";
  }
  return "subtle";
}

export function commerceChildRouteTransitionClassForKind(
  kind: RouteTransitionEnterKind
): string | null {
  switch (kind) {
    case "rtl-forward":
      return "commerce-child-route-enter-rtl-forward";
    case "ltr-back":
      return "commerce-child-route-enter-ltr-back";
    case "subtle":
      return "commerce-child-route-enter-subtle";
    default:
      return null;
  }
}
