/** BROWSE discovery shelf — store cards. Exposure target ≠ content source. */

export type StoresBrowseDiscoveryShelfPosition =
  | "inline_after_n"
  | "page_end"
  | "page_top"
  | "repeat_every_n";

export type StoresBrowseShelfSourceMode = "current_primary" | "selected" | "all";

export type StoresBrowseShelfDataType = "recommended" | "popular" | "rating" | "new_store";

export type StoresBrowseDiscoveryShelfConfig = {
  enabled: boolean;
  exposurePrimarySlugs: string[];
  sourceMode: StoresBrowseShelfSourceMode;
  sourcePrimarySlugs: string[];
  dataType: StoresBrowseShelfDataType;
  position: StoresBrowseDiscoveryShelfPosition;
  afterN: number;
  everyN: number;
  maxShelvesPerPage: number;
  maxItems: number;
};

export const STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT: StoresBrowseDiscoveryShelfConfig = {
  enabled: false,
  exposurePrimarySlugs: [],
  sourceMode: "current_primary",
  sourcePrimarySlugs: [],
  dataType: "recommended",
  position: "inline_after_n",
  afterN: 6,
  everyN: 6,
  maxShelvesPerPage: 1,
  maxItems: 6,
};

export type StoresBrowseDiscoveryShelfStoreItem = {
  storeId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  etaLabel: string | null;
  rating: number;
};

export type StoresBrowseDiscoveryShelfPayload = {
  enabled: true;
  position: StoresBrowseDiscoveryShelfPosition;
  afterN: number;
  everyN: number;
  maxShelvesPerPage: number;
  dataType: StoresBrowseShelfDataType;
  stores: StoresBrowseDiscoveryShelfStoreItem[];
};

function clampAfterN(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.afterN;
  return Math.max(1, Math.min(40, Math.floor(n)));
}

function clampEveryN(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.everyN;
  return Math.max(1, Math.min(40, Math.floor(n)));
}

function clampMaxShelves(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.maxShelvesPerPage;
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function clampMaxItems(n: number): number {
  if (!Number.isFinite(n)) return STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT.maxItems;
  return Math.max(1, Math.min(24, Math.floor(n)));
}

function parseSlugList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const slug = item.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function parsePosition(raw: unknown): StoresBrowseDiscoveryShelfPosition {
  if (raw === "page_end") return "page_end";
  if (raw === "page_top" || raw === "top") return "page_top";
  if (raw === "repeat_every_n") return "repeat_every_n";
  return "inline_after_n";
}

function parseSourceMode(raw: unknown): StoresBrowseShelfSourceMode {
  if (raw === "selected" || raw === "all") return raw;
  return "current_primary";
}

function parseDataType(raw: unknown): StoresBrowseShelfDataType {
  if (raw === "popular" || raw === "rating" || raw === "new_store") return raw;
  return "recommended";
}

export function parseStoresBrowseDiscoveryShelfConfig(
  raw: unknown
): StoresBrowseDiscoveryShelfConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    exposurePrimarySlugs: parseSlugList(o.exposurePrimarySlugs),
    sourceMode: parseSourceMode(o.sourceMode),
    sourcePrimarySlugs: parseSlugList(o.sourcePrimarySlugs),
    dataType: parseDataType(o.dataType),
    position: parsePosition(o.position),
    afterN: clampAfterN(Number(o.afterN)),
    everyN: clampEveryN(Number(o.everyN ?? o.afterN)),
    maxShelvesPerPage: clampMaxShelves(Number(o.maxShelvesPerPage)),
    maxItems: clampMaxItems(Number(o.maxItems)),
  };
}

/** Prefer `browseShelf`. Legacy `discoveryShelf` keeps enabled/afterN/maxItems only. */
export function discoveryShelfFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): StoresBrowseDiscoveryShelfConfig | null {
  if (!cfg || typeof cfg !== "object") return null;
  if ("browseShelf" in cfg) {
    return parseStoresBrowseDiscoveryShelfConfig(cfg.browseShelf);
  }
  if (!("discoveryShelf" in cfg)) return null;
  const legacy = parseStoresBrowseDiscoveryShelfConfig(cfg.discoveryShelf);
  if (!legacy) return null;
  return {
    ...STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT,
    enabled: legacy.enabled,
    afterN: legacy.afterN,
    maxItems: legacy.maxItems,
    position: legacy.position === "page_top" ? "inline_after_n" : legacy.position,
  };
}

export function resolveStoresBrowseDiscoveryShelfConfig(
  parsed: StoresBrowseDiscoveryShelfConfig | null | undefined
): StoresBrowseDiscoveryShelfConfig {
  return parsed ?? { ...STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT };
}

export function browseShelfAppliesToPage(
  config: StoresBrowseDiscoveryShelfConfig,
  pagePrimarySlug: string
): boolean {
  if (!config.enabled) return false;
  const page = pagePrimarySlug.trim().toLowerCase();
  if (!page) return false;
  if (config.exposurePrimarySlugs.length === 0) return false;
  return config.exposurePrimarySlugs.includes(page);
}

export function resolveBrowseShelfSourcePrimarySlugs(input: {
  config: StoresBrowseDiscoveryShelfConfig;
  pagePrimarySlug: string;
  allPrimarySlugs: readonly string[];
}): string[] {
  const all = input.allPrimarySlugs.map((s) => s.trim().toLowerCase()).filter(Boolean);
  const page = input.pagePrimarySlug.trim().toLowerCase();
  if (input.config.sourceMode === "all") return all;
  if (input.config.sourceMode === "current_primary") {
    return page && all.includes(page) ? [page] : page ? [page] : [];
  }
  return input.config.sourcePrimarySlugs.filter((s) => all.includes(s));
}

/** selected + [] is INVALID — never fallback to current primary. */
export function isBrowseShelfSelectedSourceValid(config: StoresBrowseDiscoveryShelfConfig): boolean {
  if (config.sourceMode !== "selected") return true;
  return config.sourcePrimarySlugs.length > 0;
}

export function composeBrowseDiscoveryShelfPayload(input: {
  config: StoresBrowseDiscoveryShelfConfig;
  pagePrimarySlug: string;
  stores: readonly StoresBrowseDiscoveryShelfStoreItem[];
}): StoresBrowseDiscoveryShelfPayload | null {
  if (!browseShelfAppliesToPage(input.config, input.pagePrimarySlug)) return null;
  if (!isBrowseShelfSelectedSourceValid(input.config)) return null;
  if (input.stores.length === 0) return null;
  return {
    enabled: true,
    position: input.config.position,
    afterN: input.config.afterN,
    everyN: input.config.everyN,
    maxShelvesPerPage: input.config.maxShelvesPerPage,
    dataType: input.config.dataType,
    stores: [...input.stores].slice(0, input.config.maxItems),
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
  if (shelf.position === "page_top") {
    return [{ kind: "discovery_shelf" }, ...organics];
  }
  if (shelf.position === "page_end") {
    return [...organics, { kind: "discovery_shelf" }];
  }
  if (shelf.position === "repeat_every_n") {
    const everyN = Math.max(1, shelf.everyN);
    const maxS = Math.max(1, shelf.maxShelvesPerPage);
    const out: BrowseDiscoveryShelfRenderToken[] = [];
    let shelves = 0;
    for (let i = 0; i < organics.length; i += 1) {
      out.push(organics[i]!);
      if ((i + 1) % everyN === 0 && shelves < maxS) {
        out.push({ kind: "discovery_shelf" });
        shelves += 1;
      }
    }
    return out;
  }
  const n = Math.min(shelf.afterN, organics.length);
  return [...organics.slice(0, n), { kind: "discovery_shelf" }, ...organics.slice(n)];
}

export function browseShelfSortForDataType(
  dataType: StoresBrowseShelfDataType
): "default" | "popular" | "rating" {
  if (dataType === "popular") return "popular";
  if (dataType === "rating") return "rating";
  return "default";
}
