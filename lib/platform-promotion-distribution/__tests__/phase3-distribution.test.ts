import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  planBannerDistributionAdapter,
  planBellDistributionAdapter,
  planPopupDistributionAdapter,
  planPushDistributionAdapter,
} from "@/lib/platform-promotion-distribution/adapters";
import {
  DISTRIBUTION_ACTIONS,
  PHASE3_DISTRIBUTION_CASE_MATRIX,
  actionImpliesPushDispatch,
  mapPushBellToCampaignChannel,
  resolveDistributionExpectation,
} from "@/lib/platform-promotion-distribution/independence";
import {
  assertBellOffMeansZeroRecord,
  assertPushOffMeansZeroDispatch,
  simulateOrchestrationSideEffects,
} from "@/lib/platform-promotion-distribution/push-safety";
import { assertExplicitPushSendAllowed } from "@/lib/platform-promotion-distribution/save-event-distribution";
import { buildPlatformEventDetailPath } from "@/lib/platform-events/types";

const root = process.cwd();

describe("Phase 3 Distribution SSOT", () => {
  it("CASE 1–8 independent channel selection", () => {
    for (const c of PHASE3_DISTRIBUTION_CASE_MATRIX) {
      const exp = resolveDistributionExpectation(c.toggles);
      expect(exp.popup).toBe(c.toggles.popup);
      expect(exp.banner).toBe(c.toggles.banner);
      expect(exp.push).toBe(c.toggles.push);
      expect(exp.bell).toBe(c.toggles.bell);
      expect(exp.pushDispatchAllowed).toBe(c.toggles.push);
      expect(exp.bellRecordAllowed).toBe(c.toggles.bell);
      if (c.id === "CASE_1") {
        expect(exp.expectedActiveChannels).toEqual(["popup"]);
      }
      if (c.id === "CASE_6") {
        expect(exp.expectedActiveChannels).toEqual([]);
      }
      if (c.id === "CASE_7") {
        expect(exp.pushDispatchAllowed).toBe(false);
        expect(exp.bellRecordAllowed).toBe(true);
      }
      if (c.id === "CASE_8") {
        expect(exp.bellRecordAllowed).toBe(false);
        expect(exp.pushDispatchAllowed).toBe(true);
      }
    }
  });

  it("Push OFF → zero dispatch for publish/save/popup", () => {
    const off = { popup: true, banner: true, push: false, bell: true };
    expect(assertPushOffMeansZeroDispatch(off)).toEqual({ ok: true });
    expect(
      simulateOrchestrationSideEffects({
        action: DISTRIBUTION_ACTIONS.PUBLISH_EVENT,
        toggles: off,
      }).pushDispatchCount
    ).toBe(0);
    expect(
      simulateOrchestrationSideEffects({
        action: DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION,
        toggles: off,
      }).pushDispatchCount
    ).toBe(0);
  });

  it("Bell OFF → zero record even if explicit create attempted", () => {
    const off = { popup: false, banner: false, push: true, bell: false };
    expect(assertBellOffMeansZeroRecord(off)).toEqual({ ok: true });
  });

  it("Event publish / Admin save do not imply Push send", () => {
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.PUBLISH_EVENT)).toBe(false);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SAVE_EVENT)).toBe(false);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION)).toBe(false);
    expect(actionImpliesPushDispatch(DISTRIBUTION_ACTIONS.SEND_PUSH)).toBe(true);
  });

  it("Admin Push/Bell map to separate campaign channels (never push_and_in_app in UX)", () => {
    expect(
      mapPushBellToCampaignChannel({ pushEnabled: true, bellEnabled: false })
    ).toEqual({ kind: "push", channel: "push_only" });
    expect(
      mapPushBellToCampaignChannel({ pushEnabled: false, bellEnabled: true })
    ).toEqual({ kind: "bell", channel: "in_app_only" });
    expect(
      mapPushBellToCampaignChannel({ pushEnabled: true, bellEnabled: true })
    ).toEqual({
      kind: "both",
      pushChannel: "push_only",
      bellChannel: "in_app_only",
    });
    expect(
      mapPushBellToCampaignChannel({ pushEnabled: false, bellEnabled: false })
    ).toEqual({ kind: "none" });
  });

  it("adapters share Event Detail destination; banner uses ADMIN_DIRECT + existing placement", () => {
    const eventId = "evt-phase3";
    const popup = planPopupDistributionAdapter({
      eventId,
      eventTitle: "Sale",
      enabled: true,
    });
    expect("ok" in popup).toBe(false);
    if (!("ok" in popup)) {
      expect(popup.ctaType).toBe("event_detail");
      expect(popup.ctaTarget).toBe(eventId);
      expect(popup.href).toBe(buildPlatformEventDetailPath(eventId));
    }

    const banner = planBannerDistributionAdapter({
      eventId,
      eventTitle: "Sale",
      enabled: true,
      config: { placement: "TRADE_HOME", imageUrl: "https://cdn.example/b.png" },
    });
    expect("ok" in banner).toBe(false);
    if (!("ok" in banner)) {
      expect(banner.source).toBe("ADMIN_DIRECT");
      expect(banner.placement).toBe("TRADE_HOME");
      expect(banner.destinationType).toBe("internal_page");
      expect(banner.destinationUrl).toBe(`/events/${eventId}`);
    }

    const push = planPushDistributionAdapter({
      eventId,
      eventTitle: "Sale",
      enabled: true,
      config: { title: "Hi", body: "Body" },
    });
    expect("ok" in push).toBe(false);
    if (!("ok" in push)) {
      expect(push.campaignChannel).toBe("push_only");
      expect(push.dispatchOnSave).toBe(false);
      expect(push.saveAsDraft).toBe(true);
      expect(push.deeplinkUrl).toBe(`/events/${eventId}`);
    }

    const bell = planBellDistributionAdapter({
      eventId,
      eventTitle: "Sale",
      enabled: true,
      config: { title: "Bell", body: "In app" },
    });
    expect("ok" in bell).toBe(false);
    if (!("ok" in bell)) {
      expect(bell.campaignChannel).toBe("in_app_only");
      expect(bell.dispatchOnSave).toBe(false);
    }
  });

  it("explicit Push send gate rejects when Push OFF", () => {
    expect(
      assertExplicitPushSendAllowed({
        pushEnabled: false,
        distributionPushRefId: "camp-1",
      })
    ).toEqual({ ok: false, error: "push_disabled" });
  });

  it("platform_events migration has no channel enable columns; distributions table is separate", () => {
    const eventMig = readFileSync(
      join(root, "supabase/migrations/20261220140000_platform_events_phase2.sql"),
      "utf8"
    );
    expect(eventMig).not.toMatch(/popup_enabled|push_enabled|bell_enabled|banner_enabled/);
    const distMig = readFileSync(
      join(root, "supabase/migrations/20261230120000_platform_promotion_distributions_phase3.sql"),
      "utf8"
    );
    expect(distMig).toContain("platform_promotion_distributions");
    expect(distMig).toContain("UNIQUE (content_type, content_id, channel)");
    expect(distMig).toContain("Save ≠ Push send");
  });

  it("Event publish API route does not import push dispatch", () => {
    const route = readFileSync(
      join(root, "app/api/admin/platform-events/[eventId]/route.ts"),
      "utf8"
    );
    expect(route).not.toMatch(/dispatchPushForUser|run-campaign-send|sendCampaignToUser/);
    expect(route).not.toMatch(/platform_promotion_distributions/);
  });
});
