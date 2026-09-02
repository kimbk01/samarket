import { canonicalizeLegacyCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";

const SAFE_NOTIFICATION_ROUTE_PREFIXES = [
  "/community-messenger",
  "/community",
  "/group-chat",
  "/chats",
  "/post",
  "/market",
  "/stores",
  "/orders",
  "/my",
  "/mypage",
  "/philife",
  "/notifications",
  "/business",
  "/admin",
] as const;

/**
 * A2-3 — Support notification/push allowlist (exact case restore).
 * Do NOT allow arbitrary `/support/*`. Only enter + `/support/cases/{caseId}`.
 */
export function isAllowedSupportNotificationPath(pathname: string): boolean {
  const path = String(pathname || "").trim();
  if (path === "/support/enter") return true;
  const m = /^\/support\/cases\/([^/]+)$/.exec(path);
  if (!m) return false;
  let id = m[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    return false;
  }
  const trimmed = id.trim();
  if (!trimmed) return false;
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed === "open" || trimmed === "new" || trimmed === "enter") return false;
  return true;
}

export function resolveSafeNotificationInternalRoute(
  value: unknown,
  fallback: string | null = null
): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || /[\u0000-\u001f\\]/.test(raw)) return fallback;

  let route = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      route = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return fallback;
    }
  }

  if (!route.startsWith("/") || route.startsWith("//")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(route, "https://dibay.internal");
  } catch {
    return fallback;
  }
  const healedPath =
    canonicalizeLegacyCommunityPostNotificationPath(parsed.pathname) ?? parsed.pathname;
  if (healedPath !== parsed.pathname) {
    parsed = new URL(`${healedPath}${parsed.search}${parsed.hash}`, "https://dibay.internal");
  }
  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (isAllowedSupportNotificationPath(parsed.pathname)) {
    return normalized;
  }
  if (
    parsed.pathname !== "/" &&
    !SAFE_NOTIFICATION_ROUTE_PREFIXES.some(
      (prefix) =>
        parsed.pathname === prefix ||
        parsed.pathname.startsWith(`${prefix}/`)
    )
  ) {
    return fallback;
  }
  return normalized;
}
