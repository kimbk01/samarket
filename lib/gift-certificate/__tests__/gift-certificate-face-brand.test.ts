import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_ASPECT_RATIO_NUMBER,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import {
  GIFT_MODERN_GEOMETRY,
  GIFT_PORTRAIT_LANDMARKS,
  GIFT_PORTRAIT_TYPE,
} from "@/components/gift-certificate/DibayGiftCertificateFace";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import {
  giftMallShowsDiscountArrow,
  giftShowsRemainingBalance,
} from "@/lib/gift-certificate/gift-certificate-visual-model";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate modern ticket visual SSOT", () => {
  it("locks Owner 640×360 ticket + left rail + notches + vertical perforation", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");

    expect(GIFT_CERT_COORD_WIDTH).toBe(640);
    expect(GIFT_CERT_COORD_HEIGHT).toBe(360);
    expect(GIFT_CERT_ASPECT_RATIO).toBe("640 / 360");
    expect(Math.abs(GIFT_CERT_ASPECT_RATIO_NUMBER - 640 / 360)).toBeLessThanOrEqual(0.001);
    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "640 / 360"');

    expect(GIFT_MODERN_GEOMETRY.railW).toBe(168);
    expect(GIFT_MODERN_GEOMETRY.notchR).toBe(24);
    expect(GIFT_MODERN_GEOMETRY.notchY).toBe(166);
    expect(+(GIFT_MODERN_GEOMETRY.railW / 640).toFixed(3)).toBeCloseTo(0.262, 2);

    expect(face).toContain('data-gift-cert-identity="modern-ticket"');
    expect(face).toContain('data-gift-brand-rail="1"');
    expect(face).toContain("data-gift-cert-perforation");
    expect(face).toContain("data-gift-meta-grid");
    expect(face).toContain("data-gift-platform-mark");
    expect(face).toContain("data-gift-store-logo");
    expect(face).toContain("data-gift-store-scope-notice");
    expect(face).toContain("ONE-TIME USE");
    expect(face).toContain("GIFT CERTIFICATE");
    expect(face).toContain("DIBAY BENEFIT");
    expect(face).toContain('data-gift-face-strike-line="1"');
    expect(face).toContain("data-gift-off-badge");
    expect(face).not.toContain("data-gift-remaining-amount");
    expect(face).not.toContain("Powered by DIBAY");
    expect(face).not.toContain("cqw");
    expect(face).not.toContain('preserveAspectRatio="none"');
    expect(GIFT_PORTRAIT_LANDMARKS.storeLogoSize).toBeGreaterThanOrEqual(64);
    expect(GIFT_PORTRAIT_LANDMARKS.platformMarkSize).toBeGreaterThanOrEqual(80);
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(
      true
    );
  });

  it("title wrap is deterministic", () => {
    const a = wrapGiftCertificateTitle("MAN-CHOO FOOD HUB GRAND OPENING GIFT CERTIFICATE");
    const b = wrapGiftCertificateTitle("MAN-CHOO FOOD HUB GRAND OPENING GIFT CERTIFICATE");
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(2);
  });

  it("discount / remaining money presentation contracts", () => {
    expect(giftMallShowsDiscountArrow(1000, 900)).toBe(true);
    expect(giftMallShowsDiscountArrow(1000, 1000)).toBe(false);
    expect(giftShowsRemainingBalance(1000, 880)).toBe(false);
  });

  it("keeps amount ≤ 2.2× title hierarchy", () => {
    expect(GIFT_PORTRAIT_TYPE.amountValue / GIFT_PORTRAIT_TYPE.title).toBeLessThanOrEqual(2.2);
    expect(GIFT_PORTRAIT_TYPE.amountValue / GIFT_PORTRAIT_TYPE.title).toBeGreaterThanOrEqual(1.6);
    expect(GIFT_PORTRAIT_TYPE.metaValue).toBeLessThan(GIFT_PORTRAIT_TYPE.purchaseValue);
  });

  it("body landmarks follow reference top→amount→purchase→meta flow", () => {
    expect(GIFT_PORTRAIT_LANDMARKS.badgeY).toBeLessThan(GIFT_PORTRAIT_LANDMARKS.titleY);
    expect(GIFT_PORTRAIT_LANDMARKS.titleY).toBeLessThan(GIFT_PORTRAIT_LANDMARKS.amountY);
    expect(GIFT_PORTRAIT_LANDMARKS.amountY).toBeLessThan(GIFT_PORTRAIT_LANDMARKS.purchaseY);
    expect(GIFT_PORTRAIT_LANDMARKS.purchaseY).toBeLessThan(GIFT_PORTRAIT_LANDMARKS.dividerY);
    expect(GIFT_PORTRAIT_LANDMARKS.dividerY).toBeLessThan(GIFT_PORTRAIT_LANDMARKS.metaValueY);
    expect("remainingY" in GIFT_PORTRAIT_LANDMARKS).toBe(false);
  });

  it("outer scales preserve identical aspect", () => {
    for (const w of [320, 390, 560]) {
      const h = w / GIFT_CERT_ASPECT_RATIO_NUMBER;
      expect(Math.abs(w / h - 640 / 360)).toBeLessThanOrEqual(0.001);
    }
  });
});
