import { describe, expect, it, beforeEach } from "vitest";
import {
  DOMAIN_READ_SURFACE_WRITERS,
  isDomainReadBundleKilled,
  killDomainReadBundle,
  resetDomainReadBundleKillsForTests,
  resolveDomainReadSurfaceAccess,
  surfaceAuthorityForBundle,
} from "@/lib/messenger/contracts/domain-read-surface-canary";
import { validateDomainReadTradeListDto } from "@/lib/messenger/contracts/domain-read-trade-list-compose";
import { validateDomainReadStoreOrderCustomerListDto } from "@/lib/messenger/contracts/domain-read-store-order-customer-list-compose";
import { resetPhase11dShellReadUiCanaryKillForTests } from "@/lib/messenger/contracts/phase11d-shell-read-ui-canary";

const QA = "35dd245c-d398-4ea3-93a0-c0eda37cc777";

describe("domain-read-surface-canary", () => {
  beforeEach(() => {
    resetDomainReadBundleKillsForTests();
    resetPhase11dShellReadUiCanaryKillForTests();
  });

  it("Domain Authority writers CONNECTED; legacy delete OFF", () => {
    expect(DOMAIN_READ_SURFACE_WRITERS.cache).toBe(true);
    expect(DOMAIN_READ_SURFACE_WRITERS.realtime).toBe(true);
    expect(DOMAIN_READ_SURFACE_WRITERS.badge).toBe(true);
    expect(DOMAIN_READ_SURFACE_WRITERS.notification).toBe(true);
    expect(DOMAIN_READ_SURFACE_WRITERS.atomic).toBe(true);
    expect(DOMAIN_READ_SURFACE_WRITERS.legacyDelete).toBe(false);
  });

  it("authenticated access under all-user Domain Authority; anonymous denied", () => {
    expect(
      resolveDomainReadSurfaceAccess({ authenticatedUserId: null, bundle: "trade" }).ok
    ).toBe(false);
    expect(
      resolveDomainReadSurfaceAccess({ authenticatedUserId: QA, bundle: "trade" }).ok
    ).toBe(true);
    // ALL_USER Domain Authority → any authenticated viewer is eligible (not allowlist-only).
    expect(
      resolveDomainReadSurfaceAccess({
        authenticatedUserId: "00000000-0000-4000-8000-000000000099",
        bundle: "trade",
      }).ok
    ).toBe(true);
  });

  it("bundle kill scopes trade only until inbox also killed", () => {
    killDomainReadBundle("trade", "test");
    expect(isDomainReadBundleKilled("trade")).toBe(true);
    expect(isDomainReadBundleKilled("store_order_customer")).toBe(false);
    expect(surfaceAuthorityForBundle("trade", true)).toBe("legacy");
    expect(surfaceAuthorityForBundle("store_order_customer", true)).toBe("domain");
  });

  it("rejects contaminated trade list", () => {
    const bad = validateDomainReadTradeListDto({
      authority: "domain_trade_list_canary",
      viewerUserId: QA,
      producedAt: new Date().toISOString(),
      hub: {
        roomCount: 1,
        unreadRoomCount: 0,
        latestRoomId: "r1",
        latestActivityAt: "2026-01-01T00:00:00.000Z",
        previewText: "hi",
        latestDomainIdentityKey: "trade:i:s:b",
      },
      rows: [
        {
          roomId: "r1",
          chatDomain: "trade",
          domainIdentityKey: "trade:i:s:b",
          itemId: "i",
          productTitle: "Item",
          productImageUrl: null,
          peerLabel: "peer",
          previewText: "other",
          statusBadge: null,
          unreadCount: 0,
          lastMessageAt: "2026-01-01T00:00:00.000Z",
          href: "/x",
        },
      ],
      writers: {
        cache: false,
        realtime: false,
        badge: false,
        notification: false,
        atomic: false,
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.trigger).toBe("hub_preview_mismatch");
  });

  it("rejects store order member handle title", () => {
    const bad = validateDomainReadStoreOrderCustomerListDto({
      authority: "domain_store_order_customer_list_canary",
      viewerUserId: QA,
      producedAt: new Date().toISOString(),
      surfaceRole: "customer",
      hub: {
        roomCount: 1,
        unreadRoomCount: 0,
        latestRoomId: "r1",
        latestActivityAt: "2026-01-01T00:00:00.000Z",
        previewText: "msg",
        latestDomainIdentityKey: "store_order:o1",
      },
      rows: [
        {
          roomId: "r1",
          chatDomain: "store_order",
          domainIdentityKey: "store_order:o1",
          orderId: "o1",
          storeId: "s1",
          storeName: "@aaaa",
          storeImageUrl: null,
          previewText: "msg",
          statusBadge: null,
          unreadCount: 0,
          lastMessageAt: "2026-01-01T00:00:00.000Z",
          href: "/x",
          exposesMemberIdentity: false,
        },
      ],
      writers: {
        cache: false,
        realtime: false,
        badge: false,
        notification: false,
        atomic: false,
      },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.trigger).toBe("member_handle_as_store_name");
  });
});
