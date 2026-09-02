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
import { giftMallShowsDiscountArrow } from "@/lib/gift-certificate/gift-certificate-visual-model";

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

  it("mall discount arrow only when purchase < face", () => {
    expect(giftMallShowsDiscountArrow(1000, 900)).toBe(true);
    expect(giftMallShowsDiscountArrow(1000, 1000)).toBe(false);
    expect(giftMallShowsDiscountArrow(1000, null)).toBe(false);
  });

  it("meets rendered typography floors at sm=220", () => {
    const scale = 220 / 800;
    expect(GIFT_PORTRAIT_TYPE.title * scale).toBeGreaterThanOrEqual(16);
    expect(GIFT_PORTRAIT_TYPE.amountValue * scale).toBeGreaterThanOrEqual(30);
    expect(GIFT_PORTRAIT_TYPE.purchasePrice * scale).toBeGreaterThanOrEqual(16);
    expect(GIFT_PORTRAIT_TYPE.metaLabel * scale).toBeGreaterThanOrEqual(12);
    expect(GIFT_PORTRAIT_TYPE.metaValue * scale).toBeGreaterThanOrEqual(12);
    expect(GIFT_PORTRAIT_TYPE.badge * scale).toBeGreaterThanOrEqual(11);
  });

  it("landmark zoning matches master geometry", () => {
    const h = GIFT_CERT_COORD_HEIGHT;
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY).toBe(300);
    expect(GIFT_PORTRAIT_LANDMARKS.titleY).toBe(430);
    expect(GIFT_PORTRAIT_LANDMARKS.amountY).toBe(642);
    expect(GIFT_PORTRAIT_LANDMARKS.priceY).toBe(730);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY).toBe(770);
    expect(GIFT_PORTRAIT_LANDMARKS.issuerY).toBe(840);
    expect(GIFT_PORTRAIT_LANDMARKS.expiryY).toBe(914);
    expect(GIFT_PORTRAIT_LANDMARKS.numberLabelY).toBe(960);
    expect(GIFT_PORTRAIT_LANDMARKS.numberValueY).toBe(1018);
    expect(GIFT_PORTRAIT_LANDMARKS.numberY).toBe(GIFT_PORTRAIT_LANDMARKS.numberLabelY);
    expect(GIFT_PORTRAIT_LANDMARKS.numberValueY - GIFT_PORTRAIT_LANDMARKS.numberLabelY).toBe(58);
    expect(GIFT_PORTRAIT_LANDMARKS.footerY).toBe(1072);
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY / h).toBeCloseTo(300 / 1120, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY / h).toBeCloseTo(770 / 1120, 5);
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
