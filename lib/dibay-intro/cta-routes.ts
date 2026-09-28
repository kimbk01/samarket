import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";

const BLOCKED_PREFIXES = ["/admin", "/stores/owner", "/business"];

export const DIBAY_INTRO_CTA_ROUTE_OPTIONS = [
  { href: "/philife", labelKo: "커뮤니티", labelEn: "Community" },
  { href: "/market", labelKo: "거래", labelEn: "Market" },
  { href: "/stores", labelKo: "배달", labelEn: "Delivery" },
  { href: "/community-messenger", labelKo: "채팅", labelEn: "Chat" },
  { href: "/mypage", labelKo: "내정보", labelEn: "My" },
] as const;

export function resolveApprovedIntroCtaRoute(value: unknown): string | null {
  const resolved = resolveSafeNotificationInternalRoute(value, null);
  if (!resolved) return null;
  const path = resolved.split("?")[0] ?? resolved;
  if (BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return DIBAY_INTRO_CTA_ROUTE_OPTIONS.some((opt) => path === opt.href) ? path : null;
}

export function isApprovedIntroCtaRoute(value: unknown): boolean {
  return resolveApprovedIntroCtaRoute(value) != null;
}
