import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

const RESTAURANT_SLUG = "restaurant";

/** SSR·hydration — category skeleton. DO NOT: taxonomy seed/fallback 아이콘 선렌더 */
export const STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT = {
  taxonomyReady: false,
  primaries: [] as StoreTaxonomyCategory[],
  /** Active primary for TIER2 secondary rail labels (default restaurant). Navigation does not read this. */
  activeSlug: RESTAURANT_SLUG,
  subs: [] as StoreTaxonomyTopic[],
  language: "ko" as const,
  primaryAriaLabel: "",
};

export type StoresHomeCategoryChromeSnapshot = {
  taxonomyReady: boolean;
  primaries: StoreTaxonomyCategory[];
  activeSlug: string;
  subs: StoreTaxonomyTopic[];
  language: "ko" | "en";
  primaryAriaLabel: string;
};

export type StoresHomeCategoryChromeHandlers = {
  onSelectPrimary: (slug: string) => void;
  onPrewarmPrimary: (slug: string) => void;
  onPrewarmSub: (subSlug?: string | null) => void;
};

let snapshot: StoresHomeCategoryChromeSnapshot = { ...STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT };
let handlers: StoresHomeCategoryChromeHandlers = {
  onSelectPrimary: () => {},
  onPrewarmPrimary: () => {},
  onPrewarmSub: () => {},
};
const listeners = new Set<() => void>();
let primaryScrollEl: HTMLDivElement | null = null;

function notify(): void {
  listeners.forEach((listener) => listener());
}

function rowsShallowEqualById<T extends { id: string | number }>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id) return false;
  }
  return true;
}

function snapshotsEqual(a: StoresHomeCategoryChromeSnapshot, b: StoresHomeCategoryChromeSnapshot): boolean {
  return (
    a.taxonomyReady === b.taxonomyReady &&
    a.activeSlug === b.activeSlug &&
    a.language === b.language &&
    a.primaryAriaLabel === b.primaryAriaLabel &&
    rowsShallowEqualById(a.primaries, b.primaries) &&
    rowsShallowEqualById(a.subs, b.subs)
  );
}

export function subscribeStoresHomeCategoryChrome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoresHomeCategoryChromeSnapshot(): StoresHomeCategoryChromeSnapshot {
  return snapshot;
}

export function getStoresHomeCategoryChromeServerSnapshot(): StoresHomeCategoryChromeSnapshot {
  return STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT;
}

export function patchStoresHomeCategoryChrome(
  patch: Partial<StoresHomeCategoryChromeSnapshot>
): void {
  const next: StoresHomeCategoryChromeSnapshot = { ...snapshot, ...patch };
  if (snapshotsEqual(snapshot, next)) return;
  snapshot = next;
  notify();
}

export function setStoresHomeCategoryChromeHandlers(next: StoresHomeCategoryChromeHandlers): void {
  handlers = next;
}

export function getStoresHomeCategoryChromeHandlers(): StoresHomeCategoryChromeHandlers {
  return handlers;
}

export function registerStoresHomePrimaryScrollEl(el: HTMLDivElement | null): void {
  primaryScrollEl = el;
}

export function resetStoresHomePrimaryScrollToStart(): void {
  primaryScrollEl?.scrollTo({ left: 0, behavior: "auto" });
}

/** `/stores` 이탈 시 chrome 상태 초기화 */
export function resetStoresHomeCategoryChromeSnapshot(): void {
  snapshot = { ...STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT, language: snapshot.language };
  notify();
}
