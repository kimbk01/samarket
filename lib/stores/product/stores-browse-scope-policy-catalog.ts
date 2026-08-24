/**
 * Product recovery — CATEGORY browse scope policy catalog + inherit/override resolve.
 * Taxonomy authority: GET /api/stores/taxonomy (DB).
 */

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
  };

  const sub = input.subSlug?.trim().toLowerCase();
  if (!sub || sub === "all") {
    return primaryResolved;
  }

  if (!input.subRow) {
    return { ...primaryResolved, scopeKey: buildBrowseSubScopeKey(input.primarySlug, sub) };
  }

  return {
    scopeKey: buildBrowseSubScopeKey(input.primarySlug, sub),
    enabled: input.subRow.enabled,
    displayTitleKo: input.subRow.displayTitleKo ?? primaryResolved.displayTitleKo,
    displayTitleEn: input.subRow.displayTitleEn ?? primaryResolved.displayTitleEn,
    adEnabled: resolveTriState(input.subRow.adEnabled, primaryResolved.adEnabled),
    couponEnabled: resolveTriState(input.subRow.couponEnabled, primaryResolved.couponEnabled),
    maxInsertion: resolveTriStateNullable(input.subRow.maxInsertion, primaryResolved.maxInsertion),
    intervalEveryN: resolveIntervalEveryN(input.subRow.intervalEveryN, primaryResolved.intervalEveryN),
    presentationMode: resolvePresentation(input.subRow.presentationMode, primaryResolved.presentationMode),
    scheduleStart: resolveTriState(input.subRow.scheduleStart, primaryResolved.scheduleStart),
    scheduleEnd: resolveTriState(input.subRow.scheduleEnd, primaryResolved.scheduleEnd),
  };
}
