import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_ASPECT_RATIO_NUMBER,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { GIFT_PORTRAIT_LANDMARKS, GIFT_PORTRAIT_TYPE } from "@/components/gift-certificate/DibayGiftCertificateFace";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { giftMallShowsDiscountArrow, giftShowsRemainingBalance } from "@/lib/gift-certificate/gift-certificate-visual-model";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate portrait face SSOT", () => {
  it("locks RESET 800×1120 5:7 geometry and preserveAspect meet", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const paths = source("lib/brand/brand-asset-paths.ts");

    expect(GIFT_CERT_COORD_WIDTH).toBe(800);
    expect(GIFT_CERT_COORD_HEIGHT).toBe(1120);
    expect(GIFT_CERT_ASPECT_RATIO).toBe("5 / 7");
    expect(Math.abs(GIFT_CERT_ASPECT_RATIO_NUMBER - 5 / 7)).toBeLessThanOrEqual(0.001);

    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "5 / 7"');
    expect(layout).not.toContain('"20 / 57"');

    expect(face).toContain(`viewBox={\`0 0 \${VB_W} \${VB_H}\`}`);
    expect(face).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(face).not.toContain('preserveAspectRatio="none"');
    expect(face).not.toContain("cqw");
    expect(face).not.toContain("cqh");
    expect(face).not.toContain("10vw");
    expect(face).not.toContain("gift-cert-footer");
    expect(face).not.toContain("디바이 상품권");
    expect(face).not.toContain("만료되지 않음");
    expect(face).not.toMatch(/\b(barcode|barCode)\b/);
    expect(face).not.toContain('|| "—"');
    expect(face).not.toContain("data-gift-foot-serial");
    expect(face).not.toContain("TicketSerialMarks");
    expect(face).not.toContain("data-gift-giftable-strip");
    expect(face).not.toContain("GiftableStrip");
    expect(face).toContain("data-gift-foot-brand");
    expect(face).toContain("DIBAY_LOGO_MARK_PATH");
    expect(face).toContain('data-gift-hero-identity-slot="1"');
    expect(face).not.toContain('preserveAspectRatio="xMidYMid slice"');
    expect(face).toContain("data-gift-cert-perforation");
    expect(face).toContain('data-gift-face-strike-line="1"');
    expect(face).toContain("GIFT_PORTRAIT_TYPE");
    expect(face).not.toContain("data-gift-remaining-amount");
    expect(face).toContain("data-gift-status-chip");
    expect(face).toContain("data-gift-cert-identity");

    expect(paths).toContain('DIBAY_LOGO_MARK_PATH = "/images/brand/dibay-logo-mark.png"');
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(true);
  });

  it("title wrap is deterministic (device-independent)", () => {
    const title = "MAN-CHOO FOOD HUB GRAND OPENING GIFT CERTIFICATE";
    const a = wrapGiftCertificateTitle(title);
    const b = wrapGiftCertificateTitle(title);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(2);
  });

  it("discount strike only when purchase < face; remaining never on customer face", () => {
    expect(giftMallShowsDiscountArrow(1000, 900)).toBe(true);
    expect(giftMallShowsDiscountArrow(1000, 1000)).toBe(false);
    expect(giftMallShowsDiscountArrow(1000, null)).toBe(false);
    expect(giftShowsRemainingBalance(1000, 1000)).toBe(false);
    expect(giftShowsRemainingBalance(1000, 880)).toBe(false);
    expect(giftShowsRemainingBalance(1000, null)).toBe(false);
  });

  it("meets rendered typography floors at sm=220 without amount dominance", () => {
    const scale = 220 / 800;
    expect(GIFT_PORTRAIT_TYPE.title * scale).toBeGreaterThanOrEqual(16);
    expect(GIFT_PORTRAIT_TYPE.amountValue * scale).toBeGreaterThanOrEqual(22);
    expect(GIFT_PORTRAIT_TYPE.amountValue * scale).toBeLessThan(28);
    expect(GIFT_PORTRAIT_TYPE.amountValue).toBeLessThan(GIFT_PORTRAIT_TYPE.title * 2);
    expect(GIFT_PORTRAIT_TYPE.purchasePrice * scale).toBeGreaterThanOrEqual(14);
    expect(GIFT_PORTRAIT_TYPE.metaLabel * scale).toBeGreaterThanOrEqual(12);
    expect(GIFT_PORTRAIT_TYPE.metaValue * scale).toBeGreaterThanOrEqual(12);
    expect(GIFT_PORTRAIT_TYPE.badge * scale).toBeGreaterThanOrEqual(11);
  });

  it("landmark zoning matches one-time certificate composition", () => {
    const h = GIFT_CERT_COORD_HEIGHT;
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY).toBe(292);
    expect(GIFT_PORTRAIT_LANDMARKS.titleY).toBe(412);
    expect(GIFT_PORTRAIT_LANDMARKS.amountY).toBe(598);
    expect("remainingY" in GIFT_PORTRAIT_LANDMARKS).toBe(false);
    expect(GIFT_PORTRAIT_LANDMARKS.priceY).toBe(708);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY).toBe(768);
    expect(GIFT_PORTRAIT_LANDMARKS.issuerY).toBe(836);
    expect(GIFT_PORTRAIT_LANDMARKS.expiryY).toBe(904);
    expect(GIFT_PORTRAIT_LANDMARKS.numberLabelY).toBe(952);
    expect(GIFT_PORTRAIT_LANDMARKS.numberValueY).toBe(1008);
    expect(GIFT_PORTRAIT_LANDMARKS.numberY).toBe(GIFT_PORTRAIT_LANDMARKS.numberLabelY);
    expect(GIFT_PORTRAIT_LANDMARKS.numberValueY - GIFT_PORTRAIT_LANDMARKS.numberLabelY).toBe(56);
    expect(GIFT_PORTRAIT_LANDMARKS.footerY).toBe(1070);
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY / h).toBeCloseTo(292 / 1120, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY / h).toBeCloseTo(768 / 1120, 5);
  });

  it("outer scale sizes preserve identical aspect constant", () => {
    const widths = [220, 296, 338, 340, 420];
    const maxDelta = 0.001;
    for (const w of widths) {
      const capped = Math.min(w, 420);
      const height = capped / GIFT_CERT_ASPECT_RATIO_NUMBER;
      const ratio = capped / height;
      expect(Math.abs(ratio - 5 / 7)).toBeLessThanOrEqual(maxDelta);
    }
    expect(220 / GIFT_CERT_ASPECT_RATIO_NUMBER).toBe(308);
    expect(296 / GIFT_CERT_ASPECT_RATIO_NUMBER).toBeCloseTo(414.4, 5);
    expect(338 / GIFT_CERT_ASPECT_RATIO_NUMBER).toBeCloseTo(473.2, 5);
    expect(420 / GIFT_CERT_ASPECT_RATIO_NUMBER).toBe(588);
  });
});
