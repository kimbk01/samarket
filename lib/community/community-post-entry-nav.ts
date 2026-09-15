/**
 * Community post-entry navigation contract (feed → detail → back).
 *
 * Owns: source fade timing, one-shot navigation guard, origin for detail back,
 * and feed scroll restore metadata. Does not own feed query / cache authority.
 */

import {
  buildCommunityFeedHref,
  defaultCommunityNavSelection,
} from "@/lib/community/community-nav";
import { isCommunityHubRootPath } from "@/lib/community/community-hub-state";
import { philifeAppPaths } from "@/lib/philife/paths";
import {
  getMainAppScrollTop,
  setMainAppScrollTop,
} from "@/lib/layout/main-app-scroll-root";

export const COMMUNITY_POST_SOURCE_FADE_MS = 140;
export const COMMUNITY_POST_SOURCE_FADE_CLASS = "community-post-source-fade-out";

const ORIGIN_KEY = "community_post_entry_origin_v1";
const SCROLL_PENDING_KEY = "community_feed_scroll_pending_v1";
const ORIGIN_TTL_MS = 10 * 60_000;
const SCROLL_TTL_MS = 60_000;

export type CommunityPostEntryOrigin = {
  postId: string;
  originHref: string;
  scrollY: number;
  savedAt: number;
};

let navigatingHref: string | null = null;
let navigateTimer: ReturnType<typeof setTimeout> | null = null;

function readCommunityFeedScrollY(): number {
  if (typeof document === "undefined") return 0;
  try {
    const hub = document.querySelector("[data-main-hub-scroll-body]");
    if (hub instanceof HTMLElement) {
      return Math.max(0, Math.round(hub.scrollTop || 0));
    }
  } catch {
    /* */
  }
  try {
    return Math.max(0, Math.round(getMainAppScrollTop()));
  } catch {
    return 0;
  }
}

function writeCommunityFeedScrollY(y: number): void {
  if (typeof document === "undefined") return;
  const top = Math.max(0, Math.round(y));
  try {
    const hub = document.querySelector("[data-main-hub-scroll-body]");
    if (hub instanceof HTMLElement) {
      hub.scrollTop = top;
      return;
    }
  } catch {
    /* */
  }
  try {
    setMainAppScrollTop(top);
  } catch {
    /* */
  }
}

export function prefersCommunityReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** UUID-ish `/philife/:postId` only — write/my/meetings and messenger links are excluded. */
export function parseCommunityPostIdFromHref(href: string): string | null {
  const raw = (href ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "https://samarket.local");
    const path = (u.pathname || "").replace(/\/+$/, "") || "/";
    const m = path.match(/^\/philife\/([^/]+)$/i);
    if (!m) return null;
    const id = decodeURIComponent(m[1] ?? "").trim();
    if (!id) return null;
    const reserved = new Set(["write", "my", "meetings", "search"]);
    if (reserved.has(id.toLowerCase())) return null;
    return id;
  } catch {
    return null;
  }
}

export function isSafeCommunityReturnHref(href: string): boolean {
  const raw = (href ?? "").trim();
  if (!raw) return false;
  try {
    const u = new URL(raw, "https://samarket.local");
    if (u.origin !== "https://samarket.local" && typeof window !== "undefined") {
      if (u.origin !== window.location.origin) return false;
    }
    const path = (u.pathname || "").replace(/\/+$/, "") || "/";
    if (isCommunityHubRootPath(path)) return true;
    if (path === "/mypage/community-posts") return true;
    return false;
  } catch {
    return false;
  }
}

function currentCommunityOriginHref(): string {
  if (typeof window === "undefined") return philifeAppPaths.home;
  const path = (window.location.pathname || "").replace(/\/+$/, "") || "/";
  const search = window.location.search || "";
  if (isCommunityHubRootPath(path)) {
    return search ? `${path === "/" ? philifeAppPaths.home : path}${search}` : path === "/" ? philifeAppPaths.home : path;
  }
  return `${path}${search}`;
}

export function writeCommunityPostEntryOrigin(input: {
  postId: string;
  originHref?: string;
  scrollY?: number;
}): void {
  if (typeof window === "undefined") return;
  const postId = String(input.postId ?? "").trim();
  if (!postId) return;
  const originHref = (input.originHref ?? currentCommunityOriginHref()).trim();
  let scrollY = 0;
  if (typeof input.scrollY === "number") {
    scrollY = Math.max(0, Math.round(input.scrollY));
  } else {
    scrollY = readCommunityFeedScrollY();
  }
  const payload: CommunityPostEntryOrigin = {
    postId,
    originHref,
    scrollY,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(payload));
    sessionStorage.setItem(
      SCROLL_PENDING_KEY,
      JSON.stringify({
        href: originHref,
        postId,
        scrollY,
        savedAt: Date.now(),
      })
    );
  } catch {
    /* quota */
  }
}

export function peekCommunityPostEntryOrigin(): CommunityPostEntryOrigin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ORIGIN_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<CommunityPostEntryOrigin>;
    const postId = typeof j.postId === "string" ? j.postId.trim() : "";
    const originHref = typeof j.originHref === "string" ? j.originHref.trim() : "";
    const savedAt = typeof j.savedAt === "number" ? j.savedAt : 0;
    if (!postId || !originHref || !savedAt) return null;
    if (savedAt + ORIGIN_TTL_MS < Date.now()) {
      sessionStorage.removeItem(ORIGIN_KEY);
      return null;
    }
    return {
      postId,
      originHref,
      scrollY: Math.max(0, Math.round(Number(j.scrollY) || 0)),
      savedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Detail back authority.
 * CASE A–C: matching origin for this postId → exact feed context href.
 * CASE D: direct/deeplink (no matching origin) → `/philife` (never stale hub / foreign history).
 */
export function resolveCommunityDetailBackHref(input: { postId: string }): string {
  const postId = String(input.postId ?? "").trim();
  const origin = peekCommunityPostEntryOrigin();
  if (
    postId &&
    origin &&
    origin.postId === postId &&
    isSafeCommunityReturnHref(origin.originHref)
  ) {
    return origin.originHref;
  }
  return philifeAppPaths.home;
}

export function clearCommunityPostEntryNavigating(): void {
  navigatingHref = null;
  if (navigateTimer != null) {
    clearTimeout(navigateTimer);
    navigateTimer = null;
  }
}

export function isCommunityPostEntryNavigating(): boolean {
  return navigatingHref != null;
}

type NavigateFn = (href: string) => void;

/**
 * Intercept normal left-click on Community post Link.
 * Returns true when default navigation was prevented (we own the transition).
 */
export function beginCommunityPostEntryFromCard(input: {
  href: string;
  event: { defaultPrevented?: boolean; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };
  cardEl: HTMLElement | null;
  navigate: NavigateFn;
}): boolean {
  const href = String(input.href ?? "").trim();
  const postId = parseCommunityPostIdFromHref(href);
  if (!postId) return false;

  const e = input.event;
  if (e.defaultPrevented) return false;
  if ((e.button ?? 0) !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;

  if (navigatingHref) {
    return true; // caller should preventDefault — duplicate tap
  }

  writeCommunityPostEntryOrigin({ postId });
  navigatingHref = href;

  const go = () => {
    try {
      input.navigate(href);
    } finally {
      // Clear after a short window so rapid remounts cannot double-push;
      // leave enough time for route commit.
      navigateTimer = setTimeout(() => {
        navigatingHref = null;
        navigateTimer = null;
      }, 800);
    }
  };

  if (prefersCommunityReducedMotion()) {
    go();
    return true;
  }

  const el = input.cardEl;
  if (el) {
    el.classList.add(COMMUNITY_POST_SOURCE_FADE_CLASS);
  }
  navigateTimer = setTimeout(() => {
    navigateTimer = null;
    go();
  }, COMMUNITY_POST_SOURCE_FADE_MS);
  return true;
}

export function tryRestoreCommunityFeedScroll(input?: {
  pathname?: string;
  search?: string;
  maxAttempts?: number;
}): boolean {
  if (typeof window === "undefined") return false;
  type PendingScroll = { href?: string; scrollY?: number; savedAt?: number; postId?: string };
  let pending: PendingScroll | null = null;
  try {
    const raw = sessionStorage.getItem(SCROLL_PENDING_KEY);
    if (!raw) return false;
    pending = JSON.parse(raw) as PendingScroll;
  } catch {
    return false;
  }
  if (!pending?.savedAt || pending.savedAt + SCROLL_TTL_MS < Date.now()) {
    try {
      sessionStorage.removeItem(SCROLL_PENDING_KEY);
    } catch {
      /* */
    }
    return false;
  }

  const path = ((input?.pathname ?? window.location.pathname) || "").replace(/\/+$/, "") || "/";
  const searchRaw = ((input?.search ?? window.location.search) || "").replace(/^\?/, "");
  const currentHref =
    searchRaw.length > 0
      ? `${path === "/" ? philifeAppPaths.home : path}?${searchRaw}`
      : path === "/"
        ? philifeAppPaths.home
        : path;

  const expected = String(pending.href ?? "").trim();
  if (expected) {
    const norm = (h: string) => {
      try {
        const u = new URL(h, "https://samarket.local");
        const p = (u.pathname || "").replace(/\/+$/, "") || "/";
        const q = u.searchParams.toString();
        const base = p === "/" ? philifeAppPaths.home : p;
        return q ? `${base}?${q}` : base;
      } catch {
        return h;
      }
    };
    if (norm(expected) !== norm(currentHref)) {
      // Hub bare remount may still be replacing to saved selection — keep pending briefly.
      if (!isCommunityHubRootPath(path)) {
        try {
          sessionStorage.removeItem(SCROLL_PENDING_KEY);
        } catch {
          /* */
        }
      }
      return false;
    }
  }

  const y = Math.max(0, Math.round(Number(pending.scrollY) || 0));
  try {
    sessionStorage.removeItem(SCROLL_PENDING_KEY);
  } catch {
    /* */
  }
  if (y <= 0) return true;

  const anchorPostId = String(pending.postId ?? "").trim();
  const maxAttempts = input?.maxAttempts ?? 40;
  let attempt = 0;
  const tick = () => {
    if (anchorPostId && typeof document !== "undefined") {
      const anchor = document.querySelector(
        `article[data-community-card="post"] a[href*="${anchorPostId.replace(/"/g, "")}"]`
      );
      if (anchor instanceof HTMLElement) {
        try {
          anchor.scrollIntoView({ block: "center", behavior: "auto" });
        } catch {
          writeCommunityFeedScrollY(y);
        }
      } else {
        writeCommunityFeedScrollY(y);
      }
    } else {
      writeCommunityFeedScrollY(y);
    }
    attempt += 1;
    if (attempt >= maxAttempts) return;
    const cur = readCommunityFeedScrollY();
    // Accept near-target or any non-top restore when we had a large prior Y.
    if (Math.abs(cur - y) <= 24 || (y > 200 && cur > 80)) return;
    if (attempt < 8) {
      requestAnimationFrame(tick);
    } else {
      setTimeout(tick, 40);
    }
  };
  requestAnimationFrame(tick);
  setTimeout(tick, 120);
  setTimeout(tick, 320);
  return true;
}

/** Contract helper — default hub href used by tests / fallbacks. */
export function communityDefaultHubHref(): string {
  return buildCommunityFeedHref(philifeAppPaths.home, {
    selection: defaultCommunityNavSelection(),
  });
}
