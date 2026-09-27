import { describe, expect, it } from "vitest";
import { validateIntroAssetRef } from "@/lib/startup/intro-v2/assets";
import {
  assertPublishedDoesNotContainDraft,
  validateIntroCampaignWrite,
  validateIntroDeviceOverrideFamily,
  validateIntroPublishPayload,
} from "@/lib/startup/intro-v2/admin-write-contract";
import { validateIntroCta } from "@/lib/startup/intro-v2/cta";
import { validateIntroLayer, validateIntroLayers } from "@/lib/startup/intro-v2/layers";
import { emptyPublishedManifestEnvelope, validatePublishedManifest } from "@/lib/startup/intro-v2/publication";
import { resolveIntroCampaign } from "@/lib/startup/intro-v2/resolver";
import { validateIntroAdvance, validateIntroSceneContract } from "@/lib/startup/intro-v2/scenes";
import { targetingMatches, validateIntroTargeting } from "@/lib/startup/intro-v2/targeting";
import {
  INTRO_V2_SCHEMA_VERSION,
  type IntroResolverCandidate,
  type IntroTargeting,
} from "@/lib/startup/intro-v2/types";

const validLayer = {
  id: "hero",
  type: "IMAGE" as const,
  zIndex: 1,
  anchor: "center" as const,
  widthPct: 80,
  assetId: "asset-1",
};

const validScene = {
  advanceMode: "timer" as const,
  durationMs: 2500,
  maxHoldMs: null,
  transition: "fade" as const,
  skipPolicy: "deny" as const,
  interactionMode: "none" as const,
  layers: [validLayer],
  backgroundColor: "#ffffff",
};

function candidate(partial: Partial<IntroResolverCandidate> & Pick<IntroResolverCandidate, "id">): IntroResolverCandidate {
  return {
    publicationId: `pub-${partial.id}`,
    revision: 1,
    status: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: null,
    priority: 10,
    targeting: { audiences: [], platforms: [], deviceClasses: [] },
    ...partial,
  };
}

describe("intro-v2 campaign status / schedule", () => {
  it("accepts locked statuses and rejects unknown / playback_policy / target_audience enum", () => {
    expect(validateIntroCampaignWrite({ name: "A", status: "draft" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "scheduled" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "active" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "paused" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "expired" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "archived" }).ok).toBe(true);
    expect(validateIntroCampaignWrite({ name: "A", status: "ACTIVE" }).ok).toBe(false);
    expect(validateIntroCampaignWrite({ name: "A", playback_policy: "once" }).ok).toBe(false);
    expect(validateIntroCampaignWrite({ name: "A", target_audience: "guest" }).ok).toBe(false);
  });

  it("rejects inverted schedule", () => {
    const bad = validateIntroCampaignWrite({
      name: "A",
      startsAt: "2026-09-02T00:00:00.000Z",
      endsAt: "2026-09-01T00:00:00.000Z",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("schedule_invalid");
  });
});

describe("intro-v2 targeting", () => {
  it("accepts empty arrays as ALL and rejects malformed JSON", () => {
    const empty = validateIntroTargeting({ audiences: [], platforms: [], deviceClasses: [] });
    expect(empty.ok).toBe(true);
    expect(validateIntroTargeting({ audiences: ["guest"], extra: 1 }).ok).toBe(false);
    expect(validateIntroTargeting({ audiences: ["UNKNOWN"] }).ok).toBe(false);
    expect(validateIntroTargeting("nope").ok).toBe(false);
  });

  it("AND across dimensions, OR inside, never promotes UNKNOWN", () => {
    const targeting: IntroTargeting = {
      audiences: ["guest", "authenticated"],
      platforms: ["android"],
      deviceClasses: ["PHONE_ANDROID"],
    };
    expect(targetingMatches(targeting, { audience: "guest", platform: "android", deviceClass: "PHONE_ANDROID" })).toBe(true);
    expect(targetingMatches(targeting, { audience: "new", platform: "android", deviceClass: "PHONE_ANDROID" })).toBe(false);
    expect(targetingMatches(targeting, { audience: "unknown", platform: "android", deviceClass: "PHONE_ANDROID" })).toBe(false);
    expect(
      targetingMatches(
        { audiences: [], platforms: [], deviceClasses: [] },
        { audience: "unknown", platform: "unknown", deviceClass: "UNKNOWN" }
      )
    ).toBe(true);
  });
});

describe("intro-v2 scene advance / interaction", () => {
  it("supports four advance modes and rejects TIMER 0", () => {
    expect(validateIntroAdvance({ advanceMode: "timer", durationMs: 1, maxHoldMs: null }).ok).toBe(true);
    expect(validateIntroAdvance({ advanceMode: "timer", durationMs: 0, maxHoldMs: null }).ok).toBe(false);
    expect(validateIntroAdvance({ advanceMode: "media_end", durationMs: null, maxHoldMs: 4000 }).ok).toBe(true);
    expect(validateIntroAdvance({ advanceMode: "cta_only", durationMs: null, maxHoldMs: 8000 }).ok).toBe(true);
    expect(validateIntroAdvance({ advanceMode: "manual", durationMs: null, maxHoldMs: 10000 }).ok).toBe(true);
    expect(validateIntroAdvance({ advanceMode: "media_end", durationMs: null, maxHoldMs: null }).ok).toBe(false);
  });

  it("allows incomplete advance only when flagged, and validates four interaction modes", () => {
    expect(
      validateIntroAdvance({
        advanceMode: "manual",
        durationMs: null,
        maxHoldMs: null,
        allowIncomplete: true,
      }).ok
    ).toBe(true);
    expect(validateIntroSceneContract({ ...validScene, interactionMode: "tap_advance" }).ok).toBe(true);
    expect(validateIntroSceneContract({ ...validScene, interactionMode: "tap_cta" }).ok).toBe(true);
    expect(
      validateIntroSceneContract({
        ...validScene,
        interactionMode: "tap_layer",
        interactionLayerId: "hero",
      }).ok
    ).toBe(true);
    expect(validateIntroSceneContract({ ...validScene, interactionMode: "tap_layer" }).ok).toBe(false);
  });
});

describe("intro-v2 layer / CTA schema", () => {
  it("accepts valid layers and rejects missing required / invalid enum / range", () => {
    expect(validateIntroLayer(validLayer).ok).toBe(true);
    expect(validateIntroLayer({ ...validLayer, type: "BANNER" }).ok).toBe(false);
    expect(validateIntroLayer({ ...validLayer, opacity: 2 }).ok).toBe(false);
    expect(validateIntroLayer({ ...validLayer, assetId: undefined }).ok).toBe(false);
    expect(validateIntroLayers([validLayer, { ...validLayer, id: "hero" }]).ok).toBe(false);
  });

  it("validates CTA destinations and fail-closed EXTERNAL_URL allowlist", () => {
    expect(validateIntroCta({ enabled: false, destination: { type: "COMMUNITY" } }).ok).toBe(true);
    expect(validateIntroCta({ enabled: true, destination: { type: "COMMUNITY" } }).ok).toBe(true);
    expect(validateIntroCta({ enabled: true, destination: { type: "STORE", id: "s1" } }).ok).toBe(true);
    expect(validateIntroCta({ enabled: true, destination: { type: "STORE" } }).ok).toBe(false);
    expect(
      validateIntroCta({
        enabled: true,
        destination: { type: "EXTERNAL_URL", url: "https://dibay.app/x" },
      }).ok
    ).toBe(true);
    expect(
      validateIntroCta({
        enabled: true,
        destination: { type: "EXTERNAL_URL", url: "http://dibay.app/x" },
      }).ok
    ).toBe(false);
    expect(
      validateIntroCta({
        enabled: true,
        destination: { type: "EXTERNAL_URL", url: "javascript:alert(1)" },
      }).ok
    ).toBe(false);
    expect(
      validateIntroCta({
        enabled: true,
        destination: { type: "EXTERNAL_URL", url: "https://evil.example/x" },
      }).ok
    ).toBe(false);
  });
});

describe("intro-v2 publication isolation + resolver", () => {
  it("rejects draft fields in published manifest and treats ZERO INTRO as normal", () => {
    const empty = emptyPublishedManifestEnvelope();
    expect(empty.campaign).toBeNull();
    expect(empty.schemaVersion).toBe(INTRO_V2_SCHEMA_VERSION);
    const leak = validatePublishedManifest({
      schemaVersion: 2,
      publicationId: "p1",
      revision: 1,
      campaign: { id: "c1", name: "A", priority: 1 },
      targeting: { audiences: [], platforms: [], deviceClasses: [] },
      frequencyMode: "every_launch",
      deepLinkPolicy: "honor",
      scenes: [validScene],
      draftRevision: 3,
    });
    expect(leak.ok).toBe(false);
    expect(
      assertPublishedDoesNotContainDraft({
        schemaVersion: 2,
        publicationId: "p1",
        revision: 1,
        campaign: { id: "c1", name: "A", priority: 1 },
        targeting: { audiences: [], platforms: [], deviceClasses: [] },
        frequencyMode: "every_launch",
        deepLinkPolicy: "honor",
        scenes: [validScene],
      }).ok
    ).toBe(true);
  });

  it("picks the deterministic winner among two ACTIVE campaigns", () => {
    const input = {
      now: "2026-06-01T00:00:00.000Z",
      audience: "guest" as const,
      platform: "android" as const,
      deviceClass: "PHONE_ANDROID" as const,
      frequencyEligible: true,
    };
    const a = candidate({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      priority: 5,
      startsAt: "2026-01-01T00:00:00.000Z",
    });
    const b = candidate({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      priority: 5,
      startsAt: "2026-01-01T00:00:00.000Z",
    });
    const high = candidate({
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      priority: 9,
      startsAt: "2026-05-01T00:00:00.000Z",
    });
    expect(resolveIntroCampaign([a, b], input)?.id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(resolveIntroCampaign([a, high], input)?.id).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(resolveIntroCampaign([], input)).toBeNull();
    expect(resolveIntroCampaign([a], { ...input, frequencyEligible: false })).toBeNull();
  });

  it("allows a SCHEDULED campaign only when the fixture time is inside its window", () => {
    const scheduled = candidate({
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      status: "scheduled",
      startsAt: "2030-06-01T00:00:00.000Z",
      endsAt: "2030-06-30T23:59:00.000Z",
      targeting: { audiences: ["guest"], platforms: ["android"], deviceClasses: ["PHONE_ANDROID"] },
    });
    const inside = {
      now: "2030-06-15T01:00:00.000Z",
      audience: "guest" as const,
      platform: "android" as const,
      deviceClass: "PHONE_ANDROID" as const,
      frequencyEligible: true,
    };

    expect(resolveIntroCampaign([scheduled], inside)?.id).toBe(scheduled.id);
    expect(resolveIntroCampaign([scheduled], { ...inside, now: "2026-06-15T01:00:00.000Z" })).toBeNull();
  });

  it("does not invent a fake campaign for ZERO INTRO", () => {
    expect(
      resolveIntroCampaign([], {
        now: "2026-06-01T00:00:00.000Z",
        audience: "unknown",
        platform: "unknown",
        deviceClass: "UNKNOWN",
        frequencyEligible: true,
      })
    ).toBeNull();
  });
});

describe("intro-v2 assets / device override / V1 fixture / publish gate", () => {
  it("rejects blob/localhost asset refs (FD6)", () => {
    expect(
      validateIntroAssetRef({
        kind: "image",
        storagePath: "blob:https://localhost/x",
      }).ok
    ).toBe(false);
    expect(
      validateIntroAssetRef({
        kind: "image",
        storagePath: "_admin/startup/product/mobile/2717968e-3492-4ead-b9c2-30a6b16f78b5.webp",
        publicUrl:
          "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/admin-notification-campaign-images/_admin/startup/product/mobile/2717968e-3492-4ead-b9c2-30a6b16f78b5.webp",
      }).ok
    ).toBe(true);
  });

  it("accepts DeviceClass families only", () => {
    expect(validateIntroDeviceOverrideFamily("PHONE").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("TABLET").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("DESKTOP").ok).toBe(true);
    expect(validateIntroDeviceOverrideFamily("PHONE_ANDROID").ok).toBe(false);
    expect(validateIntroDeviceOverrideFamily(768).ok).toBe(false);
  });

  it("V1 displayDurationMs=0 fixture stays unconfirmed draft — not TIMER 2500", () => {
    const v1 = {
      name: "QA_FE_MAGENTA_CYAN",
      status: "draft",
      requiresAdminConfirmation: true,
      scenes: [
        {
          advanceMode: "manual",
          durationMs: null,
          maxHoldMs: null,
          transition: "fade_in_expand",
          skipPolicy: "deny",
          interactionMode: "none",
          layers: [validLayer],
          backgroundColor: "#ffffff",
        },
      ],
    };
    expect(validateIntroPublishPayload(v1).ok).toBe(false);
    expect(validateIntroSceneContract(v1.scenes[0], { allowIncompleteAdvance: true }).ok).toBe(true);
    expect(validateIntroSceneContract({ ...v1.scenes[0], advanceMode: "timer", durationMs: 2500 }).ok).toBe(true);
  });

  it("publish payload rejects malformed JSON and incomplete advance", () => {
    expect(
      validateIntroPublishPayload({
        name: "Live",
        status: "active",
        scenes: [validScene],
      }).ok
    ).toBe(true);
    expect(
      validateIntroPublishPayload({
        name: "Live",
        scenes: [{ ...validScene, layers: [{ ...validLayer, type: "NOPE" }] }],
      }).ok
    ).toBe(false);
  });
});
