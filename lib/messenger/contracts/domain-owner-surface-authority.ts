/**
 * STEP 7 — Store Order Owner Surface Authority (exposure CONNECTED).
 *
 * Owner product path may resolve Owner Surface when exposure is ON.
 * Owner is NOT added to customer canary allowlist, Cache Authority seed, or Home inbox.
 * Customer ↔ Owner cross-import remains forbidden at product surfaces.
 */
import {
  PHASE11D_A_OWNER_SURFACE_EXPOSURE,
  PHASE11D_A_OWNER_SURFACE_PREPARED,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import {
  clearPhase11aIsolatedBootstrapSources,
  getPhase11aIsolatedStoreOrderSource,
  registerPhase11aIsolatedBootstrapSource,
} from "@/lib/messenger/contracts/phase11a-isolated-source-registry";
import type { StoreOrderBootstrapSource } from "@/lib/messenger/store-order/phase6-bootstrap";
import {
  assertStoreOrderOwnerDisplayIdentity,
  toStoreOrderOwnerSurface,
  type StoreOrderOwnerSurface,
} from "@/lib/messenger/store-order/owner-surface";
import {
  createStoreOrderOwnerInMemoryLoaderSource,
  mapStoreOrderOwnerLoaderBatchRows,
  type StoreOrderOwnerLoaderBatchRow,
} from "@/lib/messenger/store-order/phase11a-db-loader-owner";

export { PHASE11D_A_OWNER_SURFACE_PREPARED, PHASE11D_A_OWNER_SURFACE_EXPOSURE };

export function isStoreOrderOwnerSurfaceExposed(): boolean {
  return Boolean(PHASE11D_A_OWNER_SURFACE_EXPOSURE);
}

export function assertStoreOrderOwnerSurfaceExposureConnected(): void {
  if (!PHASE11D_A_OWNER_SURFACE_EXPOSURE) {
    throw new Error("dibay_store_order_owner_surface_exposure_must_remain_connected");
  }
}

/**
 * Product path — exposure ON → readiness ok (caller loads owner rows via owner loader).
 * Does not inject owner rows into customer Home / canary inbox.
 */
export function resolveStoreOrderOwnerSurfaceForProduct(input: {
  viewerUserId: string;
}):
  | { status: "ok"; exposure: true; viewerUserId: string; homeInbox: "excluded" }
  | { status: "skipped"; reason: "owner_exposure_off" | "viewer_required" } {
  if (!PHASE11D_A_OWNER_SURFACE_EXPOSURE) {
    return { status: "skipped", reason: "owner_exposure_off" };
  }
  const viewer = input.viewerUserId.trim();
  if (!viewer) {
    return { status: "skipped", reason: "viewer_required" };
  }
  assertStoreOrderOwnerSurfaceExposureConnected();
  return {
    status: "ok",
    exposure: true,
    viewerUserId: viewer,
    homeInbox: "excluded",
  };
}

/** Isolated harness — register owner bootstrap source (not customer Home). */
export function registerStoreOrderOwnerIsolatedHarnessSource(
  source: StoreOrderBootstrapSource
): void {
  registerPhase11aIsolatedBootstrapSource("store_order_owner", source);
}

export function clearStoreOrderOwnerIsolatedHarnessSources(): void {
  clearPhase11aIsolatedBootstrapSources();
}

export function getStoreOrderOwnerIsolatedHarnessSource(): StoreOrderBootstrapSource | null {
  return getPhase11aIsolatedStoreOrderSource("owner");
}

export function buildStoreOrderOwnerSurfaceForHarness(input: {
  roomId: string;
  domainIdentityKey: string;
  customerName: string;
  customerAvatarUrl: string | null;
  customerUserId?: string | null;
  storeId?: string | null;
}): StoreOrderOwnerSurface {
  const identity = assertStoreOrderOwnerDisplayIdentity({
    room: {
      roomId: input.roomId,
      chatDomain: "store_order",
      domainIdentityKey: input.domainIdentityKey,
    },
    customerName: input.customerName,
    customerAvatarUrl: input.customerAvatarUrl,
    customerUserId: input.customerUserId,
    storeId: input.storeId,
  });
  return toStoreOrderOwnerSurface(identity, {
    customerUserId: input.customerUserId,
    storeId: input.storeId,
  });
}

export function loadStoreOrderOwnerRowsForHarness(input: {
  viewerUserId: string;
  rows: ReadonlyArray<StoreOrderOwnerLoaderBatchRow>;
}) {
  return mapStoreOrderOwnerLoaderBatchRows({
    viewerUserId: input.viewerUserId,
    rows: input.rows,
    failClosedOnUnauthorized: true,
  });
}

export function createStoreOrderOwnerHarnessSource(
  seed: ReadonlyArray<StoreOrderOwnerLoaderBatchRow>
): StoreOrderBootstrapSource {
  return createStoreOrderOwnerInMemoryLoaderSource(seed);
}

export function listStoreOrderOwnerSurfaceReadiness(): Readonly<{
  prepared: boolean;
  exposure: boolean;
  inCanaryAllowlist: false;
  inCacheAuthoritySeed: false;
  inHomeWiring: false;
  customerOwnerCrossImport: "forbidden";
}> {
  return {
    prepared: PHASE11D_A_OWNER_SURFACE_PREPARED,
    exposure: Boolean(PHASE11D_A_OWNER_SURFACE_EXPOSURE),
    inCanaryAllowlist: false,
    inCacheAuthoritySeed: false,
    inHomeWiring: false,
    customerOwnerCrossImport: "forbidden",
  };
}
