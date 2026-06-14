import type { ConsoleMessage, Page, Request } from "@playwright/test";

export type GuestAuthConsoleCounts = {
  guest401Detected: number;
  guestStateEstablished: number;
  authRefreshStart: number;
  authRefreshStartAfterGuest: number;
  guestFetchSkipped: number;
  guestEstablishedAtMs: number | null;
};

export type GuestAuthNetworkCounts = {
  authSessionAfterGuest: number;
  meProfileAfterGuest: number;
  notificationUnreadAfterGuest: number;
};

export type GuestBrowseProbeResult = GuestAuthConsoleCounts & GuestAuthNetworkCounts;

const AUTH_SESSION_RE = /\/api\/auth\/session(?:\?|$)/;
const ME_PROFILE_RE = /\/api\/me\/profile(?:\?|$)/;
const NOTIF_UNREAD_RE = /\/api\/me\/notifications(?:\?.*unread_count_only=1|$)/;

function parseConsoleTag(text: string): string | null {
  const trimmed = text.trim();
  const bracket = trimmed.match(/^\[([^\]]+)\]/);
  return bracket?.[1] ?? null;
}

function parseGuestEstablishedAt(text: string): number | null {
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const payload = JSON.parse(text.slice(jsonStart)) as { at?: number };
    return typeof payload.at === "number" ? payload.at : null;
  } catch {
    return null;
  }
}

function isTrackedAuthRequest(url: string): "authSession" | "meProfile" | "notificationUnread" | null {
  if (AUTH_SESSION_RE.test(url)) return "authSession";
  if (ME_PROFILE_RE.test(url)) return "meProfile";
  if (NOTIF_UNREAD_RE.test(url)) return "notificationUnread";
  return null;
}

/** guest 확정 이후 auth/session·profile·badge 네트워크·콘솔 측정 */
export function attachGuestAuthProbe(page: Page): {
  read: () => GuestBrowseProbeResult;
  dispose: () => void;
} {
  const consoleCounts: GuestAuthConsoleCounts = {
    guest401Detected: 0,
    guestStateEstablished: 0,
    authRefreshStart: 0,
    authRefreshStartAfterGuest: 0,
    guestFetchSkipped: 0,
    guestEstablishedAtMs: null,
  };

  const networkAfterGuest: GuestAuthNetworkCounts = {
    authSessionAfterGuest: 0,
    meProfileAfterGuest: 0,
    notificationUnreadAfterGuest: 0,
  };

  const onConsole = (msg: ConsoleMessage) => {
    const text = msg.text();
    const tag = parseConsoleTag(text);
    if (tag === "guest_401_detected") {
      consoleCounts.guest401Detected += 1;
    } else if (tag === "guest_state_established") {
      consoleCounts.guestStateEstablished += 1;
      const at = parseGuestEstablishedAt(text);
      if (at != null && consoleCounts.guestEstablishedAtMs == null) {
        consoleCounts.guestEstablishedAtMs = at;
      }
    } else if (tag === "auth_refresh_start") {
      consoleCounts.authRefreshStart += 1;
      if (consoleCounts.guestEstablishedAtMs != null) {
        consoleCounts.authRefreshStartAfterGuest += 1;
      }
    } else if (tag === "guest_fetch_skipped") {
      consoleCounts.guestFetchSkipped += 1;
    }
  };

  const onRequest = (req: Request) => {
    if (consoleCounts.guestEstablishedAtMs == null) return;
    const tracked = isTrackedAuthRequest(req.url());
    if (!tracked) return;
    if (tracked === "authSession") networkAfterGuest.authSessionAfterGuest += 1;
    if (tracked === "meProfile") networkAfterGuest.meProfileAfterGuest += 1;
    if (tracked === "notificationUnread") networkAfterGuest.notificationUnreadAfterGuest += 1;
  };

  page.on("console", onConsole);
  page.on("request", onRequest);

  return {
    read: () => ({ ...consoleCounts, ...networkAfterGuest }),
    dispose: () => {
      page.off("console", onConsole);
      page.off("request", onRequest);
    },
  };
}

export async function waitForGuestAuthSettle(page: Page, timeoutMs = 8_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const probe = (window as Window & {
        __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
      }).__dibayGuestAuthProbe?.();
      return probe?.authMissing === true;
    },
    undefined,
    { timeout: timeoutMs }
  ).catch(() => undefined);
  await page.waitForTimeout(2_500);
}
