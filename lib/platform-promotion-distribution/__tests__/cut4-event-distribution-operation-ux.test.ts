/**
 * CUT 4 — Event / Distribution operation UX contracts (focused).
 * Visual proof is separate; these lock writer semantics + UI ownership.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveEventOperatorStatus,
  promotionOperatorStatusLabel,
} from "@/lib/admin/promotion-operation-status";
import {
  eventDistributionHref,
  eventPreviewHref,
} from "@/lib/admin/promotion-ownership-visibility";
import { planPopupDistributionAdapter } from "@/lib/platform-promotion-distribution/adapters";
import { assertExplicitPushSendAllowed } from "@/lib/platform-promotion-distribution/save-event-distribution";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("CUT 4 — Event operator status fixtures", () => {
  const now = Date.parse("2026-06-15T12:00:00+08:00");

  it("maps draft / scheduled / active / paused / ended", () => {
    expect(
      resolveEventOperatorStatus({ status: "draft", startsAt: null, endsAt: null }, now)
    ).toBe("DRAFT");
    expect(
      resolveEventOperatorStatus(
        {
          status: "published",
          startsAt: "2026-07-01T00:00:00+08:00",
          endsAt: "2026-07-31T00:00:00+08:00",
        },
        now
      )
    ).toBe("SCHEDULED");
    expect(
      resolveEventOperatorStatus(
        {
          status: "published",
          startsAt: "2026-06-01T00:00:00+08:00",
          endsAt: "2026-06-30T00:00:00+08:00",
        },
        now
      )
    ).toBe("ACTIVE");
    expect(
      resolveEventOperatorStatus(
        {
          status: "unpublished",
          startsAt: "2026-06-01T00:00:00+08:00",
          endsAt: "2026-06-30T00:00:00+08:00",
        },
        now
      )
    ).toBe("PAUSED");
    expect(
      resolveEventOperatorStatus(
        {
          status: "published",
          startsAt: "2026-01-01T00:00:00+08:00",
          endsAt: "2026-01-31T00:00:00+08:00",
        },
        now
      )
    ).toBe("ENDED");
  });

  it("Korean operator labels", () => {
    expect(promotionOperatorStatusLabel("DRAFT", "ko")).toBe("초안");
    expect(promotionOperatorStatusLabel("SCHEDULED", "ko")).toBe("예약");
    expect(promotionOperatorStatusLabel("ACTIVE", "ko")).toBe("노출 중");
    expect(promotionOperatorStatusLabel("PAUSED", "ko")).toBe("중지");
    expect(promotionOperatorStatusLabel("ENDED", "ko")).toBe("종료");
  });
});

describe("CUT 4 — Destination validation SSOT", () => {
  it("store without target fails", () => {
    const r = validatePlatformPopupCta({ ctaType: "store", ctaTarget: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("destination_id_required");
  });

  it("internal_page requires path", () => {
    const r = validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: "" });
    expect(r.ok).toBe(false);
  });

  it("external_url requires https", () => {
    const r = validatePlatformPopupCta({
      ctaType: "external_url",
      externalUrl: "http://example.com",
    });
    expect(r.ok).toBe(false);
  });
});

describe("CUT 4 — Popup adapter creative persistence fields", () => {
  it("plans artwork + image path for Dist materialize", () => {
    const plan = planPopupDistributionAdapter({
      eventId: "evt-1",
      eventTitle: "Summer",
      enabled: true,
      config: {
        presentationType: "center_modal",
        creativeMode: "artwork",
        imageUrl: "https://cdn.example/a.png",
        imagePath: "platform-event-media/a.png",
        frequencyMode: "once_per_day",
      },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.creativeMode).toBe("artwork");
    expect(plan.value.imageUrl).toContain("cdn.example");
    expect(plan.value.imagePath).toContain("platform-event-media");
    expect(plan.value.presentationType).toBe("center_modal");
  });

  it("plans benefit_dialog presentation", () => {
    const plan = planPopupDistributionAdapter({
      eventId: "evt-1",
      eventTitle: "Summer",
      enabled: true,
      config: { presentationType: "benefit_dialog", creativeMode: "card" },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.presentationType).toBe("benefit_dialog");
  });
});

describe("CUT 4 — Push send gate ≠ save", () => {
  it("blocks send when push disabled or unconfigured", () => {
    expect(
      assertExplicitPushSendAllowed({
        pushEnabled: false,
        distributionPushRefId: "x",
      }).ok
    ).toBe(false);
    expect(
      assertExplicitPushSendAllowed({
        pushEnabled: true,
        distributionPushRefId: null,
      }).ok
    ).toBe(false);
  });

  it("allows handoff only when configured", () => {
    const r = assertExplicitPushSendAllowed({
      pushEnabled: true,
      distributionPushRefId: "camp-1",
    });
    expect(r.ok).toBe(true);
  });
});

describe("CUT 4 — Admin Event editor / Dist UI ownership", () => {
  const editor = readSrc("components/admin/platform-events/AdminPlatformEventEditorClient.tsx");
  const dist = readSrc(
    "components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx"
  );
  const list = readSrc("components/admin/platform-events/AdminPlatformEventsListClient.tsx");
  const saveWriter = readSrc("lib/platform-promotion-distribution/save-event-distribution.ts");

  it("editor uses AdminActionButton + canonical status + PlatformEventDetailContent", () => {
    expect(editor).toContain("AdminActionButton");
    expect(editor).toContain("resolveEventOperatorStatus");
    expect(editor).toContain("PlatformEventDetailContent");
    expect(editor).toContain("validatePlatformPopupCta");
    expect(editor).toContain('data-admin-event-section="basic"');
    expect(editor).toContain('data-admin-event-section="distribution"');
    expect(editor).toContain('data-admin-event-section="preview"');
    expect(editor).toContain("Asia/Manila");
  });

  it("Save / Publish / Stop are distinct actions", () => {
    expect(editor).toMatch(/save\("published"\)|save\(\s*"published"\s*\)/);
    expect(editor).toMatch(/save\("unpublished"\)|save\(\s*"unpublished"\s*\)/);
    expect(editor).toContain("promotionAdminActionLabel");
  });

  it("Dist panel uses DibayPopupAd preview + banner registry + AdminActionButton", () => {
    expect(dist).toContain("AdminPlatformPopupPreview");
    expect(dist).toContain("listEventBannerPresentations");
    expect(dist).toContain("FeedAdFramePreview");
    expect(dist).toContain("DeliveryAdBanner");
    expect(dist).toContain("AdminActionButton");
    expect(dist).toContain("data-admin-popup-presentation-selector");
    expect(dist).toContain("data-admin-popup-benefit-disabled-reason");
    expect(dist).toContain("data-admin-push-send");
    expect(dist).toContain("push_dispatch_on_save_forbidden");
  });

  it("list deep-links preview / distribution via canonical href helpers", () => {
    expect(list).toContain("eventPreviewHref");
    expect(list).toContain("eventDistributionHref");
    expect(list).toContain("AdminActionLink");
    expect(eventPreviewHref("evt-cut4")).toBe("/admin/platform-events/evt-cut4#preview");
    expect(eventDistributionHref("evt-cut4")).toBe(
      "/admin/platform-events/evt-cut4#distribution"
    );
  });

  it("materializePopup persists presentation + optional creative replace", () => {
    expect(saveWriter).toContain("replacePlatformPopupReadyCreative");
    expect(saveWriter).toContain("presentationType: plan.presentationType");
    expect(saveWriter).toContain("creativeMode: plan.creativeMode");
    expect(saveWriter).toContain("pushDispatchCount: 0");
  });

  it("Create Event path does not auto-toggle Dist channels in editor", () => {
    expect(editor).toContain("distribution_save_first");
    expect(editor).not.toContain("toggles.popup = true");
  });
});
