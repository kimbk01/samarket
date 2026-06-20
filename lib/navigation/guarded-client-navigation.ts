import {
  evaluateDeepRouteNavigationGuard,
  getActiveDeepRouteNavigationLock,
  warnCmRoomRouteGuardBlocked,
  type NavigationGuardSource,
} from "@/lib/navigation/cm-deep-route-navigation-lock";

export type { NavigationGuardSource };

export function guardedClientNavigate(
  navigate: (href: string) => void,
  href: string,
  source: NavigationGuardSource,
  opts?: { fromHref?: string | null }
): boolean {
  const verdict = evaluateDeepRouteNavigationGuard(href, {
    source,
    fromHref: opts?.fromHref,
  });
  if (!verdict.allow) {
    const fromHref =
      opts?.fromHref ??
      (typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : null);
    warnCmRoomRouteGuardBlocked({
      from: fromHref,
      target: href,
      reason: verdict.blockReason ?? "blocked",
      activeLock: getActiveDeepRouteNavigationLock(),
      source,
    });
    return false;
  }
  navigate(href);
  return true;
}
