import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validatePlatformPopupCampaignForApproval } from "@/lib/platform-popup/admin-campaign-authority";
import { isPlatformPopupCreativeAspectValid } from "@/lib/platform-popup/creative-contract";
import { processPlatformPopupCreativeToCanonical } from "@/lib/platform-popup/creative-pipeline";
import {
  isPlatformPopupAdminSelectablePresentation,
  isPlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import {
  centerCropBoxToPtrBand,
  checkPtrBandSource,
  computePtrBandLayout,
  PTR_BAND_SPECS,
  resolvePtrBandVariantForViewport,
} from "@/lib/platform-popup/ptr-reveal-contract";
import { buildPtrRevealAdPayload } from "@/lib/platform-popup/ptr-reveal-payload";
import {
  resolvePopupAd,
  selectPlatformPopupEligibleWinner,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";
import { DIBAY_PTR_MAX_PX, DIBAY_PTR_THRESHOLD_PX } from "@/lib/ui/ptr/dibay-ptr-ssot";

const NOW = new Date("2026-06-01T00:00:00.000Z");

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
  const band = { id: `band-${id}`, assetUrl: `https://cdn.example/${id}.webp`, assetPath: null, altText: null, aspectW: 4, aspectH: 1 };
  return popup(id, {
    presentationType: "ptr_reveal",
    priority: 99,
    creative: { id: band.id, status: "ready", aspectW: 4, aspectH: 1, creativeMode: "ptr_band", assetUrl: band.assetUrl },
    ptrBands: { default: band },
    ...over,
  });
}

describe("PTR reveal — contract", () => {
  it("ptr_reveal is admin-selectable but never interruptive", () => {
    expect(isPlatformPopupAdminSelectablePresentation("ptr_reveal")).toBe(true);
    expect(isPlatformPopupInterruptivePresentation("ptr_reveal")).toBe(false);
    expect(isPlatformPopupAdminSelectablePresentation("hero_banner")).toBe(false);
  });

  it("ptr_band aspect tokens: 4:1 / 8:1 / 1:1 only", () => {
    expect(isPlatformPopupCreativeAspectValid(4, 1, "ptr_band")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(8, 1, "ptr_band")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(1, 1, "ptr_band")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(36, 25, "ptr_band")).toBe(false);
    // 기존 카드 규칙 불변
    expect(isPlatformPopupCreativeAspectValid(36, 25, "card")).toBe(true);
    expect(isPlatformPopupCreativeAspectValid(4, 1, "card")).toBe(false);
  });

  it("device variant breakpoint 600", () => {
    expect(resolvePtrBandVariantForViewport(599)).toBe("default");
    expect(resolvePtrBandVariantForViewport(600)).toBe("tablet");
  });

  it("source check: type, size, resolution after crop, ratio flag", () => {
    expect(checkPtrBandSource({ variant: "default", mime: "image/gif", bytes: 10, width: 1280, height: 320 })).toEqual({ ok: false, error: "type_invalid" });
    expect(checkPtrBandSource({ variant: "default", mime: "image/png", bytes: 9 * 1024 * 1024, width: 1280, height: 320 })).toEqual({ ok: false, error: "too_large" });
    expect(checkPtrBandSource({ variant: "default", mime: "image/png", bytes: 10, width: 800, height: 200 })).toEqual({ ok: false, error: "too_small" });
    expect(checkPtrBandSource({ variant: "default", mime: "image/png", bytes: 10, width: 1280, height: 320 })).toEqual({ ok: true, ratioOk: true });
    // 1200×1200 → 가운데 4:1 자르면 1200×300 (최소 960×240 충족) — 비율 불일치 표시
    expect(checkPtrBandSource({ variant: "default", mime: "image/jpeg", bytes: 10, width: 1200, height: 1200 })).toEqual({ ok: true, ratioOk: false });
    expect(centerCropBoxToPtrBand(1200, 1200, "default")).toEqual({ left: 0, top: 450, width: 1200, height: 300 });
  });

  it("layout: phone 360 is height-locked 106 with side crop; 430 covers width", () => {
    const l360 = computePtrBandLayout({ variant: "default", frameWidthPx: 360, slotHeightPx: DIBAY_PTR_MAX_PX });
    expect(l360.imageHeightPx).toBe(DIBAY_PTR_MAX_PX);
    expect(l360.imageWidthPx).toBe(424);
    expect(l360.offsetLeftPx).toBe(-32);
    expect(l360.visible.x0).toBeCloseTo(32 / 424, 5);
    const l430 = computePtrBandLayout({ variant: "default", frameWidthPx: 430, slotHeightPx: DIBAY_PTR_THRESHOLD_PX });
    expect(l430.imageWidthPx).toBe(430);
    expect(l430.offsetLeftPx).toBe(0);
    // 슬롯 58 → 위아래 대칭으로 가려짐
    expect(l430.visible.y0).toBeGreaterThan(0);
    expect(l430.visible.y1).toBeCloseTo(1 - l430.visible.y0, 6);
  });

  it("layout: tablet 1024 keeps 106 height with side fill; 600 crops sides", () => {
    const wide = computePtrBandLayout({ variant: "tablet", frameWidthPx: 1024, slotHeightPx: 80 });
    expect(wide.imageWidthPx).toBe(848);
    expect(wide.sideFillPx).toBe(88);
    const narrow = computePtrBandLayout({ variant: "tablet", frameWidthPx: 600, slotHeightPx: 80 });
    expect(narrow.sideFillPx).toBe(0);
    expect(narrow.visible.x0).toBeGreaterThan(0.14);
    // 안전영역 바깥 경계(16%)는 600 폭에서도 보임
    expect(narrow.visible.x0).toBeLessThan(PTR_BAND_SPECS.tablet.safeZones[0]!.x0);
  });

  it("zones partition the band without overlap (key copy · status · chrome)", () => {
    for (const v of ["default", "tablet"] as const) {
      const spec = PTR_BAND_SPECS[v];
      const key = spec.safeZones[0]!;
      expect(key.x1).toBeLessThanOrEqual(spec.statusZone!.x0);
      expect(spec.statusZone!.x1).toBeLessThanOrEqual(spec.chromeZone!.x0);
    }
  });

  it("phone key + chrome zones stay visible at 360 (narrowest)", () => {
    const l = computePtrBandLayout({ variant: "default", frameWidthPx: 360, slotHeightPx: DIBAY_PTR_THRESHOLD_PX });
    for (const z of [...PTR_BAND_SPECS.default.safeZones, PTR_BAND_SPECS.default.chromeZone!]) {
      expect(z.x0).toBeGreaterThanOrEqual(l.visible.x0);
      expect(z.x1).toBeLessThanOrEqual(l.visible.x1);
      expect(z.y0).toBeGreaterThanOrEqual(l.visible.y0 - 1e-3);
      expect(z.y1).toBeLessThanOrEqual(l.visible.y1 + 1e-3);
    }
  });
});

describe("PTR reveal — resolver scope separation", () => {
  it("popup resolver never returns a ptr_reveal campaign (even with higher priority)", () => {
    const r = resolvePopupAd({ pathname: "/market", now: NOW, candidates: [ptr("p1"), popup("m1")] });
    expect(r.ok && r.winner?.campaignId).toBe("m1");
    const only = resolvePopupAd({ pathname: "/market", now: NOW, candidates: [ptr("p1")] });
    expect(only.ok && only.winner).toBeNull();
  });

  it("ptr scope never returns a popup campaign", () => {
    const s = selectPlatformPopupEligibleWinner({ pathname: "/market", now: NOW, candidates: [popup("m1")] }, "ptr_reveal");
    expect(s.winner).toBeNull();
    const s2 = selectPlatformPopupEligibleWinner({ pathname: "/market", now: NOW, candidates: [popup("m1"), ptr("p1")] }, "ptr_reveal");
    expect(s2.winner?.id).toBe("p1");
  });

  it("popup campaign carrying a ptr_band creative is skipped by both scopes", () => {
    const bad = popup("m2", { creative: { id: "x", status: "ready", aspectW: 4, aspectH: 1, creativeMode: "ptr_band" } });
    expect(resolvePopupAd({ pathname: "/market", now: NOW, candidates: [bad] }).ok).toBe(true);
    expect((resolvePopupAd({ pathname: "/market", now: NOW, candidates: [bad] }) as { winner: unknown }).winner).toBeNull();
    expect(selectPlatformPopupEligibleWinner({ pathname: "/market", now: NOW, candidates: [bad] }, "ptr_reveal").winner).toBeNull();
  });

  it("messenger and call surfaces excluded", () => {
    expect(selectPlatformPopupEligibleWinner({ pathname: "/community-messenger", now: NOW, candidates: [ptr("p1")] }, "ptr_reveal").winner).toBeNull();
    expect(
      selectPlatformPopupEligibleWinner({ pathname: "/market", now: NOW, criticalUi: { callActive: true }, candidates: [ptr("p1")] }, "ptr_reveal").winner
    ).toBeNull();
  });

  it("frequency suppression reuses campaign records", () => {
    const suppressed = ptr("p1", {
      suppressions: [{ mode: "CAMPAIGN", sessionKey: null, suppressUntil: null, campaignRevision: null, timezone: null, createdAt: NOW.toISOString() }],
    });
    expect(selectPlatformPopupEligibleWinner({ pathname: "/market", now: NOW, candidates: [suppressed] }, "ptr_reveal").winner).toBeNull();
  });
});

describe("PTR reveal — payload", () => {
  it("requires phone band; tablet/logo optional; wrong aspect dropped", () => {
    const c = ptr("p1", {
      ptrBands: {
        default: { id: "d", assetUrl: "https://cdn.example/d.webp", assetPath: null, altText: "alt", aspectW: 4, aspectH: 1 },
        tablet: { id: "t", assetUrl: "https://cdn.example/t.webp", assetPath: null, altText: null, aspectW: 4, aspectH: 1 },
      },
      frequencyMode: "once_per_day",
    });
    const ad = buildPtrRevealAdPayload(c, { href: "/market", surface: "TRADE" });
    expect(ad?.bands.default.imageUrl).toBe("https://cdn.example/d.webp");
    expect(ad?.bands.tablet).toBeNull();
    expect(ad?.bands.logo).toBeNull();
    expect(ad?.frequencyMode).toBe("once_per_day");
    expect(buildPtrRevealAdPayload(ptr("p2", { ptrBands: {} }), { href: "/market", surface: "TRADE" })).toBeNull();
  });
});

describe("PTR reveal — approval gate", () => {
  const base = {
    name: "n",
    status: "draft" as const,
    approvalStatus: "not_submitted" as const,
    priority: 0,
    startAt: null,
    endAt: null,
    timezone: "Asia/Manila",
    suppressionMode: "SESSION" as const,
    suppressionDurationSeconds: null,
    ctaType: "internal_page" as const,
    ctaTarget: "/market",
    externalUrl: null,
    surfaces: ["GLOBAL" as const],
  };
  it("ptr_reveal needs a ptr_band creative; popup rejects ptr_band", () => {
    const band = { id: "c", status: "ready", aspectW: 4, aspectH: 1, creativeMode: "ptr_band", assetPath: "a", assetUrl: null };
    const card = { id: "c", status: "ready", aspectW: 36, aspectH: 25, creativeMode: "card", assetPath: "a", assetUrl: null };
    expect(validatePlatformPopupCampaignForApproval({ ...base, presentationType: "ptr_reveal", creative: band }).ok).toBe(true);
    expect(validatePlatformPopupCampaignForApproval({ ...base, presentationType: "ptr_reveal", creative: card })).toMatchObject({ ok: false, errors: ["creative_mode_presentation_mismatch"] });
    expect(validatePlatformPopupCampaignForApproval({ ...base, presentationType: "center_modal", creative: band })).toMatchObject({ ok: false });
    // 기존 팝업 스냅샷(presentationType 없음) 동작 불변
    expect(validatePlatformPopupCampaignForApproval({ ...base, creative: card }).ok).toBe(true);
  });
});

describe("PTR reveal — creative pipeline (sharp)", () => {
  async function png(w: number, h: number): Promise<Buffer> {
    return sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 60, b: 200 } } }).png().toBuffer();
  }

  it("exact 4:1 → 1280×320 WebP", async () => {
    const r = await processPlatformPopupCreativeToCanonical({ buffer: await png(1600, 400), width: 1600, height: 400, applyCenterCrop: false, creativeMode: "ptr_band", ptrBandVariant: "default" });
    expect(r).toMatchObject({ ok: true, width: 1280, height: 320, creativeMode: "ptr_band", cropped: false });
    if (r.ok) {
      const meta = await sharp(r.buffer).metadata();
      expect(meta.format).toBe("webp");
      expect([meta.width, meta.height]).toEqual([1280, 320]);
    }
  });

  it("wrong ratio → needs_crop with proposal; confirmed crop → tablet 2560×320", async () => {
    const buf = await png(2400, 600);
    const r = await processPlatformPopupCreativeToCanonical({ buffer: buf, width: 2400, height: 600, applyCenterCrop: false, creativeMode: "ptr_band", ptrBandVariant: "tablet" });
    expect(r).toMatchObject({ ok: false, error: "needs_crop", proposedCrop: { left: 0, top: 150, width: 2400, height: 300 } });
    const c = await processPlatformPopupCreativeToCanonical({ buffer: buf, width: 2400, height: 600, applyCenterCrop: true, creativeMode: "ptr_band", ptrBandVariant: "tablet" });
    expect(c).toMatchObject({ ok: true, width: 2560, height: 320, cropped: true });
  });

  it("card pipeline unchanged when creativeMode omitted", async () => {
    const r = await processPlatformPopupCreativeToCanonical({ buffer: await png(1440, 1000), width: 1440, height: 1000, applyCenterCrop: false });
    expect(r).toMatchObject({ ok: true, width: 1440, height: 1000, creativeMode: "card" });
  });
});
