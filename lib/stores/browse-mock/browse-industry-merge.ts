import { BROWSE_PRIMARY_INDUSTRIES, BROWSE_SUB_INDUSTRIES } from "./mock-store-categories";
import type { BrowsePrimaryIndustry, BrowseSubIndustry } from "./types";

const STORAGE_KEY = "kasama-browse-industry-overrides-v1";

export type BrowseIndustryOverridesPayload = {
  addedPrimaries: BrowsePrimaryIndustry[];
  addedSubs: BrowseSubIndustry[];
};

const EMPTY: BrowseIndustryOverridesPayload = { addedPrimaries: [], addedSubs: [] };

function parsePayload(raw: string | null): BrowseIndustryOverridesPayload {
  if (!raw) return { ...EMPTY, addedPrimaries: [], addedSubs: [] };
  try {
    const p = JSON.parse(raw) as BrowseIndustryOverridesPayload;
    return {
      addedPrimaries: Array.isArray(p.addedPrimaries) ? p.addedPrimaries : [],
      addedSubs: Array.isArray(p.addedSubs) ? p.addedSubs : [],
    };
  } catch {
    return { ...EMPTY, addedPrimaries: [], addedSubs: [] };
  }
}

export function getBrowseIndustryOverrides(): BrowseIndustryOverridesPayload {
  if (typeof window === "undefined") return { addedPrimaries: [], addedSubs: [] };
  return parsePayload(localStorage.getItem(STORAGE_KEY));
}

export function persistBrowseIndustryOverrides(payload: BrowseIndustryOverridesPayload): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  notifyBrowseIndustryListeners();
}

let listenerVersion = 0;
const listeners = new Set<() => void>();

export function subscribeBrowseIndustryListeners(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getBrowseIndustryListenerVersion(): number {
  return listenerVersion;
}

function notifyBrowseIndustryListeners(): void {
  listenerVersion += 1;
  listeners.forEach((l) => l());
}

export function clearBrowseIndustryOverrides(): void {
  persistBrowseIndustryOverrides({ addedPrimaries: [], addedSubs: [] });
}

const seedPrimaryIds = new Set(BROWSE_PRIMARY_INDUSTRIES.map((p) => p.id));
const seedSubIds = new Set(BROWSE_SUB_INDUSTRIES.map((s) => s.id));

export function isSeedPrimaryIndustry(id: string): boolean {
  return seedPrimaryIds.has(id);
}

export function isSeedSubIndustry(id: string): boolean {
  return seedSubIds.has(id);
}

export function listMergedBrowsePrimaryIndustries(): BrowsePrimaryIndustry[] {
  const { addedPrimaries } = getBrowseIndustryOverrides();
  return [...BROWSE_PRIMARY_INDUSTRIES, ...addedPrimaries].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function listMergedBrowseSubIndustries(primarySlug: string): BrowseSubIndustry[] {
  const slug = primarySlug.trim();
  const { addedSubs } = getBrowseIndustryOverrides();
  const base = BROWSE_SUB_INDUSTRIES.filter((s) => s.primarySlug === slug);
  const extra = addedSubs.filter((s) => s.primarySlug === slug);
  return [...base, ...extra].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getMergedBrowsePrimaryBySlug(slug: string): BrowsePrimaryIndustry | undefined {
  return listMergedBrowsePrimaryIndustries().find((p) => p.slug === slug.trim());
}

export function getMergedBrowseSubIndustry(
  primarySlug: string,
  subSlug: string
): BrowseSubIndustry | undefined {
  return listMergedBrowseSubIndustries(primarySlug).find((s) => s.slug === subSlug.trim());
}
