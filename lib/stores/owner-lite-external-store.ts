/**
 * 소유 매장 요약(/api/me/stores) — BottomNav·OwnerLiteStoreBar 등이 같이 쓸 때
 * 구독은 여러 개여도 로드는 한 갈래(runSingleFlight + fetchMeStoresListDeduped).
 */
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
} from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export type OwnerLiteStoreState = {
  loading: boolean;
  ownerStore: StoreRow | null;
  /** 내 계정 소유 매장 전체 — 심사 중·승인 구분·허브 카드용 */
  ownerStores: StoreRow[];
};

const EMPTY: OwnerLiteStoreState = { loading: true, ownerStore: null, ownerStores: [] };

let snapshot: OwnerLiteStoreState = EMPTY;
const listeners = new Set<() => void>();

let subscriberCount = 0;
/** 첫 응답 후에는 재구독(Strict Mode)·백그라운드 갱신 시 로딩 스피너를 다시 켜지 않음 */
let hasLoadedOnce = false;

function emit() {
  for (const l of listeners) l();
}

function pickPreferredOwnerStore(stores: StoreRow[]): StoreRow | null {
  if (stores.length === 0) return null;
  return stores.find((store) => String(store.approval_status) === "approved") ?? stores[0] ?? null;
}

async function loadFromNetwork(options?: { withLoadingSpinner?: boolean }): Promise<void> {
  const showSpinner = options?.withLoadingSpinner === true || !hasLoadedOnce;

  if (showSpinner) {
    snapshot = { loading: true, ownerStore: snapshot.ownerStore, ownerStores: snapshot.ownerStores };
    emit();
  }

  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    if (status === 401 || status === 503) {
      hasLoadedOnce = true;
      snapshot = { loading: false, ownerStore: null, ownerStores: [] };
      emit();
      return;
    }
    const json = raw as { ok?: boolean; stores?: StoreRow[] };
    const stores = Array.isArray(json?.stores) ? json.stores : [];
    hasLoadedOnce = true;
    snapshot = {
      loading: false,
      ownerStore: json?.ok ? pickPreferredOwnerStore(stores) : null,
      ownerStores: json?.ok ? stores : [],
    };
  } catch {
    hasLoadedOnce = true;
    snapshot = { loading: false, ownerStore: null, ownerStores: [] };
  }
  emit();
}

export function subscribeOwnerLiteStore(listener: () => void) {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    void runSingleFlight("owner-lite:hydrate", () => loadFromNetwork());
  }
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
  };
}

export function getOwnerLiteStoreSnapshot(): OwnerLiteStoreState {
  return snapshot;
}

export function getOwnerLiteStoreServerSnapshot(): OwnerLiteStoreState {
  return EMPTY;
}

/** 매장 신청·수정 직후 등 — 스피너와 함께 서버에서 다시 가져옴 */
export function refreshOwnerLiteStore(): void {
  invalidateMeStoresListDedupedCache();
  void runSingleFlight("owner-lite:hydrate", () => loadFromNetwork({ withLoadingSpinner: true }));
}
