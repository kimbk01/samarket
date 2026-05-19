"use client";

/** dev 검증 — `window.__dibayBootVerify` 에 부트 관련 fetch 누적 */
export type BootJournalEntry = {
  url: string;
  atMs: number;
  clientCallSource: string | null;
};

declare global {
  interface Window {
    __dibayBootVerify?: {
      entries: BootJournalEntry[];
      firstPaintAtMs: number | null;
    };
  }
}

function ensureStore(): NonNullable<Window["__dibayBootVerify"]> {
  if (typeof window === "undefined") {
    return { entries: [], firstPaintAtMs: null };
  }
  if (!window.__dibayBootVerify) {
    window.__dibayBootVerify = { entries: [], firstPaintAtMs: null };
  }
  return window.__dibayBootVerify;
}

export function markBootVerifyFirstPaint(): void {
  const s = ensureStore();
  if (s.firstPaintAtMs == null) {
    s.firstPaintAtMs = performance.now();
  }
}

export function recordBootVerifyFetch(url: string, clientCallSource: string | null): void {
  const s = ensureStore();
  const u = url.trim();
  if (
    !u.includes("/api/me/profile") &&
    !u.includes("/api/auth/session") &&
    !u.includes("/api/me/store-owner-hub-badge") &&
    !u.includes("/api/community-messenger/bootstrap") &&
    !u.includes("/api/community-messenger/home-sync") &&
    !u.includes("/api/community-messenger/trade-chat-list-meta")
  ) {
    return;
  }
  s.entries.push({ url: u, atMs: performance.now(), clientCallSource });
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- boot verify
    console.debug("[app-boot-verify]", { url: u, clientCallSource });
  }
}
