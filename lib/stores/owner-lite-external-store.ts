/**
 * 소유 매장 요약(/api/me/stores) — BottomNav·오너 허브 등이 같이 쓸 때
 * 구독은 여러 개여도 로드는 한 갈래(runSingleFlight + fetchMeStoresListDeduped).
 */
import {
  fetchMeStoresListDeduped,
  invalidateMeStoresListDedupedCache,
  seedMeStoresListClientCacheFromStores,
} from "@/lib/me/fetch-me-stores-deduped";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  readOwnerActiveStoreIdFromSession,
  resolveOwnerActiveStoreRow,
} from "@/lib/delivery/owner/resolve-owner-active-store";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { pickPreferredOwnerStore } from "@/lib/delivery/owner/pick-preferred-owner-store";
import { KASAMA_OWNER_HUB_BADGE_REFRESH } from "@/lib/chats/chat-channel-events";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  captureCallerStack,
  nextMypageNetRequestId,
  pushMypageNetMarker,
} from "@/lib/runtime/mypage-network-markers";

export type OwnerLiteStoreState = {
  loading: boolean;
  ownerStore: StoreRow | null;
  /** 내 계정 소유 매장 전체 — 심사 중·승인 구분·허브 카드용 */
  ownerStores: StoreRow[];
};

export { pickPreferredOwnerStore } from "@/lib/delivery/owner/pick-preferred-owner-store";

const EMPTY: OwnerLiteStoreState = { loading: true, ownerStore: null, ownerStores: [] };
const OWNER_LITE_SESSION_KEY = "samarket:stores:owner-lite:snapshot:v1";
const OWNER_LITE_HYDRATE_FLIGHT = "owner-lite:hydrate" as const;

/** OWNER ACTIVE STORE AUTHORITY — OwnerLite preferred row must follow MODEL A, not newest-only. */
function pickOwnerLiteActiveStore(stores: readonly StoreRow[]): StoreRow | null {
  if (!stores.length) return null;
  const approved = stores.filter((s) => String(s.approval_status) === "approved");
  const pool = approved.length > 0 ? approved : stores;
  return (
    resolveOwnerActiveStoreRow(pool, {
      preferredStoreId: readOwnerActiveStoreIdFromSession(),
    }) ??
    pickPreferredOwnerStore([...stores]) ??
    stores[0] ??
    null
  );
}

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
      ownerStore: pickOwnerLiteActiveStore(ownerStores),
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

/** Active-store session write → realign OwnerLite preferred row (CTA / nav / FAB). */
if (typeof window !== "undefined") {
  window.addEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, () => {
    if (!snapshot.ownerStores.length) return;
    const next = pickOwnerLiteActiveStore(snapshot.ownerStores);
    if ((next?.id ?? null) === (snapshot.ownerStore?.id ?? null)) return;
    snapshot = { ...snapshot, ownerStore: next };
    emit();
  });
}

let subscriberCount = 0;
/** 첫 응답 후에는 재구독(Strict Mode)·백그라운드 갱신 시 로딩 스피너를 다시 켜지 않음 */
let hasLoadedOnce = hydratedFromSession != null;
let initialHydrateIdleId: number | null = null;
/** Pathname when idle hydrate was scheduled — compared again at execution. */
let scheduledHydratePathname: string | null = null;
let snapshotLoadedAtMs: number | null = hydratedFromSession != null ? Date.now() : null;
/** Idle auto-hydrate skips network when memory/session snapshot is still fresh. */
const OWNER_LITE_IDLE_HYDRATE_FRESH_MS = 60_000;

function isOwnerLiteSnapshotFreshForIdleHydrate(): boolean {
  if (!hasLoadedOnce) return false;
  if (snapshotLoadedAtMs == null) return false;
  return Date.now() - snapshotLoadedAtMs < OWNER_LITE_IDLE_HYDRATE_FRESH_MS;
}

function emit() {
  for (const l of listeners) l();
}

/** `/mypage` root must not trigger `GET /api/me/stores` — store admin routes own that fetch. */
function isMypageRootSurfacePathname(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]!.trim();
  return p === "/mypage" || p === "/my";
}

function currentPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0]!.trim();
}

async function loadFromNetwork(options?: {
  withLoadingSpinner?: boolean;
  subscriber?: string;
  subscribeReason?: string;
}): Promise<void> {
  const showSpinner = options?.withLoadingSpinner === true || !hasLoadedOnce;
  const viewerId = getCurrentUser()?.id?.trim() ?? null;

  if (showSpinner) {
    snapshot = { loading: true, ownerStore: snapshot.ownerStore, ownerStores: snapshot.ownerStores };
    emit();
  }

  const requestId = nextMypageNetRequestId("stores");
  pushMypageNetMarker({
    event: "owner_lite_store_network_start",
    requestId,
    viewerId,
    subscriber: options?.subscriber ?? "owner_lite_external_store",
    subscribeReason: options?.subscribeReason ?? "hydrate",
    autoHydrate: true,
    activeSubscriberCount: subscriberCount,
    hasSnapshot: hasLoadedOnce,
    snapshotAgeMs: snapshotLoadedAtMs != null ? Date.now() - snapshotLoadedAtMs : null,
    schedulePathname: scheduledHydratePathname ?? undefined,
    executionPathname: currentPathname(),
    stack: captureCallerStack(),
  });

  try {
    const { status, json: raw } = await fetchMeStoresListDeduped();
    if (status === 401 || status === 503) {
      hasLoadedOnce = true;
      snapshotLoadedAtMs = Date.now();
      snapshot = { loading: false, ownerStore: null, ownerStores: [] };
      writeOwnerLiteSessionSnapshot(snapshot);
      emit();
      pushMypageNetMarker({
        event: "owner_lite_store_network_success",
        requestId,
        viewerId,
        detail: `status=${status};empty`,
      });
      return;
    }
    const json = raw as { ok?: boolean; stores?: StoreRow[] };
    const stores = Array.isArray(json?.stores) ? json.stores : [];
    if (json?.ok && stores.length > 0) {
      seedMeStoresListClientCacheFromStores(stores);
    }
    hasLoadedOnce = true;
    snapshotLoadedAtMs = Date.now();
    snapshot = {
      loading: false,
      ownerStore: json?.ok ? pickOwnerLiteActiveStore(stores) : null,
      ownerStores: json?.ok ? stores : [],
    };
    writeOwnerLiteSessionSnapshot(snapshot);
    pushMypageNetMarker({
      event: "owner_lite_store_network_success",
      requestId,
      viewerId,
      detail: `status=${status};count=${stores.length}`,
    });
  } catch {
    hasLoadedOnce = true;
    snapshotLoadedAtMs = Date.now();
    snapshot = { loading: false, ownerStore: null, ownerStores: [] };
    writeOwnerLiteSessionSnapshot(snapshot);
  }
  emit();
}

function cancelScheduledOwnerLiteHydrate(reason: string): void {
  if (initialHydrateIdleId == null) return;
  cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
  initialHydrateIdleId = null;
  pushMypageNetMarker({
    event: "owner_lite_store_auto_hydrate_skipped",
    viewerId: getCurrentUser()?.id?.trim() ?? null,
    detail: `cancel_scheduled:${reason}`,
    schedulePathname: scheduledHydratePathname ?? undefined,
    executionPathname: currentPathname(),
    activeSubscriberCount: subscriberCount,
  });
  scheduledHydratePathname = null;
}

export function subscribeOwnerLiteStore(listener: () => void) {
  listeners.add(listener);
  subscriberCount += 1;
  const schedulePath = currentPathname();
  pushMypageNetMarker({
    event: "owner_lite_store_subscribe",
    viewerId: getCurrentUser()?.id?.trim() ?? null,
    subscriber: "subscribeOwnerLiteStore",
    subscribeReason: "first_or_additional_subscriber",
    autoHydrate: subscriberCount === 1,
    activeSubscriberCount: subscriberCount,
    hasSnapshot: hasLoadedOnce,
    snapshotAgeMs: snapshotLoadedAtMs != null ? Date.now() - snapshotLoadedAtMs : null,
    schedulePathname: schedulePath,
    stack: captureCallerStack(6),
  });
  if (subscriberCount === 1) {
    if (initialHydrateIdleId != null) {
      cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
      initialHydrateIdleId = null;
    }
    scheduledHydratePathname = schedulePath;
    initialHydrateIdleId = scheduleWhenBrowserIdle(() => {
      const executionPath = currentPathname();
      const scheduled = scheduledHydratePathname;
      initialHydrateIdleId = null;
      scheduledHydratePathname = null;
      if (isMypageRootSurfacePathname(executionPath)) {
        pushMypageNetMarker({
          event: "owner_lite_store_auto_hydrate_skipped",
          viewerId: getCurrentUser()?.id?.trim() ?? null,
          subscriber: "subscribeOwnerLiteStore",
          subscribeReason: "execution_pathname_mypage_root",
          autoHydrate: true,
          activeSubscriberCount: subscriberCount,
          hasSnapshot: hasLoadedOnce,
          schedulePathname: scheduled ?? undefined,
          executionPathname: executionPath,
        });
        /* keep session/memory snapshot — no stores network on mypage root */
        if (!hasLoadedOnce && snapshot.ownerStores.length === 0 && !snapshot.loading) {
          snapshot = { loading: false, ownerStore: null, ownerStores: [] };
          emit();
        }
        return;
      }
      if (isOwnerLiteSnapshotFreshForIdleHydrate()) {
        pushMypageNetMarker({
          event: "owner_lite_store_auto_hydrate_skipped",
          viewerId: getCurrentUser()?.id?.trim() ?? null,
          subscriber: "subscribeOwnerLiteStore",
          subscribeReason: "fresh_session_snapshot",
          autoHydrate: true,
          activeSubscriberCount: subscriberCount,
          hasSnapshot: hasLoadedOnce,
          snapshotAgeMs: snapshotLoadedAtMs != null ? Date.now() - snapshotLoadedAtMs : null,
          schedulePathname: scheduled ?? undefined,
          executionPathname: executionPath,
        });
        return;
      }
      void runSingleFlight(OWNER_LITE_HYDRATE_FLIGHT, () =>
        loadFromNetwork({
          withLoadingSpinner: !isConstrainedNetwork(),
          subscriber: "subscribeOwnerLiteStore",
          subscribeReason: "idle_auto_hydrate",
        })
      );
    }, isConstrainedNetwork() ? 2600 : 1000);
  }
  return () => {
    listeners.delete(listener);
    subscriberCount = Math.max(0, subscriberCount - 1);
    pushMypageNetMarker({
      event: "owner_lite_store_unsubscribe",
      viewerId: getCurrentUser()?.id?.trim() ?? null,
      activeSubscriberCount: subscriberCount,
      executionPathname: currentPathname(),
    });
    if (subscriberCount === 0 && initialHydrateIdleId != null) {
      cancelScheduledOwnerLiteHydrate("last_subscriber_unsubscribed");
    }
  };
}

/** Cancel pending idle hydrate when leaving any surface — used by mypage route entry. */
export function cancelPendingOwnerLiteAutoHydrate(reason = "route_change"): void {
  cancelScheduledOwnerLiteHydrate(reason);
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
  void runSingleFlight(OWNER_LITE_HYDRATE_FLIGHT, () =>
    loadFromNetwork({
      withLoadingSpinner: true,
      subscriber: "refreshOwnerLiteStore",
      subscribeReason: "explicit_refresh",
    })
  );
}

/** FAB·헤더 등 — 승인 매장이 아직 없을 때만 무음 선로드 */
export function prefetchOwnerLiteStoreQuiet(): void {
  const approved = snapshot.ownerStores.filter((s) => String(s.approval_status) === "approved");
  if (
    resolveOwnerActiveStoreRow(approved, {
      preferredStoreId: readOwnerActiveStoreIdFromSession() ?? snapshot.ownerStore?.id ?? null,
    })
  ) {
    return;
  }
  if (isMypageRootSurfacePathname(currentPathname())) {
    pushMypageNetMarker({
      event: "owner_lite_store_auto_hydrate_skipped",
      viewerId: getCurrentUser()?.id?.trim() ?? null,
      subscriber: "prefetchOwnerLiteStoreQuiet",
      subscribeReason: "mypage_root_block",
      autoHydrate: false,
      executionPathname: currentPathname(),
    });
    return;
  }
  invalidateMeStoresListDedupedCache();
  void runSingleFlight(OWNER_LITE_HYDRATE_FLIGHT, () =>
    loadFromNetwork({
      withLoadingSpinner: false,
      subscriber: "prefetchOwnerLiteStoreQuiet",
      subscribeReason: "quiet_prefetch",
    })
  );
}
