import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export const STORES_HOME_BASELINE_PRIMARY = "restaurant";

/** SSR·hydration — 카테고리 skeleton. DO NOT: taxonomy seed/fallback 아이콘 선렌더 */
export const STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT = {
  taxonomyReady: false,
  primaries: [] as StoreTaxonomyCategory[],
  /** taxonomy topics 전체 — selectHomePrimary 가 subs 를 원자 해석할 때 사용 */
  topics: [] as StoreTaxonomyTopic[],
  activeSlug: STORES_HOME_BASELINE_PRIMARY,
  pickedSlug: null as string | null,
  subs: [] as StoreTaxonomyTopic[],
  language: "ko" as const,
  primaryAriaLabel: "",
};

export type StoresHomeCategoryChromeSnapshot = {
  taxonomyReady: boolean;
  primaries: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  activeSlug: string;
  /** 사용자가 HOME session에서 명시적으로 선택한 1차 — null이면 2차 hidden */
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
    a.pickedSlug === b.pickedSlug &&
    a.language === b.language &&
    a.primaryAriaLabel === b.primaryAriaLabel &&
    rowsShallowEqualById(a.primaries, b.primaries) &&
    rowsShallowEqualById(a.topics, b.topics) &&
    rowsShallowEqualById(a.subs, b.subs)
  );
}

/** 1차 slug → 2차 topics — chrome store 단일 owner (React effect 지연 금지) */
export function resolveHomeSubsForPrimarySlug(
  primaries: StoreTaxonomyCategory[],
  topics: StoreTaxonomyTopic[],
  primarySlug: string
): StoreTaxonomyTopic[] {
  const slug = primarySlug.trim().toLowerCase();
  if (!slug) return [];
  const primary = primaries.find((p) => String(p.slug ?? "").trim().toLowerCase() === slug);
  const catId = String(primary?.id ?? "").trim();
  if (!catId) return [];
  return topics
    .filter((topic) => String(topic.store_category_id ?? "").trim() === catId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** HOME 2차 reveal — 단일 authority (ONE OWNER). */
export function deriveHomeSecondaryReveal(snap: StoresHomeCategoryChromeSnapshot): boolean {
  return (
    snap.taxonomyReady &&
    snap.pickedSlug !== null &&
    snap.pickedSlug === snap.activeSlug &&
    snap.subs.length > 0
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
  /** DO NOT: 동일 snapshot 이면 notify — stickyBelow 불필요 리렌더 방지 */
  if (snapshotsEqual(snapshot, next)) return;
  snapshot = next;
  notify();
}

/**
 * CONTRACT — activeSlug + pickedSlug + subs 원자 patch.
 * DO NOT: slug 만 먼저 올리고 subs 를 layoutEffect 에 위임.
 */
export function selectHomePrimary(slug: string): void {
  const next = slug.trim().toLowerCase();
  if (!next) return;
  const { activeSlug, pickedSlug } = snapshot;
  if (next === activeSlug && pickedSlug !== null) return;
  const subs = resolveHomeSubsForPrimarySlug(snapshot.primaries, snapshot.topics, next);
  patchStoresHomeCategoryChrome({
    pickedSlug: next,
    activeSlug: next,
    subs,
  });
}

/** HOME → BROWSE surface transition — session baseline */
export function resetHomeCategorySession(): void {
  if (
    snapshot.pickedSlug === null &&
    snapshot.activeSlug === STORES_HOME_BASELINE_PRIMARY
  ) {
    return;
  }
  const baselineSubs = resolveHomeSubsForPrimarySlug(
    snapshot.primaries,
    snapshot.topics,
    STORES_HOME_BASELINE_PRIMARY
  );
  patchStoresHomeCategoryChrome({
    pickedSlug: null,
    activeSlug: STORES_HOME_BASELINE_PRIMARY,
    subs: baselineSubs,
  });
  resetStoresHomePrimaryScrollToStart();
}

export function reconcileHomeCategoryPrimaries(primaries: StoreTaxonomyCategory[]): void {
  let { activeSlug, pickedSlug } = snapshot;
  let changed = false;
  if (pickedSlug && !primaries.some((p) => p.slug === pickedSlug)) {
    pickedSlug = null;
    changed = true;
  }
  if (activeSlug && !primaries.some((p) => p.slug === activeSlug)) {
    const fallback =
      primaries.find((p) => p.slug === STORES_HOME_BASELINE_PRIMARY)?.slug ??
      primaries[0]?.slug ??
      STORES_HOME_BASELINE_PRIMARY;
    activeSlug = fallback;
    changed = true;
  }
  if (!changed) return;
  const subs = resolveHomeSubsForPrimarySlug(primaries, snapshot.topics, activeSlug);
  patchStoresHomeCategoryChrome({ activeSlug, pickedSlug, primaries, subs });
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

/** @internal vitest — taxonomy 포함 전체 초기화 */
export function resetStoresHomeCategoryChromeForTests(): void {
  snapshot = { ...STORES_HOME_CATEGORY_CHROME_EMPTY_SNAPSHOT };
  notify();
}
