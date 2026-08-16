import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";
import { resolveCanonicalNavIndex } from "@/components/route-transition/route-transition-config";
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
 * 하단 탭 이동 push 축 — 항상 우→좌(`rtl`), 440ms enter 와 짝.
 * `resolveIndex` 는 호출 시그니처 호환용(미사용).
 */
export function computeMainBottomNavPushAxis(
  fromPathname: string | null | undefined,
  targetHref: string,
  resolveIndex: CanonicalNavIndexResolver = resolveCanonicalNavIndex
): MainShellRoutePushAxis | null {
  const from = normalizePathKey(fromPathname);
  const to = pathFromHref(targetHref);
  if (!from || !to || from === to) return null;
  void resolveIndex;
  return "rtl";
}
