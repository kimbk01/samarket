import {
  resolveCanonicalNavIndex,
  routeTransitionPushAxisForKind,
  type MainShellRoutePushAxis,
} from "@/components/route-transition/route-transition-config";
import { computeRouteTransitionEnterKind } from "@/components/route-transition/route-transition-enter-kind";
import type { CanonicalNavIndexResolver } from "@/lib/main-menu/canonical-nav-index-resolver";

function normalizePathKey(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim() ?? "";
}

function pathFromHref(href: string): string {
  const raw = href.trim();
  const q = raw.indexOf("?");
  return (q >= 0 ? raw.slice(0, q) : raw).trim();
}

/**
 * 하단 탭 이동 push 축 — canonical 인덱스 단일 소스.
 * 우측 탭(ltr): 새 화면이 왼쪽에서 밀고 들어옴 / 좌측 탭(rtl): 오른쪽에서 밀고 들어옴.
 */
export function computeMainBottomNavPushAxis(
  fromPathname: string | null | undefined,
  targetHref: string,
  resolveIndex: CanonicalNavIndexResolver = resolveCanonicalNavIndex
): MainShellRoutePushAxis | null {
  const from = normalizePathKey(fromPathname);
  const to = pathFromHref(targetHref);
  if (!from || !to || from === to) return null;

  const kind = computeRouteTransitionEnterKind(from, to, {
    popstateBack: false,
    lastForwardAxisRef: { current: null },
    resolveIndex,
  });
  return routeTransitionPushAxisForKind(kind);
}
