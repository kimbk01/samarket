/**
 * STEP 7 — Store Order Owner Surface tests (exposure CONNECTED).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  assertStoreOrderOwnerSurfaceExposureConnected,
  buildStoreOrderOwnerSurfaceForHarness,
  clearStoreOrderOwnerIsolatedHarnessSources,
  createStoreOrderOwnerHarnessSource,
  getStoreOrderOwnerIsolatedHarnessSource,
  isStoreOrderOwnerSurfaceExposed,
  listStoreOrderOwnerSurfaceReadiness,
  loadStoreOrderOwnerRowsForHarness,
  registerStoreOrderOwnerIsolatedHarnessSource,
  resolveStoreOrderOwnerSurfaceForProduct,
} from "@/lib/messenger/contracts/domain-owner-surface-authority";
import {
  PHASE11D_A_CANARY_ALLOWLIST_USER_IDS,
  PHASE11D_A_OWNER_SURFACE_EXPOSURE,
  PHASE11D_A_OWNER_SURFACE_PREPARED,
} from "@/lib/messenger/contracts/phase11da-canary-gate";
import { buildStoreOrderIdentityKey } from "@/lib/messenger/store-order/design-lock";

const OWNER = PHASE11D_A_CANARY_ALLOWLIST_USER_IDS[0];
const CUSTOMER = "00000000-0000-4000-8000-000000000002";

afterEach(() => {
  clearStoreOrderOwnerIsolatedHarnessSources();
});

describe("STEP7 Store Order Owner Surface", () => {
  it("prepared with exposure CONNECTED; still excluded from canary/cache/home", () => {
    expect(PHASE11D_A_OWNER_SURFACE_PREPARED).toBe(true);
    expect(PHASE11D_A_OWNER_SURFACE_EXPOSURE).toBe(true);
    expect(isStoreOrderOwnerSurfaceExposed()).toBe(true);
    expect(() => assertStoreOrderOwnerSurfaceExposureConnected()).not.toThrow();
    expect(listStoreOrderOwnerSurfaceReadiness()).toEqual({
      prepared: true,
      exposure: true,
      inCanaryAllowlist: false,
      inCacheAuthoritySeed: false,
      inHomeWiring: false,
      customerOwnerCrossImport: "forbidden",
    });
    expect(resolveStoreOrderOwnerSurfaceForProduct({ viewerUserId: OWNER })).toEqual({
      status: "ok",
      exposure: true,
      viewerUserId: OWNER,
      homeInbox: "excluded",
    });
  });

  it("harness builds owner surface + loader + isolated registry", async () => {
    const orderId = "ord-1";
    const identityKey = buildStoreOrderIdentityKey(orderId);
    const surface = buildStoreOrderOwnerSurfaceForHarness({
      roomId: "room-so-1",
      domainIdentityKey: identityKey,
      customerName: "Buyer",
      customerAvatarUrl: null,
      customerUserId: CUSTOMER,
      storeId: "store-1",
    });
    expect(surface.kind).toBe("owner_buyer_peer");
    expect(surface.customerName).toBe("Buyer");

    const rows = loadStoreOrderOwnerRowsForHarness({
      viewerUserId: OWNER,
      rows: [
        {
          roomId: "room-so-1",
          chatDomain: "store_order",
          domainIdentityKey: identityKey,
          orderId,
          storeId: "store-1",
          customerUserId: CUSTOMER,
          customerName: "Buyer",
          customerAvatarUrl: null,
          unreadCount: 0,
          storeOwnerUserIds: [OWNER],
          latestMessage: null,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.customerUserId).toBe(CUSTOMER);

    const source = createStoreOrderOwnerHarnessSource([
      {
        roomId: "room-so-1",
        chatDomain: "store_order",
        domainIdentityKey: identityKey,
        orderId,
        storeId: "store-1",
        customerUserId: CUSTOMER,
        customerName: "Buyer",
        customerAvatarUrl: null,
        unreadCount: 1,
        storeOwnerUserIds: [OWNER],
        latestMessage: {
          roomId: "room-so-1",
          bodyText: "hi",
          isSystem: false,
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      },
    ]);
    registerStoreOrderOwnerIsolatedHarnessSource(source);
    expect(getStoreOrderOwnerIsolatedHarnessSource()).toBe(source);
    const loaded = await source.loadRooms(OWNER, "owner");
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.latestChatMessageText).toBe("hi");
  });
});
