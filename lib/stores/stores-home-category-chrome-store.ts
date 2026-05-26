import { getStoresHomeTaxonomySeedState } from "@/lib/stores/stores-home-taxonomy-seed";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

const RESTAURANT_SLUG = "restaurant";

function sortPrimariesRestaurantFirst<T extends { slug: string; sort_order?: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const ri = sorted.findIndex((p) => p.slug === RESTAURANT_SLUG);
  if (ri > 0) {
    const [r] = sorted.splice(ri, 1);
    sorted.unshift(r);
  }
  return sorted;
}

function buildStoresHomeCategoryChromeSeedSnapshot(): StoresHomeCategoryChromeSnapshot {
  const taxonomy = getStoresHomeTaxonomySeedState();
  const primaries = sortPrimariesRestaurantFirst(taxonomy.categories);
  const restaurant = primaries.find((p) => p.slug === RESTAURANT_SLUG) ?? primaries[0];
  const catId = String(restaurant?.id ?? "").trim();
  const subs = taxonomy.topics
    .filter((topic) => topic.store_category_id === catId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    taxonomyReady: true,
    subCategoryInView: true,
    primaries,
    activeSlug: restaurant?.slug ?? RESTAURANT_SLUG,
    pickedSlug: null,
    subs,
    language: "ko",
    primaryAriaLabel: "",
  };
}

export type StoresHomeCategoryChromeSnapshot = {
  taxonomyReady: boolean;
  /** 2차 업종 패널이 뷰포트에 보이면 true — 숨김 시 1차 탭은 browse 이동 */
  subCategoryInView: boolean;
  primaries: StoreTaxonomyCategory[];
  activeSlug: string;
  pickedSlug: string | null;
  subs: StoreTaxonomyTopic[];
  language: "ko" | "en";
  primaryAriaLabel: string;
};

export type StoresHomeCategoryChromeHandlers = {
  onSelectPrimary: (slug: string) => void;
  onPrewarmPrimary: (slug: string) => void;
  onPrewarmSub: (subSlug?: string | null) => void;
};

const SEED_CHROME_SNAPSHOT = buildStoresHomeCategoryChromeSeedSnapshot();

let snapshot: StoresHomeCategoryChromeSnapshot = SEED_CHROME_SNAPSHOT;
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
    a.subCategoryInView === b.subCategoryInView &&
    a.activeSlug === b.activeSlug &&
    a.pickedSlug === b.pickedSlug &&
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
  return SEED_CHROME_SNAPSHOT;
}

export function patchStoresHomeCategoryChrome(
  patch: Partial<StoresHomeCategoryChromeSnapshot>
): void {
  const next: StoresHomeCategoryChromeSnapshot = { ...snapshot, ...patch };
  /** DO NOT: 동일 snapshot 이면 notify — stickyBelow 불필요 리렌더 방지 */
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

/** `/stores` 이탈 시 chrome 상태 초기화 — stickyBelow 참조는 유지 */
export function resetStoresHomeCategoryChromeSnapshot(): void {
  snapshot = { ...SEED_CHROME_SNAPSHOT, language: snapshot.language };
  notify();
}
