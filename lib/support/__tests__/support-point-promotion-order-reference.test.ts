/**
 * Support ↔ Boost — POINT_PROMOTION_ORDER reference close.
 * Admin deep-link HARD LOCK is reused; this only wires Support pointer.
 */
import { describe, expect, it, vi } from "vitest";
import {
  SUPPORT_REFERENCE_TYPES,
  assertSupportReferenceAuthority,
} from "@/lib/support/support-reference-authority";
import { resolveSupportReferenceAdminHref } from "@/lib/support/support-reference-admin-href";
import { adsBoostOrderDeepLinkHref } from "@/lib/admin/ads-exposure/boost-order-deep-link";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMMUNITY_ID = "de06f845-c12a-43a1-8b34-e7ec75afa388";
const TRADE_ID = "440ed221-b1f5-40fa-baa2-1170deca407e";
const OWNER_USER = "user-owner-1";
const OTHER_USER = "user-other-2";
const MISSING_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function mockSbForBoostOrder(row: { id: string; user_id: string; domain: string } | null) {
  return {
    from: vi.fn((table: string) => {
      expect(table).toBe("point_promotion_orders");
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: row, error: null })),
            })),
          })),
        })),
      };
    }),
  } as never;
}

describe("Support POINT_PROMOTION_ORDER reference", () => {
  it("inventory includes exactly one Boost order type (no aliases)", () => {
    expect(SUPPORT_REFERENCE_TYPES).toContain("POINT_PROMOTION_ORDER");
    expect(SUPPORT_REFERENCE_TYPES.filter((t) => t === "POINT_PROMOTION_ORDER")).toHaveLength(1);
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("BOOST");
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("ADS_BOOST");
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("TRADE_PROMOTION_ORDER");
    expect(SUPPORT_REFERENCE_TYPES).not.toContain("COMMUNITY_PROMOTION_ORDER");
  });

  it("A — valid Community Boost order → authority PASS + exact Admin href", async () => {
    const sb = mockSbForBoostOrder({
      id: COMMUNITY_ID,
      user_id: OWNER_USER,
      domain: "community",
    });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OWNER_USER,
        audience: "MEMBER",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: COMMUNITY_ID,
      })
    ).resolves.toEqual({ ok: true });

    const link = resolveSupportReferenceAdminHref("POINT_PROMOTION_ORDER", COMMUNITY_ID);
    expect(link?.href).toBe(adsBoostOrderDeepLinkHref(COMMUNITY_ID));
    expect(link?.href).toBe(`/admin/advertising/boosts?orderId=${COMMUNITY_ID}`);
    expect(link?.href).not.toBe("/admin/advertising/boosts");
    expect(link?.mutationOwner).toBe("ADS");
  });

  it("B — valid Trade Boost order → authority PASS + exact Admin href", async () => {
    const sb = mockSbForBoostOrder({
      id: TRADE_ID,
      user_id: OWNER_USER,
      domain: "trade",
    });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OWNER_USER,
        audience: "MEMBER",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: TRADE_ID,
      })
    ).resolves.toEqual({ ok: true });

    const link = resolveSupportReferenceAdminHref("POINT_PROMOTION_ORDER", TRADE_ID);
    expect(link?.href).toBe(`/admin/advertising/boosts?orderId=${TRADE_ID}`);
  });

  it("C — nonexistent id → fail-closed", async () => {
    const sb = mockSbForBoostOrder(null);
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OWNER_USER,
        audience: "MEMBER",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: MISSING_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_forbidden" });
  });

  it("D — malformed id → fail-closed", async () => {
    const sb = { from: vi.fn() } as never;
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OWNER_USER,
        audience: "MEMBER",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: "not-a-uuid",
      })
    ).resolves.toEqual({ ok: false, error: "invalid_reference_id" });
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("cross-user ownership → fail-closed", async () => {
    const sb = mockSbForBoostOrder({
      id: TRADE_ID,
      user_id: OWNER_USER,
      domain: "trade",
    });
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OTHER_USER,
        audience: "MEMBER",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: TRADE_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_forbidden" });
  });

  it("OWNER audience cannot bind Boost order (Member Point product)", async () => {
    const sb = { from: vi.fn() } as never;
    await expect(
      assertSupportReferenceAuthority(sb, {
        userId: OWNER_USER,
        audience: "OWNER",
        storeId: "store-1",
        referenceType: "POINT_PROMOTION_ORDER",
        referenceId: TRADE_ID,
      })
    ).resolves.toEqual({ ok: false, error: "reference_forbidden" });
    expect((sb as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it("E — FEED_AD_REQUEST / AD_CAMPAIGN Admin href regression", () => {
    const feed = resolveSupportReferenceAdminHref("FEED_AD_REQUEST", COMMUNITY_ID);
    expect(feed?.href).toBe(`/admin/feed-ad-requests/${COMMUNITY_ID}`);
    const ad = resolveSupportReferenceAdminHref("AD_CAMPAIGN", TRADE_ID);
    expect(ad?.href).toContain(TRADE_ID);
    expect(ad?.href).not.toContain("/admin/advertising/boosts");
  });

  it("wires Boost deep-link helper; does not reopen Admin workspace", () => {
    const hrefSrc = readFileSync(
      join(process.cwd(), "lib/support/support-reference-admin-href.ts"),
      "utf8"
    );
    expect(hrefSrc).toContain("adsBoostOrderDeepLinkHref");
    expect(hrefSrc).toContain("POINT_PROMOTION_ORDER");
    const workspace = readFileSync(
      join(process.cwd(), "components/admin/ads/AdminAdvertisingWorkspace.tsx"),
      "utf8"
    );
    // This CUT must not mutate Admin Boost deep-link workspace.
    expect(workspace).toContain("ADS_BOOST_ORDER_URL_PARAM");
  });
});
