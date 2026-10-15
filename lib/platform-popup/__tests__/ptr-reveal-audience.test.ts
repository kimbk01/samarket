import { describe, expect, it } from "vitest";
import {
  isPtrRevealAudienceAllowed,
  normalizeAudienceUserIds,
  normalizePtrRevealAudienceMode,
} from "@/lib/platform-popup/ptr-reveal-audience";
import {
  resolvePopupAd,
  selectPlatformPopupEligibleWinner,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const QA_UID = "11111111-1111-4111-8111-111111111111";
const OTHER_UID = "22222222-2222-4222-8222-222222222222";

function popup(id: string, over: Partial<PlatformPopupCandidate> = {}): PlatformPopupCandidate {
  return {
    id,
    status: "active",
    approvalStatus: "approved",
    priority: 1,
    surfaces: ["GLOBAL"],
    presentationType: "center_modal",
    creative: { id: `cr-${id}`, status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card" },
    ctaType: "internal_page",
    ctaTarget: "/market",
    ...over,
  };
}

function ptr(id: string, over: Partial<PlatformPopupCandidate> = {}): PlatformPopupCandidate {
  const band = {
    id: `band-${id}`,
    assetUrl: `https://cdn.example/${id}.webp`,
    assetPath: null,
    altText: null,
    aspectW: 4,
    aspectH: 1,
  };
  return popup(id, {
    presentationType: "ptr_reveal",
    priority: 99,
    creative: {
      id: band.id,
      status: "ready",
      aspectW: 4,
      aspectH: 1,
      creativeMode: "ptr_band",
      assetUrl: band.assetUrl,
    },
    ptrBands: { default: band },
    ...over,
  });
}

describe("PTR reveal audience — fail-closed allowlist", () => {
  it("normalizes mode and UUID list", () => {
    expect(normalizePtrRevealAudienceMode("ALLOWLIST")).toBe("allowlist");
    expect(normalizePtrRevealAudienceMode(null)).toBe("all");
    expect(normalizeAudienceUserIds([QA_UID, QA_UID.toUpperCase(), ""])).toEqual({
      ok: true,
      ids: [QA_UID],
    });
    // Seed/QA all-ones UUID (non-RFC variant nibble) must still be accepted
    expect(
      normalizeAudienceUserIds(["11111111-1111-1111-1111-111111111111"])
    ).toEqual({ ok: true, ids: ["11111111-1111-1111-1111-111111111111"] });
    expect(normalizeAudienceUserIds(["not-a-uuid"]).ok).toBe(false);
  });

  it("allowlist empty → nobody", () => {
    expect(
      isPtrRevealAudienceAllowed({
        audienceMode: "allowlist",
        audienceUserIds: [],
        viewerUserId: QA_UID,
      })
    ).toBe(false);
  });

  it("allowlist match → serve", () => {
    expect(
      isPtrRevealAudienceAllowed({
        audienceMode: "allowlist",
        audienceUserIds: [QA_UID],
        viewerUserId: QA_UID,
      })
    ).toBe(true);
  });

  it("allowlist miss / anonymous → nobody", () => {
    expect(
      isPtrRevealAudienceAllowed({
        audienceMode: "allowlist",
        audienceUserIds: [QA_UID],
        viewerUserId: OTHER_UID,
      })
    ).toBe(false);
    expect(
      isPtrRevealAudienceAllowed({
        audienceMode: "allowlist",
        audienceUserIds: [QA_UID],
        viewerUserId: null,
      })
    ).toBe(false);
  });

  it("audience_mode=all → serve regardless of list", () => {
    expect(
      isPtrRevealAudienceAllowed({
        audienceMode: "all",
        audienceUserIds: [],
        viewerUserId: null,
      })
    ).toBe(true);
  });

  it("resolver: empty allowlist → null winner", () => {
    const c = ptr("p1", { audienceMode: "allowlist", audienceUserIds: [] });
    const s = selectPlatformPopupEligibleWinner(
      { pathname: "/market", now: NOW, candidates: [c], viewerUserId: QA_UID },
      "ptr_reveal"
    );
    expect(s.winner).toBeNull();
  });

  it("resolver: allowlist match → winner; miss → null", () => {
    const c = ptr("p1", { audienceMode: "allowlist", audienceUserIds: [QA_UID] });
    expect(
      selectPlatformPopupEligibleWinner(
        { pathname: "/market", now: NOW, candidates: [c], viewerUserId: QA_UID },
        "ptr_reveal"
      ).winner?.id
    ).toBe("p1");
    expect(
      selectPlatformPopupEligibleWinner(
        { pathname: "/market", now: NOW, candidates: [c], viewerUserId: OTHER_UID },
        "ptr_reveal"
      ).winner
    ).toBeNull();
  });

  it("interruptive popup path unaffected by PTR allowlist fields", () => {
    // Even if a popup candidate somehow carried allowlist fields, interruptive scope never gates on them.
    const c = popup("m1", {
      audienceMode: "allowlist",
      audienceUserIds: [],
    });
    const r = resolvePopupAd({ pathname: "/market", now: NOW, candidates: [c], viewerUserId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.winner?.campaignId).toBe("m1");
  });

  it("interruptive scope ignores ptr_reveal allowlist campaign entirely", () => {
    const p = ptr("p1", { audienceMode: "all", audienceUserIds: [] });
    const m = popup("m1");
    const r = resolvePopupAd({ pathname: "/market", now: NOW, candidates: [p, m] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.winner?.campaignId).toBe("m1");
  });
});

describe("measured device layout crop @pull=106", () => {
  it("Samsung CSS 384 ≈ 4.7% L/R; Xiaomi CSS 601 ≈ 14.6% L/R", async () => {
    const { computePtrBandLayout } = await import("@/lib/platform-popup/ptr-reveal-contract");
    const { DIBAY_PTR_MAX_PX } = await import("@/lib/ui/ptr/dibay-ptr-ssot");
    const samsung = computePtrBandLayout({
      variant: "default",
      frameWidthPx: 384,
      slotHeightPx: DIBAY_PTR_MAX_PX,
    });
    expect(samsung.imageWidthPx).toBe(424);
    expect(samsung.imageHeightPx).toBe(106);
    const crop = samsung.visible.x0;
    expect(crop).toBeCloseTo(20 / 424, 4); // ≈4.7%
    const xiaomi = computePtrBandLayout({
      variant: "tablet",
      frameWidthPx: 601,
      slotHeightPx: DIBAY_PTR_MAX_PX,
    });
    expect(xiaomi.imageWidthPx).toBe(848);
    expect(xiaomi.imageHeightPx).toBe(106);
    expect(xiaomi.visible.x0).toBeCloseTo((848 - 601) / 2 / 848, 4); // ≈14.6%
  });
});
