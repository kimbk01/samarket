import { describe, expect, it } from "vitest";
import { resolveCampaignTargetPayload } from "@/lib/admin/notification-campaigns/resolve-campaign-target-payload";

describe("resolveCampaignTargetPayload", () => {
  it("defaults omitted target_payload to empty object", () => {
    const res = resolveCampaignTargetPayload({});
    expect(res).toEqual({ ok: true, target_payload: {} });
  });

  it("preserves provided plain-object target_payload", () => {
    const payload = { appNoticeId: "n1", extra: 1 };
    const res = resolveCampaignTargetPayload({
      target_payload: payload,
      targetPayloadKeyPresent: true,
    });
    expect(res).toEqual({ ok: true, target_payload: payload });
  });

  it("rejects explicit null target_payload", () => {
    const res = resolveCampaignTargetPayload({
      target_payload: null,
      targetPayloadKeyPresent: true,
    });
    expect(res).toEqual({ ok: false, error: "invalid_target_payload" });
  });

  it("rejects arrays and non-objects", () => {
    expect(
      resolveCampaignTargetPayload({
        target_payload: [],
        targetPayloadKeyPresent: true,
      }).ok
    ).toBe(false);
    expect(
      resolveCampaignTargetPayload({
        target_payload: "x",
        targetPayloadKeyPresent: true,
      }).ok
    ).toBe(false);
  });

  it("maps app_notice_id to { appNoticeId } over omitted payload", () => {
    const res = resolveCampaignTargetPayload({ app_notice_id: "  notice-9  " });
    expect(res).toEqual({ ok: true, target_payload: { appNoticeId: "notice-9" } });
  });

  it("prefers app_notice_id when both provided", () => {
    const res = resolveCampaignTargetPayload({
      app_notice_id: "from-notice",
      target_payload: { appNoticeId: "from-payload" },
      targetPayloadKeyPresent: true,
    });
    expect(res).toEqual({ ok: true, target_payload: { appNoticeId: "from-notice" } });
  });
});
