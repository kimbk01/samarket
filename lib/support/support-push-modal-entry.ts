/**
 * Support push paths that open the Support Modal without a full-page bounce.
 */

import { isAllowedSupportNotificationPath } from "@/lib/notifications/policy/notification-internal-route";

function pathOnly(path: string): string {
  const raw = path.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, "https://dibay.internal");
    return u.pathname;
  } catch {
    return raw.split("?")[0]?.split("#")[0] ?? raw;
  }
}

/**
 * Exact `/support/cases/{caseId}` from a push target path.
 * `/support/enter` returns null (start flow, not restore).
 */
export function parseSupportCaseIdFromPushPath(path: string): string | null {
  const pathname = pathOnly(path);
  if (!isAllowedSupportNotificationPath(pathname)) return null;
  if (pathname === "/support/enter") return null;
  const m = /^\/support\/cases\/([^/]+)$/.exec(pathname);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

export function isSupportCasePushPath(path: string): boolean {
  return Boolean(parseSupportCaseIdFromPushPath(path));
}
