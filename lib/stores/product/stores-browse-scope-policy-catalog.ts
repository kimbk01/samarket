import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";

export const STORES_BROWSE_DEFAULT_SORT_IDS: readonly StoreBrowseServerSortId[] = [
  "default",
  "popular",
  "rating",
  "reviews",
  "fast",
  "distance",
];

export function parseBrowseDefaultSort(raw: unknown): StoreBrowseServerSortId {
  if (typeof raw === "string" && (STORES_BROWSE_DEFAULT_SORT_IDS as readonly string[]).includes(raw)) {
    return raw as StoreBrowseServerSortId;
  }
  return "default";
}

function defaultSortFromProductConfig(cfg: Record<string, unknown> | null | undefined): StoreBrowseServerSortId | null {
  if (!cfg || typeof cfg !== "object") return null;
  if (!("defaultSort" in cfg)) return null;
  return parseBrowseDefaultSort(cfg.defaultSort);
}

export type StoresBrowseScopePresentationMode = "card_benefit_integrated" | "hidden";

export type StoresBrowseTriState = true | false | "inherit";

export type StoresBrowseScopePolicyRow = {
  scopeKey: string;
  primarySlug: string;
  subSlug: string | null;
  /** Primary: category surface on/off. Sub: sub filter on/off */
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: boolean | "inherit";
  couponEnabled: boolean | "inherit";
  maxInsertion: number | null | "inherit";
  intervalEveryN: number | null | "inherit";
  presentationMode: StoresBrowseScopePresentationMode | "inherit";
  scheduleStart: string | null | "inherit";
  scheduleEnd: string | null | "inherit";
  productConfig?: Record<string, unknown> | null;
};

export type StoresBrowseScopePolicyResolved = {
  scopeKey: string;
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: boolean;
  couponEnabled: boolean;
  maxInsertion: number | null;
  intervalEveryN: number;
  presentationMode: StoresBrowseScopePresentationMode;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  defaultSort: StoreBrowseServerSortId;
};

export const STORES_BROWSE_PLATFORM_DEFAULT_POLICY: Omit<
  StoresBrowseScopePolicyResolved,
  "scopeKey"
> = {
  enabled: true,
  displayTitleKo: null,
  displayTitleEn: null,
  adEnabled: false,
  couponEnabled: false,
  maxInsertion: null,
  intervalEveryN: 8,
  presentationMode: "card_benefit_integrated",
  scheduleStart: null,
  scheduleEnd: null,
  defaultSort: "default",
};

export function buildBrowsePrimaryScopeKey(primarySlug: string): string {
  return primarySlug.trim().toLowerCase();
}

export function buildBrowseSubScopeKey(primarySlug: string, subSlug: string): string {
  return `${primarySlug.trim().toLowerCase()}/${subSlug.trim().toLowerCase()}`;
}

export function parseBrowseScopeKey(scopeKey: string): { primarySlug: string; subSlug: string | null } {
  const trimmed = scopeKey.trim().toLowerCase();
  const slash = trimmed.indexOf("/");
  if (slash <= 0) return { primarySlug: trimmed, subSlug: null };
  return {
    primarySlug: trimmed.slice(0, slash),
    subSlug: trimmed.slice(slash + 1) || null,
  };
}

function resolveTriState<T>(
  value: T | "inherit",
  inherited: T
): T {
  return value === "inherit" ? inherited : value;
}

function resolveTriStateNullable(
  value: number | null | "inherit",
  inherited: number | null
): number | null {
  return value === "inherit" ? inherited : value;
}

function resolveIntervalEveryN(value: number | null | "inherit", inherited: number): number {
  if (value === "inherit" || value == null) return inherited;
  return value;
}

function resolvePresentation(
  value: StoresBrowseScopePresentationMode | "inherit",
  inherited: StoresBrowseScopePresentationMode
): StoresBrowseScopePresentationMode {
  return value === "inherit" ? inherited : value;
}

/**
 * Secondary override authority: row exists AND at least one field is non-inherit.
 * Pure inherit stubs (legacy UPSERT) are NOT overrides — treat as no row.
 */
export function isBrowseScopeSubOverrideRow(row: StoresBrowseScopePolicyRow | null | undefined): boolean {
  if (!row || row.subSlug == null) return false;
  if (row.adEnabled !== "inherit") return true;
  if (row.couponEnabled !== "inherit") return true;
  if (row.presentationMode !== "inherit") return true;
  if (row.maxInsertion != null) return true;
  if (row.intervalEveryN != null) return true;
  if (row.displayTitleKo != null && row.displayTitleKo.trim() !== "") return true;
  if (row.displayTitleEn != null && row.displayTitleEn.trim() !== "") return true;
  if (row.scheduleStart != null) return true;
  if (row.scheduleEnd != null) return true;
  const cfg = row.productConfig;
  if (cfg && typeof cfg === "object" && Object.keys(cfg).length > 0) return true;
  return false;
}

/**
 * Resolve: sub override → primary → platform default.
 * `sub=all` uses primary scope only.
 */
export function resolveBrowseScopePolicy(input: {
  primarySlug: string;
  subSlug: string | null;
  primaryRow: StoresBrowseScopePolicyRow | null;
  subRow: StoresBrowseScopePolicyRow | null;
}): StoresBrowseScopePolicyResolved {
  const platform = STORES_BROWSE_PLATFORM_DEFAULT_POLICY;
  const primaryResolved: StoresBrowseScopePolicyResolved = {
    scopeKey: buildBrowsePrimaryScopeKey(input.primarySlug),
    enabled: input.primaryRow?.enabled ?? platform.enabled,
    displayTitleKo: input.primaryRow?.displayTitleKo ?? platform.displayTitleKo,
    displayTitleEn: input.primaryRow?.displayTitleEn ?? platform.displayTitleEn,
    adEnabled: input.primaryRow?.adEnabled === "inherit" || input.primaryRow?.adEnabled == null
      ? platform.adEnabled
      : input.primaryRow.adEnabled === true,
    couponEnabled:
      input.primaryRow?.couponEnabled === "inherit" || input.primaryRow?.couponEnabled == null
        ? platform.couponEnabled
        : input.primaryRow.couponEnabled === true,
    maxInsertion:
      input.primaryRow?.maxInsertion === "inherit" || input.primaryRow?.maxInsertion == null
        ? platform.maxInsertion
        : input.primaryRow.maxInsertion,
    intervalEveryN:
      input.primaryRow?.intervalEveryN === "inherit" || input.primaryRow?.intervalEveryN == null
        ? platform.intervalEveryN
        : (input.primaryRow.intervalEveryN as number),
    presentationMode:
      input.primaryRow?.presentationMode === "inherit" || input.primaryRow?.presentationMode == null
        ? platform.presentationMode
        : input.primaryRow.presentationMode,
    scheduleStart:
      input.primaryRow?.scheduleStart === "inherit" || input.primaryRow?.scheduleStart == null
        ? platform.scheduleStart
        : input.primaryRow.scheduleStart,
    scheduleEnd:
      input.primaryRow?.scheduleEnd === "inherit" || input.primaryRow?.scheduleEnd == null
        ? platform.scheduleEnd
        : input.primaryRow.scheduleEnd,
    defaultSort: defaultSortFromProductConfig(input.primaryRow?.productConfig ?? null) ?? platform.defaultSort,
  };

  const sub = input.subSlug?.trim().toLowerCase();
  if (!sub || sub === "all") {
    return primaryResolved;
  }

  const effectiveSub = isBrowseScopeSubOverrideRow(input.subRow) ? input.subRow : null;
  if (!effectiveSub) {
    return { ...primaryResolved, scopeKey: buildBrowseSubScopeKey(input.primarySlug, sub) };
  }

  return {
    scopeKey: buildBrowseSubScopeKey(input.primarySlug, sub),
    /** Primary OFF always wins — secondary cannot surface when parent industry is off. */
    enabled: primaryResolved.enabled && effectiveSub.enabled,
    displayTitleKo: effectiveSub.displayTitleKo ?? primaryResolved.displayTitleKo,
    displayTitleEn: effectiveSub.displayTitleEn ?? primaryResolved.displayTitleEn,
    adEnabled: resolveTriState(effectiveSub.adEnabled, primaryResolved.adEnabled),
    couponEnabled: resolveTriState(effectiveSub.couponEnabled, primaryResolved.couponEnabled),
    maxInsertion: resolveTriStateNullable(effectiveSub.maxInsertion, primaryResolved.maxInsertion),
    intervalEveryN: resolveIntervalEveryN(effectiveSub.intervalEveryN, primaryResolved.intervalEveryN),
    presentationMode: resolvePresentation(effectiveSub.presentationMode, primaryResolved.presentationMode),
    scheduleStart: resolveTriState(effectiveSub.scheduleStart, primaryResolved.scheduleStart),
    scheduleEnd: resolveTriState(effectiveSub.scheduleEnd, primaryResolved.scheduleEnd),
    defaultSort: defaultSortFromProductConfig(effectiveSub.productConfig ?? null) ?? primaryResolved.defaultSort,
  };
}
