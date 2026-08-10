/**
 * Community 2단 Navigation composition SSOT.
 *
 * CONTRACT:
 * - User sees ONE row: Home | Admin topics… | Local | Popular
 * - Internal authority is NOT one DB table:
 *   HOME → Community home feed + homeSort (recommended|latest)
 *   TOPIC → community_topics (via topic chips / category slug)
 *   LOCAL → Region SSOT (locationKey required)
 *   POPULAR → Server feedSort=popular, Community-wide (allLocations / globalFeed)
 * - DO NOT store home/local/popular/recommended/latest as community_topics rows
 * - DO NOT jam nav into category alone
 */

import type { PhilifeFeedTopicChip } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";

export type CommunityNavKind = "home" | "topic" | "local" | "popular";

/** Home-only user sorts — maps to server feedSort */
export type CommunityHomeSort = "recommended" | "latest";

export type CommunityNavSelection = {
  kind: CommunityNavKind;
  /** kind=topic only */
  topicSlug: string;
  /** kind=home only; ignored elsewhere */
  homeSort: CommunityHomeSort;
};

export type CommunityNavComposeItem =
  | { kind: "home" }
  | { kind: "topic"; slug: string; label: string; name_en: string | null }
  | { kind: "local" }
  | { kind: "popular" };

export type CommunityFeedQueryPlan = {
  /** API neighborhood-feed sort */
  feedSort: "recommended" | "latest" | "popular";
  /** topic filter slug or "" */
  category: string;
  /** true → globalFeed / allLocations (no region) */
  globalFeed: boolean;
  /** true → block fetch until locationKey ready; show set-neighborhood CTA */
  requiresRegion: boolean;
};

export function defaultCommunityNavSelection(): CommunityNavSelection {
  return { kind: "home", topicSlug: "", homeSort: "recommended" };
}

export function normalizeCommunityHomeSort(raw: string | null | undefined): CommunityHomeSort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "latest") return "latest";
  return "recommended";
}

/**
 * Parse nav from URL.
 * - `nav=local|popular` wins over category/sort for those kinds
 * - `category` (real topic) → topic
 * - else home; `sort=recommended|latest` (default recommended). Legacy `sort=popular` without nav → popular
 * - Legacy Slice1 `mode=local|popular` → nav
 */
export function parseCommunityNavFromSearchParams(
  searchParams: URLSearchParams | { get(name: string): string | null }
): CommunityNavSelection {
  const navRaw = (searchParams.get("nav") ?? "").trim().toLowerCase();
  const modeRaw = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const sortRaw = (searchParams.get("sort") ?? "").trim().toLowerCase();
  const categoryRaw = (searchParams.get("category") ?? "").trim().toLowerCase();

  if (navRaw === "local" || modeRaw === "local") {
    return { kind: "local", topicSlug: "", homeSort: "recommended" };
  }
  if (navRaw === "popular" || modeRaw === "popular") {
    return { kind: "popular", topicSlug: "", homeSort: "recommended" };
  }
  if (!navRaw && !modeRaw && sortRaw === "popular" && !categoryRaw) {
    return { kind: "popular", topicSlug: "", homeSort: "recommended" };
  }

  if (categoryRaw && !isPhilifeRecommendSortCategory(categoryRaw)) {
    return {
      kind: "topic",
      topicSlug: categoryRaw,
      homeSort: "recommended",
    };
  }

  return {
    kind: "home",
    topicSlug: "",
    homeSort: normalizeCommunityHomeSort(sortRaw),
  };
}

export function communityNavToFeedQuery(sel: CommunityNavSelection): CommunityFeedQueryPlan {
  switch (sel.kind) {
    case "local":
      return {
        feedSort: "latest",
        category: "",
        globalFeed: false,
        requiresRegion: true,
      };
    case "popular":
      return {
        feedSort: "popular",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      };
    case "topic":
      return {
        feedSort: "latest",
        category: sel.topicSlug.trim().toLowerCase(),
        globalFeed: true,
        requiresRegion: false,
      };
    case "home":
    default:
      return {
        feedSort: sel.homeSort === "latest" ? "latest" : "recommended",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      };
  }
}

/**
 * URL search: `nav` | `category` | `sort` separated by meaning.
 * Home default recommended omits sort (parse treats empty as recommended).
 */
export function buildCommunityFeedSearchParams(input: {
  selection: CommunityNavSelection;
  base?: URLSearchParams | string | null;
}): URLSearchParams {
  const sp =
    input.base instanceof URLSearchParams
      ? new URLSearchParams(input.base.toString())
      : new URLSearchParams(typeof input.base === "string" ? input.base : "");

  sp.delete("mode");
  sp.delete("nav");
  sp.delete("category");
  sp.delete("sort");

  const sel = input.selection;
  if (sel.kind === "local") {
    sp.set("nav", "local");
  } else if (sel.kind === "popular") {
    sp.set("nav", "popular");
  } else if (sel.kind === "topic") {
    const slug = sel.topicSlug.trim().toLowerCase();
    if (slug) sp.set("category", slug);
  } else if (sel.homeSort === "latest") {
    sp.set("sort", "latest");
  } else if (sel.homeSort === "recommended") {
    sp.set("sort", "recommended");
  }

  return sp;
}

export function buildCommunityFeedHref(
  pathname: string,
  input: {
    selection: CommunityNavSelection;
    base?: URLSearchParams | string | null;
  }
): string {
  const next = buildCommunityFeedSearchParams(input).toString();
  return next ? `${pathname}?${next}` : pathname;
}

/** Compose ONE-row items: Home + content topics + Local + Popular */
export function composeCommunityNavItems(
  topicChips: PhilifeFeedTopicChip[]
): CommunityNavComposeItem[] {
  const topics: CommunityNavComposeItem[] = topicChips
    .filter((c) => (c.slug ?? "").trim() !== "")
    .map((c) => ({
      kind: "topic" as const,
      slug: (c.slug ?? "").trim().toLowerCase(),
      label: (c.label ?? "").trim(),
      name_en: c.name_en ?? null,
    }));
  return [{ kind: "home" }, ...topics, { kind: "local" }, { kind: "popular" }];
}

export function communityNavSelectionKey(sel: CommunityNavSelection): string {
  if (sel.kind === "topic") return `topic:${sel.topicSlug}`;
  if (sel.kind === "home") return `home:${sel.homeSort}`;
  return sel.kind;
}

export function isSameCommunityNavSelection(
  a: CommunityNavSelection,
  b: CommunityNavSelection
): boolean {
  return communityNavSelectionKey(a) === communityNavSelectionKey(b);
}
