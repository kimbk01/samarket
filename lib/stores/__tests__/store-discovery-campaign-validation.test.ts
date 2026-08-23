import { describe, expect, it } from "vitest";
import {
  parseStoreDiscoveryCampaignCreateBody,
  parseStoreDiscoveryCampaignUpdateBody,
} from "@/lib/stores/store-discovery-campaign-validation";

const WINDOW = {
  startAt: "2026-08-20T00:00:00.000Z",
  endAt: "2026-08-30T00:00:00.000Z",
};

describe("store-discovery-campaign-validation", () => {
  it("accepts valid create payload", () => {
    const parsed = parseStoreDiscoveryCampaignCreateBody({
      storeId: "11111111-1111-1111-1111-111111111111",
      campaignType: "event",
      title: "QA Campaign",
      bodyCopy: "body",
      startAt: WINDOW.startAt,
      endAt: WINDOW.endAt,
      isActive: true,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.storeId).toContain("1111");
      expect(parsed.value.campaignType).toBe("event");
    }
  });

  it("rejects invalid campaign type", () => {
    const parsed = parseStoreDiscoveryCampaignCreateBody({
      storeId: "11111111-1111-1111-1111-111111111111",
      campaignType: "ad",
      title: "x",
      startAt: WINDOW.startAt,
      endAt: WINDOW.endAt,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("invalid_campaign_type");
  });

  it("rejects empty title", () => {
    const parsed = parseStoreDiscoveryCampaignCreateBody({
      storeId: "11111111-1111-1111-1111-111111111111",
      campaignType: "promo",
      title: "   ",
      startAt: WINDOW.startAt,
      endAt: WINDOW.endAt,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("empty_title");
  });

  it("rejects end <= start", () => {
    const parsed = parseStoreDiscoveryCampaignCreateBody({
      storeId: "11111111-1111-1111-1111-111111111111",
      campaignType: "event",
      title: "x",
      startAt: WINDOW.endAt,
      endAt: WINDOW.startAt,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("invalid_window");
  });

  it("rejects forbidden composition fields on create", () => {
    const parsed = parseStoreDiscoveryCampaignCreateBody({
      storeId: "11111111-1111-1111-1111-111111111111",
      campaignType: "event",
      title: "x",
      startAt: WINDOW.startAt,
      endAt: WINDOW.endAt,
      composition_order: 1,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("forbidden_fields");
  });

  it("rejects storeId reassignment on update", () => {
    const parsed = parseStoreDiscoveryCampaignUpdateBody({
      id: "22222222-2222-2222-2222-222222222222",
      storeId: "11111111-1111-1111-1111-111111111111",
      title: "updated",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe("store_id_not_allowed_on_update");
  });

  it("accepts deactivate-only patch", () => {
    const parsed = parseStoreDiscoveryCampaignUpdateBody({
      id: "22222222-2222-2222-2222-222222222222",
      isActive: false,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.isActive).toBe(false);
  });
});
