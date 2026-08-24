import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";

export type StoresBrowseDiscoveryShelfPosition = "top" | "inline_after_n";

export type StoresBrowseDiscoveryShelfConfig = {
  enabled: boolean;
  scope: "sibling_topics";
  position: StoresBrowseDiscoveryShelfPosition;
  afterN: number;
  maxItems: number;
};

export const STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT: StoresBrowseDiscoveryShelfConfig = {
  enabled: false,
  scope: "sibling_topics",
  position: "top",
  afterN: 6,
  maxItems: 8,
};

export type StoresBrowseDiscoveryShelfItem = {
  topicSlug: string;
  nameKo: string;
  nameEn: string;
  href: string;
};

export type StoresBrowseDiscoveryShelfPayload = {
  enabled: true;
  position: StoresBrowseDiscoveryShelfPosition;
  afterN: number;
  items: StoresBrowseDiscoveryShelfItem[];
};

function clampAfterN(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.afterN;
  return Math.max(1, Math.min(40, Math.floor(n)));
}

function clampMaxItems(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.maxItems;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

export function parseStoresBrowseDiscoveryShelfConfig(
  raw: unknown
): StoresBrowseDiscoveryShelfConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  const position: StoresBrowseDiscoveryShelfPosition = o.position === "inline_after_n" ? "inline_after_n" : "top";
  return {
    enabled,
    scope: "sibling_topics",
    position,
    afterN: clampAfterN(Number(o.afterN)),
    maxItems: clampMaxItems(Number(o.maxItems)),
  };
}

export function discoveryShelfFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): StoresBrowseDiscoveryShelfConfig | null {
  if (!cfg || typeof cfg !== "object") return null;
  if (!("discoveryShelf" in cfg)) return null;
  return parseStoresBrowseDiscoveryShelfConfig(cfg.discoveryShelf);
}

export function resolveStoresBrowseDiscoveryShelfConfig(
  parsed: StoresBrowseDiscoveryShelfConfig | null | undefined
): StoresBrowseDiscoveryShelfConfig {
  return parsed ?? { ...STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT };
}

export function buildBrowseDiscoveryShelfItems(input: {
  primarySlug: string;
  currentSubSlug: string | null;
  topics: readonly { slug: string; name: string }[];
  maxItems: number;
}): StoresBrowseDiscoveryShelfItem[] {
  const primary = input.primarySlug.trim().toLowerCase();
  const current = input.currentSubSlug?.trim().toLowerCase() ?? null;
  const exclude = current && current !== "all" ? current : null;
  const items: StoresBrowseDiscoveryShelfItem[] = [];
  for (const topic of input.topics) {
    const slug = topic.slug.trim().toLowerCase();
    if (!slug) continue;
    if (exclude && slug === exclude) continue;
    const name = (topic.name ?? "").trim() || slug;
    items.push({
      topicSlug: slug,
      nameKo: name,
      nameEn: name,
      href: storesBrowsePath(primary, slug),
    });
    if (items.length >= input.maxItems) break;
  }
  return items;
}

export function composeBrowseDiscoveryShelfPayload(input: {
  config: StoresBrowseDiscoveryShelfConfig;
  primarySlug: string;
  currentSubSlug: string | null;
  topics: readonly { slug: string; name: string }[];
}): StoresBrowseDiscoveryShelfPayload | null {
  if (!input.config.enabled) return null;
  const items = buildBrowseDiscoveryShelfItems({
    primarySlug: input.primarySlug,
    currentSubSlug: input.currentSubSlug,
    topics: input.topics,
    maxItems: input.config.maxItems,
  });
  if (items.length === 0) return null;
  return {
    enabled: true,
    position: input.config.position,
    afterN: input.config.afterN,
    items,
  };
}

export type BrowseDiscoveryShelfRenderToken =
  | { kind: "organic"; storeId: string }
  | { kind: "discovery_shelf" };

/** Insert shelf without changing organic id order. */
export function insertDiscoveryShelfIntoOrganicIds(
  organicIds: readonly string[],
  shelf: StoresBrowseDiscoveryShelfPayload | null
): BrowseDiscoveryShelfRenderToken[] {
  const organics: BrowseDiscoveryShelfRenderToken[] = organicIds.map((storeId) => ({
    kind: "organic",
    storeId,
  }));
  if (!shelf) return organics;
  if (shelf.position === "top") {
    return [{ kind: "discovery_shelf" }, ...organics];
  }
  const n = Math.min(shelf.afterN, organics.length);
  return [...organics.slice(0, n), { kind: "discovery_shelf" }, ...organics.slice(n)];
}
