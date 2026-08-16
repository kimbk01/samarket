/**
 * MAIN DOMAIN identity for bottom-nav true push.
 * SSOT: wraps `resolveMainSurface` — do not re-parse pathnames at call sites.
 */
import {
  resolveMainSurface,
  type MainSurfaceId,
} from "@/lib/layout/resolve-main-surface";

export type MainDomainId = Exclude<MainSurfaceId, "other">;

export const MAIN_DOMAIN_IDS = [
  "community",
  "trade",
  "delivery",
  "chat",
  "mypage",
] as const satisfies readonly MainDomainId[];

export function isMainDomainId(id: MainSurfaceId | null | undefined): id is MainDomainId {
  return id === "community" || id === "trade" || id === "delivery" || id === "chat" || id === "mypage";
}

export function resolveMainDomainId(pathname: string | null | undefined): MainDomainId | null {
  const surface = resolveMainSurface(pathname);
  return isMainDomainId(surface) ? surface : null;
}

/**
 * Bottom-nav MAIN DOMAIN true push — domains differ.
 * Same domain (incl. hub aliases /philife↔/) → not a main-domain push (scroll_only / in-domain).
 */
export function isMainDomainCrossPush(
  fromPathname: string | null | undefined,
  toPathname: string | null | undefined
): boolean {
  const from = resolveMainDomainId(fromPathname);
  const to = resolveMainDomainId(toPathname);
  if (!from || !to) return false;
  return from !== to;
}

export type MainDomainPushArmSource = "bottom-nav" | "trade-primary" | string | undefined;

/**
 * True push arms only for bottom-nav cross-domain (product contract).
 * trade-primary stays in-domain — not MAIN DOMAIN push.
 */
export function shouldArmMainDomainTruePush(args: {
  fromPathname: string | null | undefined;
  toPathname: string | null | undefined;
  intentSource: MainDomainPushArmSource;
  reducedMotion: boolean;
}): boolean {
  if (args.reducedMotion) return false;
  if (args.intentSource !== "bottom-nav") return false;
  return isMainDomainCrossPush(args.fromPathname, args.toPathname);
}
