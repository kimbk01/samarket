/**
 * Persistent snapshot → first paint for CommunityFeed.
 * Server 에서는 항상 null (localStorage 없음) — client layoutEffect 에서만 복원한다.
 */
import { normalizeFeedSort } from "@/lib/community-feed/constants";
import {
  parseCommunityNavFromSearchParams,
  communityNavToFeedQuery,
  type CommunityNavSelection,
} from "@/lib/community/community-nav";
import {
  philifeFeedViewerSig,
  readPhilifeFeedCache,
  resolvePhilifeColdBootViewerSig,
} from "@/lib/community/philife-feed-session-cache";
import {
  buildFeedChipsFromPhilifeTopicOptionsJson,
  isPhilifeRecommendSortCategory,
} from "@/lib/philife/philife-feed-chips-from-topic-options";
import {
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
  philifeFeedSessionKeyForLocation,
} from "@/lib/philife/neighborhood-feed-client-url";
import type { PhilifeNeighborhoodTopicOptionsJson } from "@/lib/philife/neighborhood-topic-options-contract";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

export function parseCommunityFeedHref(href: string): {
  category: string;
  sort: string;
  path: string;
  selection: CommunityNavSelection;
} {
  try {
    const u = new URL(href, "https://samarket.local");
    const sort = (u.searchParams.get("sort") ?? "").trim();
    const selection = parseCommunityNavFromSearchParams(u.searchParams);
    return {
      path: u.pathname.replace(/\/+$/, "") || "/",
      category: (u.searchParams.get("category") ?? "").trim().toLowerCase(),
      sort,
      selection,
    };
  } catch {
    return {
      path: "/",
      category: "",
      sort: "",
      selection: parseCommunityNavFromSearchParams(new URLSearchParams()),
    };
  }
}

/**
 * Resolve API sort from URL category + sort/nav.
 * Home: recommended|latest. Popular: popular. Topic/Local: latest (legacy recommend* category still maps).
 */
export function resolvePhilifeFeedSortForQuery(
  categoryRaw: string,
  sortRaw: string
): "latest" | "popular" | "recommended" {
  const c = categoryRaw.trim().toLowerCase();
  if (isPhilifeRecommendSortCategory(c) && !sortRaw.trim()) return "recommended";
  if (!sortRaw.trim()) return "latest";
  const n = normalizeFeedSort(sortRaw);
  if (n === "popular") return "popular";
  if (n === "recommended") return "recommended";
  return "latest";
}

export type CommunityFeedBootSelection = {
  category: string;
  authorityReady: boolean;
};

/**
 * URL category 가 있으면 그것이 권한이다.
 * category 가 없으면 항상 홈(`""`) — `showAllFeedTab=false` 여도 첫 주제를 강제하지 않는다.
 */
export function resolveCommunityFeedBootSelection(
  categoryRaw: string,
  topicOptions: PhilifeNeighborhoodTopicOptionsJson | null | undefined
): CommunityFeedBootSelection {
  const fromUrl = categoryRaw.trim().toLowerCase();
  if (fromUrl && !isPhilifeRecommendSortCategory(fromUrl)) {
    return { category: fromUrl, authorityReady: true };
  }
  if (!topicOptions) {
    return { category: "", authorityReady: false };
  }
  return { category: "", authorityReady: true };
}

/**
 * topic-options 객체가 새로 와도 feed/nav authority 가 같으면 state 교체·feed reset 금지.
 * DO NOT: slug 만 비교 — Admin rename(name/name_en) 시 App Nav 라벨이 stale 로 남음.
 * Identity = slug · Display authority = label(name) + name_en.
 */
export function isSameCommunityTopicOptionsAuthority(
  a: PhilifeNeighborhoodTopicOptionsJson | null | undefined,
  b: PhilifeNeighborhoodTopicOptionsJson | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  /** `showAllFeedTab` is bridge-only under Community Nav SSOT — do not treat as authority. */
  if ((a.showNeighborOnlyFilter !== false) !== (b.showNeighborOnlyFilter !== false)) return false;
  const ac = buildFeedChipsFromPhilifeTopicOptionsJson(a).chips;
  const bc = buildFeedChipsFromPhilifeTopicOptionsJson(b).chips;
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i += 1) {
    const left = ac[i]!;
    const right = bc[i]!;
    if ((left.slug ?? "").trim().toLowerCase() !== (right.slug ?? "").trim().toLowerCase()) {
      return false;
    }
    if ((left.label ?? "").trim() !== (right.label ?? "").trim()) {
      return false;
    }
    if ((left.name_en ?? "").trim() !== (right.name_en ?? "").trim()) {
      return false;
    }
  }
  return true;
}

/**
 * Persistent snapshot → RSC-shaped seed.
 * Home/Topic/Popular use global session key; Local uses location-scoped key.
 */
export function resolveInitialCommunityFeedSnapshot(args?: {
  href?: string;
  topicOptions?: PhilifeNeighborhoodTopicOptionsJson | null;
  /** Local nav only — required when selection.requiresRegion */
  locationKey?: string | null;
}): PhilifeGlobalFeedInitialRsc | null {
  if (typeof window === "undefined") return null;

  const href =
    args?.href?.trim() ||
    `${window.location.pathname}${window.location.search}` ||
    "/philife";
  const parsed = parseCommunityFeedHref(href);
  const plan = communityNavToFeedQuery(parsed.selection);

  const locationKey = (args?.locationKey ?? "").trim();
  if (plan.requiresRegion && !locationKey) return null;

  const selection = resolveCommunityFeedBootSelection(
    parsed.category || plan.category,
    args?.topicOptions
  );
  if (!selection.authorityReady) return null;

  const category = plan.category || selection.category;
  const seededSort = plan.feedSort;
  const sessionKey = plan.globalFeed
    ? PHILIFE_GLOBAL_FEED_SESSION_KEY
    : philifeFeedSessionKeyForLocation(locationKey);

  const liveSig = philifeFeedViewerSig();
  const cacheViewerSig = liveSig !== "_anon" ? liveSig : resolvePhilifeColdBootViewerSig();
  const snap = readPhilifeFeedCache(
    sessionKey,
    category,
    false,
    cacheViewerSig,
    seededSort
  );
  if (!snap?.posts?.length) return null;

  return {
    viewerKey: cacheViewerSig,
    seededCategory: category,
    seededSort,
    posts: snap.posts,
    hasMore: snap.hasMore,
    nextOffset: snap.nextOffset,
    pagingOffsetAdvance: snap.posts.length,
    topicOptionsSeed: args?.topicOptions ?? undefined,
  };
}
