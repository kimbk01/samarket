/**
 * When Bell Modal / Full Inbox opens a destination, stamp entry origin so
 * destination Back returns to Notification Center — not board list / unrelated hub.
 * Presentation/navigation only. Does not change content SSOT or badge writers.
 */

export const NOTIFICATION_ENTRY_FROM_VALUE = "notifications" as const;
export const NOTIFICATION_CENTER_HREF = "/notifications" as const;

export function isNotificationEntryFrom(from: string | null | undefined): boolean {
  return String(from ?? "").trim() === NOTIFICATION_ENTRY_FROM_VALUE;
}

/** Append `from=notifications` without dropping existing query (idempotent). */
export function withNotificationEntryFrom(href: string): string {
  const raw = String(href ?? "").trim();
  if (!raw) return raw;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const u = new URL(raw);
      if (u.pathname === "/notifications" || u.pathname.startsWith("/notifications/")) {
        return `${u.pathname}${u.search}${u.hash}`;
      }
      if (u.searchParams.get("from") === NOTIFICATION_ENTRY_FROM_VALUE) {
        return `${u.pathname}${u.search}${u.hash}`;
      }
      u.searchParams.set("from", NOTIFICATION_ENTRY_FROM_VALUE);
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return raw;
    }
  }
  try {
    const u = new URL(raw, "https://samarket.local");
    if (u.pathname === "/notifications" || u.pathname.startsWith("/notifications/")) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    if (u.searchParams.get("from") === NOTIFICATION_ENTRY_FROM_VALUE) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    u.searchParams.set("from", NOTIFICATION_ENTRY_FROM_VALUE);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw;
  }
}

/**
 * Customer Center Detail back when opened from Notification Center / Bell.
 * Other `from` values keep existing board-list / hub behavior.
 */
export function resolveNotificationAwareDetailBackHref(input: {
  from: string | null | undefined;
  fallbackHref: string;
}): string {
  if (isNotificationEntryFrom(input.from)) return NOTIFICATION_CENTER_HREF;
  return input.fallbackHref;
}
