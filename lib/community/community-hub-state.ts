/**
 * Community hub last-selection SSOT (sessionStorage).
 *
 * Legacy hub-tab pattern (Kakao/Telegram Tier 1): bottom-nav returns to the last
 * sub-surface (topic / local / all+sort), not bare `/philife` → flash All then replace.
 *
 * History remains replace. Visual cover uses the restored URL on first paint.
 */

import {
  buildCommunityFeedHref,
  defaultCommunityNavSelection,
  isSameCommunityNavSelection,
  type CommunityNavSelection,
} from "@/lib/community/community-nav";

export const COMMUNITY_HUB_STATE_KEY = "community_hub_state_v1";

export type CommunityHubStateShape = { nav: string; category: string; sort: string };

export function isCommunityHubRootPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  return p === "/" || p === "/philife" || p === "/community";
}

export function readCommunityHubState(): CommunityHubStateShape | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COMMUNITY_HUB_STATE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { nav?: unknown; category?: unknown; sort?: unknown };
    return {
      nav: typeof j.nav === "string" ? j.nav.trim().toLowerCase() : "",
      category: typeof j.category === "string" ? j.category.trim().toLowerCase() : "",
      sort: typeof j.sort === "string" ? j.sort.trim().toLowerCase() : "",
    };
  } catch {
    return null;
  }
}

/** `CommunityNavSelection` → hub state shape (URL 과 같은 authority) */
export function communityNavSelectionToHubState(sel: CommunityNavSelection): CommunityHubStateShape {
  if (sel.kind === "topic") {
    return { nav: "", category: sel.topicSlug.trim().toLowerCase(), sort: "" };
  }
  if (sel.kind === "local") {
    return { nav: "local", category: "", sort: "" };
  }
  if (sel.kind === "popular") {
    return { nav: "all", category: "", sort: "popular" };
  }
  if (sel.kind === "home") {
    return { nav: "all", category: "", sort: "latest" };
  }
  return { nav: "all", category: "", sort: sel.allSort === "popular" ? "popular" : "latest" };
}

export function hubStateToCommunityNavSelection(h: CommunityHubStateShape): CommunityNavSelection {
  if (h.nav === "local") return { kind: "local", topicSlug: "", allSort: "latest" };
  if (h.category) return { kind: "topic", topicSlug: h.category, allSort: "latest" };
  if (h.nav === "all") {
    return { kind: "all", topicSlug: "", allSort: h.sort === "popular" ? "popular" : "latest" };
  }
  if (h.nav === "popular" || h.sort === "popular") {
    return { kind: "all", topicSlug: "", allSort: "popular" };
  }
  if (h.nav === "home" || h.sort === "latest" || h.sort === "recommended") {
    return { kind: "all", topicSlug: "", allSort: "latest" };
  }
  return { kind: "all", topicSlug: "", allSort: "latest" };
}

export function writeCommunityHubState(sel: CommunityNavSelection): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(COMMUNITY_HUB_STATE_KEY, JSON.stringify(communityNavSelectionToHubState(sel)));
  } catch {
    /* ignore */
  }
}

function communityHubHrefHasNavParams(href: string): boolean {
  try {
    const u = new URL(href, "https://samarket.local");
    return (
      u.searchParams.has("nav") ||
      u.searchParams.has("category") ||
      u.searchParams.has("sort") ||
      u.searchParams.has("mode")
    );
  } catch {
    return false;
  }
}

/**
 * Bottom-nav entry: bare community hub → last saved selection URL.
 * Already on hub root → leave href unchanged (scroll-only / stay).
 * No saved state or default all+latest → bare hub (product default).
 */
export function resolveCommunityBottomNavEntryHref(
  href: string,
  options?: { fromPathname?: string | null }
): string {
  const raw = (href ?? "").trim();
  if (!raw) return raw;

  let path = raw;
  try {
    const u = new URL(raw, "https://samarket.local");
    path = u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    path = (raw.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  }

  if (!isCommunityHubRootPath(path)) return raw;
  if (communityHubHrefHasNavParams(raw)) return raw;
  if (isCommunityHubRootPath(options?.fromPathname)) return raw;

  const saved = readCommunityHubState();
  if (!saved) return raw;
  const selection = hubStateToCommunityNavSelection(saved);
  if (isSameCommunityNavSelection(selection, defaultCommunityNavSelection())) return raw;
  return buildCommunityFeedHref(path, { selection });
}
