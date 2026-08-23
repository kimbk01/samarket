import { describe, expect, it } from "vitest";
import {
  STORE_DISCOVERY_CAMPAIGN_HTTP_WRITER,
  STORE_DISCOVERY_CAMPAIGN_TABLE,
  STORE_DISCOVERY_CAMPAIGN_TYPES,
  STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY,
  canWriteStoreDiscoveryCampaign,
  compareStoreDiscoveryCampaignsForHome,
  isStoreDiscoveryCampaignActive,
  isStoreDiscoveryCampaignType,
  isValidStoreDiscoveryCampaignWindow,
  selectActiveStoreDiscoveryCampaignsForHome,
  type StoreDiscoveryCampaignAuthorityRow,
} from "@/lib/stores/store-discovery-campaign-authority";

const NOW = Date.parse("2026-08-23T12:00:00.000Z");

function row(
  partial: Partial<StoreDiscoveryCampaignAuthorityRow> & Pick<StoreDiscoveryCampaignAuthorityRow, "id" | "storeId">
): StoreDiscoveryCampaignAuthorityRow {
  return {
    id: partial.id,
    storeId: partial.storeId,
    campaignType: partial.campaignType ?? "event",
    title: partial.title ?? "캠페인",
    bodyCopy: partial.bodyCopy ?? null,
    startAt: partial.startAt ?? "2026-08-20T00:00:00.000Z",
    endAt: partial.endAt ?? "2026-08-30T00:00:00.000Z",
    isActive: partial.isActive ?? true,
  };
}

describe("P1-D B1 store discovery campaign authority", () => {
  it("locks table name and closed campaign types", () => {
    expect(STORE_DISCOVERY_CAMPAIGN_TABLE).toBe("store_discovery_campaigns");
    expect(STORE_DISCOVERY_CAMPAIGN_TYPES).toEqual(["event", "promo"]);
    expect(isStoreDiscoveryCampaignType("event")).toBe(true);
    expect(isStoreDiscoveryCampaignType("promo")).toBe(true);
    expect(isStoreDiscoveryCampaignType("ad")).toBe(false);
  });

  it("locks admin HTTP writer and admin write policy", () => {
    expect(STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY.owner.create).toBe(true);
    expect(STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY.admin.create).toBe(true);
    expect(canWriteStoreDiscoveryCampaign("admin", "create")).toBe(true);
    expect(canWriteStoreDiscoveryCampaign("admin", "deactivate")).toBe(true);
    expect(STORE_DISCOVERY_CAMPAIGN_HTTP_WRITER).toBe("ADMIN_HTTP");
  });

  it("active = is_active AND start_at <= now AND end_at > now", () => {
    expect(
      isStoreDiscoveryCampaignActive({
        isActive: true,
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe(true);
    expect(
      isValidStoreDiscoveryCampaignWindow({
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("T2 excludes future", () => {
    expect(
      isStoreDiscoveryCampaignActive({
        isActive: true,
        startAt: "2026-08-24T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe(false);
  });

  it("T3 excludes expired", () => {
    expect(
      isStoreDiscoveryCampaignActive({
        isActive: true,
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-08-23T12:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe(false);
  });

  it("T4 excludes is_active=false", () => {
    expect(
      isStoreDiscoveryCampaignActive({
        isActive: false,
        startAt: "2026-08-20T00:00:00.000Z",
        endAt: "2026-08-30T00:00:00.000Z",
        nowMs: NOW,
      })
    ).toBe(false);
  });

  it("T5 excludes campaigns outside HOME candidate store ids", () => {
    const selected = selectActiveStoreDiscoveryCampaignsForHome(
      [
        row({ id: "c-in", storeId: "s1" }),
        row({ id: "c-out", storeId: "s-out" }),
      ],
      ["s1"],
      NOW
    );
    expect([...selected.keys()]).toEqual(["s1"]);
    expect(selected.get("s1")?.id).toBe("c-in");
  });

  it("T6 multi-campaign deterministic: end_at ASC → start_at DESC → id ASC", () => {
    const selected = selectActiveStoreDiscoveryCampaignsForHome(
      [
        row({
          id: "c-late-end",
          storeId: "s1",
          startAt: "2026-08-10T00:00:00.000Z",
          endAt: "2026-08-29T00:00:00.000Z",
        }),
        row({
          id: "c-soon-end-older-start",
          storeId: "s1",
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-08-25T00:00:00.000Z",
        }),
        row({
          id: "c-soon-end-newer-start",
          storeId: "s1",
          startAt: "2026-08-15T00:00:00.000Z",
          endAt: "2026-08-25T00:00:00.000Z",
        }),
      ],
      ["s1"],
      NOW
    );
    expect(selected.get("s1")?.id).toBe("c-soon-end-newer-start");

    expect(
      compareStoreDiscoveryCampaignsForHome(
        { id: "a", startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-25T00:00:00.000Z" },
        { id: "b", startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-25T00:00:00.000Z" }
      )
    ).toBeLessThan(0);
  });
});
