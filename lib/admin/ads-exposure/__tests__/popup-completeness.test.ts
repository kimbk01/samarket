import { describe, expect, it } from "vitest";
import {
  classifyPopupCampaignCompleteness,
  popupMissingFieldsLabel,
} from "@/lib/admin/ads-exposure/popup-completeness";

describe("popup completeness classification", () => {
  it("separates orphan, incomplete, draft_ready, and pending", () => {
    expect(
      classifyPopupCampaignCompleteness({
        status: "draft",
        approvalStatus: "not_submitted",
        hasReadyCreative: false,
        startAt: null,
        endAt: null,
      }).completeness
    ).toBe("orphan_partial");

    expect(
      classifyPopupCampaignCompleteness({
        status: "draft",
        approvalStatus: "not_submitted",
        hasReadyCreative: true,
        startAt: null,
        endAt: null,
      }).completeness
    ).toBe("incomplete");

    expect(
      classifyPopupCampaignCompleteness({
        status: "draft",
        approvalStatus: "not_submitted",
        hasReadyCreative: true,
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-30T00:00:00.000Z",
      }).completeness
    ).toBe("draft_ready");

    expect(
      classifyPopupCampaignCompleteness({
        status: "pending_review",
        approvalStatus: "pending_review",
        hasReadyCreative: true,
        startAt: "2026-09-01T00:00:00.000Z",
        endAt: "2026-09-30T00:00:00.000Z",
      }).completeness
    ).toBe("pending_review");
  });

  it("labels missing fields without dumping enums", () => {
    expect(popupMissingFieldsLabel(["creative", "schedule"], true)).toBe(
      "이미지 없음 · 노출 기간 없음"
    );
  });
});
