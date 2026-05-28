/**
 * 소유 매장 요약(/api/me/stores) — BottomNav·OwnerLiteStoreBar 등이 같이 쓸 때
 * 구독은 여러 개여도 로드는 한 갈래(runSingleFlight + fetchMeStoresListDeduped).
 */
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
  seedMeStoresListClientCacheFromStores,
} from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { computeOwnerCanSell } from "@/lib/stores/owner-lite-store-shortcuts";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { pickApprovedOwnerStoreForFab } from "@/lib/main-menu/main-bottom-nav-fab-store-admin";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";

export type OwnerLiteStoreState = {
  loading: boolean;
  ownerStore: StoreRow | null;
  /** 내 계정 소유 매장 전체 — 심사 중·승인 구분·허브 카드용 */
  ownerStores: StoreRow[];
};

const EMPTY: OwnerLiteStoreState = { loading: true, ownerStore: null, ownerStores: [] };
const OWNER_LITE_SESSION_KEY = "samarket:stores:owner-lite:snapshot:v1";

function readOwnerLiteSessionSnapshot(): OwnerLiteStoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(OWNER_LITE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ownerStores?: StoreRow[] };
    if (!Array.isArray(parsed.ownerStores)) return null;
    const ownerStores = parsed.ownerStores;
    return {
      loading: false,
      ownerStores,
      ownerStore: pickPreferredOwnerStore(ownerStores),
    };
  } catch {
    return null;
  }
}

function writeOwnerLiteSessionSnapshot(next: OwnerLiteStoreState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      OWNER_LITE_SESSION_KEY,
      JSON.stringify({
        ownerStores: next.ownerStores,
      })
    );
  } catch {
    /* ignore storage failures */
  }
}

const hydratedFromSession = readOwnerLiteSessionSnapshot();
let snapshot: OwnerLiteStoreState = hydratedFromSession ?? EMPTY;
const listeners = new Set<() => void>();

let subscriberCount = 0;
/** 첫 응답 후에는 재구독(Strict Mode)·백그라운드 갱신 시 로딩 스피너를 다시 켜지 않음 */
let hasLoadedOnce = hydratedFromSession != null;
let initialHydrateIdleId: number | null = null;

function emit() {
  for (const l of listeners) l();
}

export function pickPreferredOwnerStore(stores: StoreRow[]): StoreRow | null {
  if (stores.length === 0) return null;
  return (
    stores.find(
      (store) =>
        String(store.approval_status) === "approved" &&
        store.is_visible === true &&
        computeOwnerCanSell(store.sales_permission)
    ) ??
    stores.find((store) => String(store.approval_status) === "approved") ??
    stores[0] ??
    null
  );
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
      writeOwnerLiteSessionSnapshot(snapshot);
      emit();
      return;
    }
    const json = raw as { ok?: boolean; stores?: StoreRow[] };
    const stores = Array.isArray(json?.stores) ? json.stores : [];
    if (json?.ok && stores.length > 0) {
      seedMeStoresListClientCacheFromStores(stores);
    }
    hasLoadedOnce = true;
    snapshot = {
      loading: false,
      ownerStore: json?.ok ? pickPreferredOwnerStore(stores) : null,
      ownerStores: json?.ok ? stores : [],
    };
    writeOwnerLiteSessionSnapshot(snapshot);
  } catch {
    hasLoadedOnce = true;
    snapshot = { loading: false, ownerStore: null, ownerStores: [] };
    writeOwnerLiteSessionSnapshot(snapshot);
  }
  emit();
}

export function subscribeOwnerLiteStore(listener: () => void) {
  listeners.add(listener);
  subscriberCount += 1;
  if (subscriberCount === 1) {
    if (initialHydrateIdleId != null) {
      cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
      initialHydrateIdleId = null;
    }
    initialHydrateIdleId = scheduleWhenBrowserIdle(() => {
      initialHydrateIdleId = null;
      void runSingleFlight("owner-lite:hydrate", () =>
        loadFromNetwork({ withLoadingSpinner: !isConstrainedNetwork() })
      );
    }, isConstrainedNetwork() ? 2600 : 1000);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    if (subscriberCount === 0 && initialHydrateIdleId != null) {
      cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
      initialHydrateIdleId = null;
    }
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

/** FAB·헤더 등 — 승인 매장이 아직 없을 때만 무음 선로드 */
export function prefetchOwnerLiteStoreQuiet(): void {
  if (pickApprovedOwnerStoreForFab(snapshot.ownerStores)) return;
  invalidateMeStoresListDedupedCache();
  void runSingleFlight("owner-lite:hydrate", () => loadFromNetwork({ withLoadingSpinner: false }));
}
