/**
 * Community Navigation composition SSOT.
 *
 * CONTRACT (2026-08-10 IA):
 * - Fixed leading CTA: sort dropdown (최신순|인기순) → globalFeed all-topics (`kind: "all"` + allSort)
 * - Swipeable row: Admin topics… | Local (HorizontalDragScroll)
 * - SYSTEM NAV (not community_topics rows): all (sort) | local
 * - CONTENT TOPIC: community_topics via topic chips / category slug
 * - Default entry = all + latest
 * - DO NOT expose separate Home / All / Popular system chips
 * - DO NOT store latest/popular/local as community_topics rows
 * - Legacy `nav=home` / `nav=popular` / `sort=recommended` parse → all+latest|popular
 */

import type { PhilifeFeedTopicChip } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { isPhilifeRecommendSortCategory } from "@/lib/philife/philife-feed-chips-from-topic-options";

/** `home` / `popular` kept for legacy hub/URL absorb only — not composed as chips */
export type CommunityNavKind = "home" | "all" | "topic" | "local" | "popular";

/** ALL list sorts — maps to server feedSort */
export type CommunityAllSort = "latest" | "popular";

export type CommunityNavSelection = {
  kind: CommunityNavKind;
  /** kind=topic only */
  topicSlug: string;
  /** kind=all only */
  allSort: CommunityAllSort;
};

export type CommunityNavComposeItem =
  | { kind: "topic"; slug: string; label: string; name_en: string | null }
  | { kind: "local" };

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
  return { kind: "all", topicSlug: "", allSort: "latest" };
}

export function normalizeCommunityAllSort(raw: string | null | undefined): CommunityAllSort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "popular") return "popular";
  return "latest";
}

/**
 * Parse nav from URL.
 * - `nav=local` → local
 * - `nav=all` + sort → all+latest|popular
 * - Legacy `nav=home` / `sort=recommended` → all+latest
 * - Legacy `nav=popular` / bare `sort=popular` → all+popular
 * - `category` (real topic) → topic
 * - Default → all+latest
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

  if (categoryRaw && !isPhilifeRecommendSortCategory(categoryRaw)) {
    return {
      kind: "topic",
      topicSlug: categoryRaw,
      allSort: "latest",
    };
  }

  /** Legacy popular chip / mode → all+popular */
  if (navRaw === "popular" || modeRaw === "popular") {
    return { kind: "all", topicSlug: "", allSort: "popular" };
  }
  if (!navRaw && !modeRaw && sortRaw === "popular" && !categoryRaw) {
    return { kind: "all", topicSlug: "", allSort: "popular" };
  }

  if (navRaw === "all") {
    return {
      kind: "all",
      topicSlug: "",
      allSort: normalizeCommunityAllSort(sortRaw),
    };
  }

  /** Legacy home / recommended → all+latest */
  if (navRaw === "home" || modeRaw === "home" || sortRaw === "recommended") {
    return { kind: "all", topicSlug: "", allSort: "latest" };
  }

  if (!navRaw && !modeRaw && !categoryRaw) {
    if (sortRaw === "latest") {
      return { kind: "all", topicSlug: "", allSort: "latest" };
    }
    if (sortRaw === "popular") {
      return { kind: "all", topicSlug: "", allSort: "popular" };
    }
  }

  return { kind: "all", topicSlug: "", allSort: "latest" };
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
    case "topic":
      return {
        feedSort: "latest",
        category: sel.topicSlug.trim().toLowerCase(),
        globalFeed: true,
        requiresRegion: false,
      };
    case "popular":
      /** Legacy kind absorb */
      return {
        feedSort: "popular",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      };
    case "home":
      /** Legacy kind absorb → global latest (no recommended home surface) */
      return {
        feedSort: "latest",
        category: "",
        globalFeed: true,
        requiresRegion: false,
      };
    case "all":
    default:
      return {
        feedSort: sel.allSort === "popular" ? "popular" : "latest",
        category: "",
        globalFeed: true,
        requiresRegion: false,
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
  } else if (sel.kind === "topic") {
    const slug = sel.topicSlug.trim().toLowerCase();
    if (slug) sp.set("category", slug);
  } else if (sel.kind === "all" || sel.kind === "home" || sel.kind === "popular") {
    /** home/popular kinds serialize as all+sort */
    const allSort =
      sel.kind === "popular"
        ? "popular"
        : sel.kind === "home"
          ? "latest"
          : sel.allSort === "popular"
            ? "popular"
            : "latest";
    sp.set("nav", "all");
    sp.set("sort", allSort);
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

/** Compose ONE-row trailing/topic items: content topics + Local (Latest|Popular rendered in UI) */
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
  return [...topics, { kind: "local" }];
}

export function communityNavSelectionKey(sel: CommunityNavSelection): string {
  if (sel.kind === "topic") return `topic:${sel.topicSlug}`;
  if (sel.kind === "all") return `all:${sel.allSort}`;
  if (sel.kind === "popular") return "all:popular";
  if (sel.kind === "home") return "all:latest";
  return sel.kind;
}

export function isSameCommunityNavSelection(
  a: CommunityNavSelection,
  b: CommunityNavSelection
): boolean {
  return communityNavSelectionKey(a) === communityNavSelectionKey(b);
}
