/**
 * Event → Push campaign source contract.
 * Dist save / Event publish never dispatch. SEND eligibility is evaluated
 * with the same SSOT used by explicit campaign send — lookup is injected.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  campaignRowHasOfficialSource,
  evaluateOfficialCampaignSendEligibility,
  resolveApprovedMarketingLandingRoute,
  validateOfficialCampaignSource,
} from "@/lib/admin/notification-campaigns/campaign-source-authority";
import {
  assertApproveIsNotPublishOrSend,
  assertSaveIsNotSend,
  promotionAdminActionLabel,
} from "@/lib/admin/promotion-operation-actions";
import {
  isAllowedPlatformEventNotificationPath,
  resolveSafeNotificationInternalRoute,
} from "@/lib/notifications/policy/notification-internal-route";
import { planPushDistributionAdapter } from "@/lib/platform-promotion-distribution/adapters";
import {
  DISTRIBUTION_ACTIONS,
  actionImpliesPushDispatch,
} from "@/lib/platform-promotion-distribution/independence";
import { simulateOrchestrationSideEffects } from "@/lib/platform-promotion-distribution/push-safety";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";
import type { PlatformEventPublicationInput } from "@/lib/platform-events/publication";

const EVENT_ID = "evt-src-contract-1";
const EVENT_PATH = buildPlatformEventDetailPath(EVENT_ID);

function distShapedRow(eventId = EVENT_ID) {
  const planned = planPushDistributionAdapter({
    eventId,
    eventTitle: "Promo",
    enabled: true,
    config: { title: "Hi", body: "Body" },
  });
  if (!planned.ok) throw new Error(planned.error);
  return {
    type: "marketing" as const,
    deeplink_url: planned.value.deeplinkUrl,
    web_url: planned.value.deeplinkUrl,
    target_url: planned.value.deeplinkUrl,
    target_payload: { platform_event_id: eventId },
  };
}

function lookupMap(rows: Record<string, PlatformEventPublicationInput | null>) {
  return async (eventId: string) =>
    Object.prototype.hasOwnProperty.call(rows, eventId) ? rows[eventId] : null;
}

describe("Event Push source contract", () => {
  it("A — published Event Dist draft is a valid campaign source", () => {
    const row = distShapedRow();
    expect(row.deeplink_url).toBe(EVENT_PATH);
    const source = validateOfficialCampaignSource({
      campaign_type: row.type,
      deeplink_url: row.deeplink_url,
      web_url: row.web_url,
      target_url: row.target_url,
      target_payload: row.target_payload,
    });
    expect(source.ok).toBe(true);
    if (source.ok) {
      expect(source.mode).toBe("platform_event");
      expect(source.content_id).toBe(EVENT_ID);
      expect(source.canonical_route).toBe(EVENT_PATH);
    }
  });

  it("B — published Event SEND eligibility PASS without executing dispatch", async () => {
    const row = distShapedRow();
    const eligibility = await evaluateOfficialCampaignSendEligibility(
      row,
      lookupMap({
        [EVENT_ID]: { status: "published", startsAt: "2020-01-01T00:00:00.000Z" },
      })
    );
    expect(eligibility.ok).toBe(true);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SEND_PUSH)).toBe(true);
    expect(
      simulateOrchestrationSideEffects({
        action: DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION,
        toggles: { popup: false, banner: false, push: true, bell: false },
      }).pushDispatchCount
    ).toBe(0);
  });

  it("C — draft/unpublished Event SEND eligibility rejects", async () => {
    const row = distShapedRow();
    const draft = await evaluateOfficialCampaignSendEligibility(
      row,
      lookupMap({ [EVENT_ID]: { status: "draft" } })
    );
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error).toBe("event_source_unpublished");

    const unpublished = await evaluateOfficialCampaignSendEligibility(
      row,
      lookupMap({ [EVENT_ID]: { status: "unpublished" } })
    );
    expect(unpublished.ok).toBe(false);
    if (!unpublished.ok) expect(unpublished.error).toBe("event_source_unpublished");
  });

  it("D — unknown Event ID rejects at SEND", async () => {
    const eligibility = await evaluateOfficialCampaignSendEligibility(
      distShapedRow(),
      lookupMap({})
    );
    expect(eligibility.ok).toBe(false);
    if (!eligibility.ok) expect(eligibility.error).toBe("event_source_missing");
  });

  it("E — malformed Event path/reference rejects", () => {
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: "/events/",
        target_payload: { platform_event_id: EVENT_ID },
      }).ok
    ).toBe(false);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: "/events/foo/bar",
        target_payload: { platform_event_id: "foo" },
      }).ok
    ).toBe(false);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: EVENT_PATH,
        target_payload: { platform_event_id: "other-id" },
      }).ok
    ).toBe(false);
    expect(isAllowedPlatformEventNotificationPath("/events")).toBe(false);
    expect(isAllowedPlatformEventNotificationPath("/events/")).toBe(false);
    expect(isAllowedPlatformEventNotificationPath("/events/a/b")).toBe(false);
  });

  it("F — existing approved non-Event landing still PASSES", () => {
    const landing = validateOfficialCampaignSource({
      campaign_type: "marketing",
      deeplink_url: "/market",
    });
    expect(landing.ok).toBe(true);
    if (landing.ok) {
      expect(landing.mode).toBe("approved_landing");
      expect(landing.approved_landing).toBe("/market");
    }
    expect(resolveApprovedMarketingLandingRoute("/post/abc")).toBe("/post/abc");
  });

  it("G — invalid existing marketing source still rejects", () => {
    expect(validateOfficialCampaignSource({ campaign_type: "marketing" }).ok).toBe(false);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: "/notifications",
      }).ok
    ).toBe(false);
    expect(
      validateOfficialCampaignSource({
        campaign_type: "marketing",
        deeplink_url: EVENT_PATH,
      }).ok
    ).toBe(false);
  });

  it("H–L — Event save / publish / Dist save / Push draft / Owner approve do not dispatch", () => {
    expect(assertSaveIsNotSend()).toBe(true);
    expect(assertApproveIsNotPublishOrSend()).toBe(true);
    expect(promotionAdminActionLabel("SEND_PUSH", "ko")).toBe("Push 보내기");
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SAVE_EVENT)).toBe(false);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.PUBLISH_EVENT)).toBe(false);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION)).toBe(false);
    for (const action of [
      DISTRIBUTION_ACTIONS.SAVE_EVENT,
      DISTRIBUTION_ACTIONS.PUBLISH_EVENT,
      DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION,
    ] as const) {
      expect(
        simulateOrchestrationSideEffects({
          action,
          toggles: { popup: true, banner: true, push: true, bell: true },
        }).pushDispatchCount
      ).toBe(0);
    }
  });

  it("M — only explicit sender path may dispatch", () => {
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SEND_PUSH)).toBe(true);
    expect(campaignRowHasOfficialSource(distShapedRow())).toBe(true);
  });

  it("ended/scheduled Event is not send-eligible", async () => {
    const ended = await evaluateOfficialCampaignSendEligibility(
      distShapedRow(),
      lookupMap({
        [EVENT_ID]: { status: "published", endsAt: "2020-01-01T00:00:00.000Z" },
      })
    );
    expect(ended.ok).toBe(false);
    if (!ended.ok) expect(ended.error).toBe("event_source_unavailable");

    const scheduled = await evaluateOfficialCampaignSendEligibility(
      distShapedRow(),
      lookupMap({
        [EVENT_ID]: { status: "published", startsAt: "2099-01-01T00:00:00.000Z" },
      })
    );
    expect(scheduled.ok).toBe(false);
    if (!scheduled.ok) expect(scheduled.error).toBe("event_source_unavailable");
  });

  it("destination identity path is tap-safe; generic landing is not Event", () => {
    expect(isAllowedPlatformEventNotificationPath(EVENT_PATH)).toBe(true);
    expect(resolveSafeNotificationInternalRoute(EVENT_PATH)).toBe(EVENT_PATH);
    expect(resolveApprovedMarketingLandingRoute(EVENT_PATH)).toBeNull();
  });

  it("Bell Event Dist uses the same source contract (no separate validator)", () => {
    const source = validateOfficialCampaignSource({
      campaign_type: "marketing",
      deeplink_url: EVENT_PATH,
      target_payload: { platform_event_id: EVENT_ID },
    });
    expect(source.ok).toBe(true);
    if (source.ok) expect(source.mode).toBe("platform_event");
  });

  it("scheduled drain reuses evaluateOfficialCampaignSendEligibility before batches", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/admin/notification-campaigns/claim-scheduled-campaign.ts"),
      "utf8"
    );
    expect(src).toContain("evaluateOfficialCampaignSendEligibility");
    expect(src).toContain("drainNotificationCampaignSendBatches");
    expect(src.indexOf("evaluateOfficialCampaignSendEligibility")).toBeLessThan(
      src.indexOf("runNotificationCampaignSendBatch")
    );
  });
});
