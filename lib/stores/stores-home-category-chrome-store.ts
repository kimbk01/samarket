import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

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

const EMPTY_SNAPSHOT: StoresHomeCategoryChromeSnapshot = {
  taxonomyReady: false,
  subCategoryInView: true,
  primaries: [],
  activeSlug: "restaurant",
  pickedSlug: null,
  subs: [],
  language: "ko",
  primaryAriaLabel: "",
};

let snapshot: StoresHomeCategoryChromeSnapshot = EMPTY_SNAPSHOT;
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
  return EMPTY_SNAPSHOT;
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
  snapshot = { ...EMPTY_SNAPSHOT, language: snapshot.language };
  notify();
}
