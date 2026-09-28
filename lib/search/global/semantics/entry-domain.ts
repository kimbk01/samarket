export const GLOBAL_SEARCH_ENTRY_DOMAIN_STORAGE_KEY = "dibay_global_search_entry_domain_v1";

export const GLOBAL_SEARCH_ENTRY_DOMAINS = ["community", "trade", "delivery", "chat"] as const;

export type GlobalSearchEntryDomain = (typeof GLOBAL_SEARCH_ENTRY_DOMAINS)[number];

const CANONICAL_DOMAIN_ORDER: readonly GlobalSearchEntryDomain[] = [
  "community",
  "trade",
  "delivery",
  "chat",
];

export function isGlobalSearchEntryDomain(value: unknown): value is GlobalSearchEntryDomain {
  return (
    value === "community" || value === "trade" || value === "delivery" || value === "chat"
  );
}

export function parseGlobalSearchEntryDomain(value: unknown): GlobalSearchEntryDomain | null {
  return isGlobalSearchEntryDomain(value) ? value : null;
}

export function readGlobalSearchEntryDomain(): GlobalSearchEntryDomain | null {
  if (typeof window === "undefined") return null;
  try {
    return parseGlobalSearchEntryDomain(sessionStorage.getItem(GLOBAL_SEARCH_ENTRY_DOMAIN_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeGlobalSearchEntryDomain(domain: GlobalSearchEntryDomain): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(GLOBAL_SEARCH_ENTRY_DOMAIN_STORAGE_KEY, domain);
  } catch {
    /* ignore */
  }
}

export function clearGlobalSearchEntryDomain(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(GLOBAL_SEARCH_ENTRY_DOMAIN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Entry domain first, then canonical remainder. Priority is not a filter. */
export function orderGlobalSearchDomains(
  entry: GlobalSearchEntryDomain | null
): GlobalSearchEntryDomain[] {
  if (!entry) return [...CANONICAL_DOMAIN_ORDER];
  return [entry, ...CANONICAL_DOMAIN_ORDER.filter((d) => d !== entry)];
}
