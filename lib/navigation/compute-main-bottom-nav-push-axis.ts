import type { MainShellRoutePushAxis } from "@/components/route-transition/route-transition-config";
import { resolveMainSurface } from "@/lib/layout/resolve-main-surface";

function normalizePathKey(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim() ?? "";
}

function pathFromHref(href: string): string {
  const raw = href.trim();
  const q = raw.indexOf("?");
  return (q >= 0 ? raw.slice(0, q) : raw).trim();
}

/**
 * BottomNav MAIN domain push 축 — 제품 계약: 다른 MAIN DOMAIN = 항상 RIGHT→LEFT (`rtl`).
 * DO NOT: canonical index 비교로 ltr/rtl 분기 (detail/internal enter-kind 와 분리).
 * same path 또는 same MainSurfaceId → null (same-tab / 동일 도메인은 슬라이드 없음).
 */
export function computeMainBottomNavPushAxis(
  fromPathname: string | null | undefined,
  targetHref: string
): MainShellRoutePushAxis | null {
  const from = normalizePathKey(fromPathname);
  const to = pathFromHref(targetHref);
  if (!from || !to || from === to) return null;

  const fromSurface = resolveMainSurface(from);
  const toSurface = resolveMainSurface(to);
  if (fromSurface === toSurface) return null;
  if (fromSurface === "other" || toSurface === "other") return null;

  return "rtl";
}
