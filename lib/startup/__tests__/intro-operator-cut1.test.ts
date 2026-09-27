import { describe, expect, it } from "vitest";
import { emptyIntroTargeting } from "@/lib/startup/intro-v2/admin-targeting-ui";
import type { IntroAdminCampaign } from "@/lib/startup/intro-v2/admin-editor-model";
import { computeContainedCreativeRect } from "@/lib/startup/product-intro-geometry";
import { toNativeProductIntroPayload } from "@/lib/startup/product-intro-native-sync";
import {
  INTRO_FREQUENCY_IDENTITY,
  clampIntroHoldMs,
  deriveIntroOperatorAppState,
  findOperatorImageAsset,
  isIntroFrequencyEligible,
  isSupportedIntroImageMime,
  mapOperatorCampaignToProductIntro,
  resolveIntroDismissNavigation,
  validateOperatorImageForPublish,
} from "@/lib/startup/intro-operator-contract";

function campaign(partial?: Partial<IntroAdminCampaign>): IntroAdminCampaign {
  return {
    id: "camp-1",
    name: "가을 안내",
    status: "draft",
    startsAt: null,
    endsAt: null,
    timezone: "Asia/Manila",
    priority: 0,
    targeting: emptyIntroTargeting(),
    frequencyMode: "every_launch",
    deepLinkPolicy: "honor",
    draftRevision: 1,
    publishedPublicationId: null,
    requiresAdminConfirmation: false,
    source: { operator_cut1: true, sizePreset: "max", showLogo: true, displayDurationMs: 2500 },
    updatedAt: "2026-09-28T00:00:00.000Z",
    updatedBy: null,
    scenes: [
      {
        id: "scene-1",
        sortOrder: 0,
        name: "Intro",
        advanceMode: "timer",
        durationMs: 2500,
        maxHoldMs: 2500,
        transition: "fade",
        skipPolicy: "allow",
        interactionMode: "none",
        interactionLayerId: null,
        layers: [
          {
            id: "creative",
            type: "IMAGE",
            zIndex: 1,
            anchor: "center",
            aspectPolicy: "contain",
            assetId: "asset-1",
          },
        ],
        cta: null,
        backgroundColor: "#FFFCFC",
        backgroundAssetId: null,
      },
    ],
    assets: [
      {
        id: "asset-1",
        kind: "image",
        storagePath: "intro/a.webp",
        publicUrl: "https://cdn.example/intro.webp",
        mime: "image/webp",
        bytes: 12000,
        sha256: "abc",
        width: 1080,
        height: 1350,
        durationMs: null,
        loop: false,
        decodeStatus: "ready",
      },
    ],
    deviceOverrides: [],
    published: null,
    draftDivergedFromPublication: false,
    ...partial,
  };
}

describe("intro operator CUT 1", () => {
  it("maps one campaign to one IMAGE product intro (tabletUrl is not authority)", () => {
    const mapped = mapOperatorCampaignToProductIntro(campaign(), "active");
    expect("ok" in mapped && mapped.ok === false).toBe(false);
    if ("ok" in mapped) return;
    expect(mapped.campaignId).toBe("camp-1");
    expect(mapped.media.mobileUrl).toBe("https://cdn.example/intro.webp");
    expect(mapped.media.tabletUrl).toBeNull();
    expect(mapped.objectFit).toBe("contain");
    expect(mapped.sizePreset).toBe("max");
    expect(mapped.displayDurationMs).toBe(2500);
    expect(mapped.skipEnabled).toBe(true);
    expect(mapped.showLogo).toBe(true);
    expect(mapped.frequencyMode).toBe("every_launch");
    const payload = toNativeProductIntroPayload(mapped);
    expect(payload.mediaUrl).toBe(mapped.media.mobileUrl);
    expect(payload.tabletUrl).toBeUndefined();
    expect(payload.campaignId).toBe("camp-1");
  });

  it("rejects GIF as an operator IMAGE asset", () => {
    const gif = campaign({
      assets: [
        {
          id: "asset-1",
          kind: "gif",
          storagePath: "intro/a.gif",
          publicUrl: "https://cdn.example/a.gif",
          mime: "image/gif",
          bytes: 1,
          sha256: null,
          width: 100,
          height: 100,
          durationMs: 800,
          loop: true,
          decodeStatus: "ready",
        },
      ],
    });
    expect(findOperatorImageAsset(gif)).toBeNull();
    expect(isSupportedIntroImageMime("image/gif")).toBe(false);
    expect(validateOperatorImageForPublish(gif).ok).toBe(false);
  });

  it("clamps operator hold to existing 1–8000 bounds (default 2500)", () => {
    expect(clampIntroHoldMs(undefined)).toBe(2500);
    expect(clampIntroHoldMs(0)).toBe(1);
    expect(clampIntroHoldMs(2500)).toBe(2500);
    expect(clampIntroHoldMs(99999)).toBe(8000);
  });

  it("labels published from campaign lifecycle, not settings campaign identity", () => {
    const now = Date.parse("2026-09-28T12:00:00.000Z");
    expect(
      deriveIntroOperatorAppState({
        campaignId: "camp-1",
        status: "active",
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-12-01T00:00:00.000Z",
        appliedCampaignId: "camp-1",
        appliedStatus: "active",
        nowMs: now,
      })
    ).toBe("published");
    expect(
      deriveIntroOperatorAppState({
        campaignId: "camp-live-now-fixture",
        status: "active",
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: null,
        appliedCampaignId: "camp-1",
        appliedStatus: "active",
        nowMs: now,
      })
    ).toBe("published");
    expect(
      deriveIntroOperatorAppState({
        campaignId: "camp-1",
        status: "active",
        startsAt: "2026-10-01T00:00:00.000Z",
        endsAt: null,
        appliedCampaignId: "camp-1",
        appliedStatus: "active",
        nowMs: now,
      })
    ).toBe("scheduled");
  });

  it("uses campaign id as frequency identity across revisions", () => {
    expect(INTRO_FREQUENCY_IDENTITY).toBe("campaign_id");
    const now = Date.parse("2026-09-28T12:00:00.000Z");
    expect(
      isIntroFrequencyEligible("once_ever", { lastShownAtMs: now, shownEver: true, shownThisSession: true }, now)
    ).toBe(false);
    expect(
      isIntroFrequencyEligible("once_per_session", { lastShownAtMs: now, shownEver: true, shownThisSession: true }, now)
    ).toBe(false);
    expect(
      isIntroFrequencyEligible("once_per_day", { lastShownAtMs: now, shownEver: true, shownThisSession: true }, now)
    ).toBe(false);
    expect(
      isIntroFrequencyEligible(
        "once_per_day",
        { lastShownAtMs: Date.parse("2026-09-27T12:00:00.000Z"), shownEver: true, shownThisSession: false },
        now
      )
    ).toBe(true);
    expect(
      isIntroFrequencyEligible("every_launch", { lastShownAtMs: now, shownEver: true, shownThisSession: true }, now)
    ).toBe(true);
  });

  it("preview geometry is the same CONTAIN formula for Phone and Tablet (one asset)", () => {
    const image = { imageWidth: 1080, imageHeight: 1350, sizePreset: "max" as const };
    const phone = computeContainedCreativeRect({ viewportWidth: 390, viewportHeight: 844, ...image });
    const tablet = computeContainedCreativeRect({ viewportWidth: 768, viewportHeight: 1024, ...image });
    expect(phone.objectFit).toBe("contain");
    expect(tablet.objectFit).toBe("contain");
    expect(phone.width / phone.height).toBeCloseTo(1080 / 1350, 2);
    expect(tablet.width / tablet.height).toBeCloseTo(1080 / 1350, 2);
    expect(phone.width).toBeLessThanOrEqual(390);
    expect(tablet.width).toBeLessThanOrEqual(768);
  });

  it("pending destination wins over Intro CTA", () => {
    expect(
      resolveIntroDismissNavigation({
        pendingDestination: "/community-messenger/rooms/r1",
        ctaHref: "/philife/post/p1",
      })
    ).toEqual({ href: "/community-messenger/rooms/r1", reason: "pending" });
    expect(resolveIntroDismissNavigation({ pendingDestination: null, ctaHref: "/market" })).toEqual({
      href: "/market",
      reason: "cta",
    });
    expect(resolveIntroDismissNavigation({ pendingDestination: null, ctaHref: null })).toEqual({
      href: null,
      reason: "original_destination",
    });
  });
});
