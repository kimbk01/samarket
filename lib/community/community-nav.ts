/**
 * Community 2단 Navigation composition SSOT.
 *
 * CONTRACT:
 * - User sees ONE row: Home | All | Admin topics… | Local | Popular
 * - SYSTEM NAV (not community_topics rows): home | all | local | popular
 * - CONTENT TOPIC: community_topics via topic chips / category slug
 * - HOME → region-aware recommended (NOT global all-topics)
 * - ALL → globalFeed all topics + latest|popular dropdown
 * - DO NOT store home/all/local/popular as community_topics rows
 */

import type { PhilifeFeedTopicChip } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";

export type CommunityNavKind = "home" | "all" | "topic" | "local" | "popular";

/** ALL-only user sorts — maps to server feedSort */
export type CommunityAllSort = "latest" | "popular";

export type CommunityNavSelection = {
  kind: CommunityNavKind;
  /** kind=topic only */
  topicSlug: string;
  /** kind=all only */
  allSort: CommunityAllSort;
};

export type CommunityNavComposeItem =
  | { kind: "home" }
  | { kind: "all" }
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
  return { kind: "home", topicSlug: "", allSort: "latest" };
}

export function normalizeCommunityAllSort(raw: string | null | undefined): CommunityAllSort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "popular") return "popular";
  return "latest";
}

/**
 * Parse nav from URL.
 * - `nav=local|popular|all|home` wins over category/sort for those kinds
 * - `category` (real topic) → topic
 * - Legacy `sort=popular` without nav → popular
 * - Legacy `sort=latest` without nav/category → all+latest (was wrongly on home)
 * - Legacy `sort=recommended` without nav → home
 * - Default → home
 */
export function parseCommunityNavFromSearchParams(
  searchParams: URLSearchParams | { get(name: string): string | null }
): CommunityNavSelection {
  const navRaw = (searchParams.get("nav") ?? "").trim().toLowerCase();
  const modeRaw = (searchParams.get("mode") ?? "").trim().toLowerCase();
  const sortRaw = (searchParams.get("sort") ?? "").trim().toLowerCase();
  const categoryRaw = (searchParams.get("category") ?? "").trim().toLowerCase();

  if (navRaw === "local" || modeRaw === "local") {
    return { kind: "local", topicSlug: "", allSort: "latest" };
  }
  if (navRaw === "popular" || modeRaw === "popular") {
    return { kind: "popular", topicSlug: "", allSort: "latest" };
  }
  if (!navRaw && !modeRaw && sortRaw === "popular" && !categoryRaw) {
    return { kind: "popular", topicSlug: "", allSort: "latest" };
  }
  if (navRaw === "all") {
    return {
      kind: "all",
      topicSlug: "",
      allSort: normalizeCommunityAllSort(sortRaw),
    };
  }
  if (navRaw === "home") {
    return { kind: "home", topicSlug: "", allSort: "latest" };
  }

  if (categoryRaw && !isPhilifeRecommendSortCategory(categoryRaw)) {
    return {
      kind: "topic",
      topicSlug: categoryRaw,
      allSort: "latest",
    };
  }

  if (!navRaw && !modeRaw && !categoryRaw) {
    if (sortRaw === "latest") {
      return { kind: "all", topicSlug: "", allSort: "latest" };
    }
    if (sortRaw === "popular") {
      return { kind: "all", topicSlug: "", allSort: "popular" };
    }
  }

  return { kind: "home", topicSlug: "", allSort: "latest" };
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
    case "all":
      return {
        feedSort: sel.allSort === "popular" ? "popular" : "latest",
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
        feedSort: "recommended",
        category: "",
        globalFeed: false,
        requiresRegion: true,
      };
  }
}

/**
 * URL search: `nav` | `category` | `sort` separated by meaning.
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
  } else if (sel.kind === "all") {
    sp.set("nav", "all");
    if (sel.allSort === "popular") {
      sp.set("sort", "popular");
    } else {
      sp.set("sort", "latest");
    }
  } else if (sel.kind === "home") {
    sp.set("nav", "home");
  } else if (sel.kind === "topic") {
    const slug = sel.topicSlug.trim().toLowerCase();
    if (slug) sp.set("category", slug);
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

/** Compose ONE-row items: Home + All + content topics + Local + Popular */
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
  return [{ kind: "home" }, { kind: "all" }, ...topics, { kind: "local" }, { kind: "popular" }];
}

export function communityNavSelectionKey(sel: CommunityNavSelection): string {
  if (sel.kind === "topic") return `topic:${sel.topicSlug}`;
  if (sel.kind === "all") return `all:${sel.allSort}`;
  if (sel.kind === "home") return "home";
  return sel.kind;
}

export function isSameCommunityNavSelection(
  a: CommunityNavSelection,
  b: CommunityNavSelection
): boolean {
  return communityNavSelectionKey(a) === communityNavSelectionKey(b);
}
