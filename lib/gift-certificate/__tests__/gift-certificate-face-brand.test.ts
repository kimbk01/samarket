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
  it("locks measured 800×2280 long-ticket geometry and preserveAspect meet", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const paths = source("lib/brand/brand-asset-paths.ts");

    expect(GIFT_CERT_COORD_WIDTH).toBe(800);
    expect(GIFT_CERT_COORD_HEIGHT).toBe(2280);
    expect(GIFT_CERT_ASPECT_RATIO).toBe("20 / 57");
    expect(Math.abs(GIFT_CERT_ASPECT_RATIO_NUMBER - 20 / 57)).toBeLessThanOrEqual(0.001);

    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "20 / 57"');
    expect(layout).not.toContain('"5 / 3"');

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
    expect(face).not.toContain("data-gift-foot-serial");
    expect(face).not.toContain("TicketSerialMarks");
    expect(face).toContain("data-gift-giftable-strip");
    expect(face).toContain("data-gift-foot-brand");
    expect(face).toContain("DIBAY_LOGO_MARK_PATH");
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

  it("readable SVG type scale for ~338px cards (meta ≥ 28 units)", () => {
    expect(GIFT_PORTRAIT_TYPE.metaLabel).toBeGreaterThanOrEqual(28);
    expect(GIFT_PORTRAIT_TYPE.metaValue).toBeGreaterThanOrEqual(29);
    expect(GIFT_PORTRAIT_TYPE.title).toBeGreaterThanOrEqual(38);
    expect(GIFT_PORTRAIT_TYPE.amountValue).toBeGreaterThanOrEqual(76);
    expect(GIFT_PORTRAIT_TYPE.purchasePrice).toBeGreaterThanOrEqual(38);
    const scale = 338 / 800;
    expect(GIFT_PORTRAIT_TYPE.metaLabel * scale).toBeGreaterThanOrEqual(11.5);
    expect(GIFT_PORTRAIT_TYPE.title * scale).toBeGreaterThanOrEqual(16);
  });

  it("landmark zoning matches master geometry", () => {
    const h = GIFT_CERT_COORD_HEIGHT;
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY).toBe(640);
    expect(GIFT_PORTRAIT_LANDMARKS.titleY).toBe(805);
    expect(GIFT_PORTRAIT_LANDMARKS.amountY).toBe(1080);
    expect(GIFT_PORTRAIT_LANDMARKS.priceY).toBe(1240);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY).toBe(1405);
    expect(GIFT_PORTRAIT_LANDMARKS.issuerY).toBe(1530);
    expect(GIFT_PORTRAIT_LANDMARKS.expiryY).toBe(1640);
    expect(GIFT_PORTRAIT_LANDMARKS.numberY).toBe(1750);
    expect(GIFT_PORTRAIT_LANDMARKS.footerY).toBe(2027);
    expect(GIFT_PORTRAIT_LANDMARKS.giftableY).toBe(2080);
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY / h).toBeCloseTo(640 / 2280, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY / h).toBeCloseTo(1405 / 2280, 5);
  });

  it("outer scale sizes preserve identical aspect constant", () => {
    const widths = [360, 375, 390, 430, 768, 820, 1024, 1440];
    const maxDelta = 0.001;
    for (const w of widths) {
      const capped = Math.min(w, 420);
      const height = capped / GIFT_CERT_ASPECT_RATIO_NUMBER;
      const ratio = capped / height;
      expect(Math.abs(ratio - 20 / 57)).toBeLessThanOrEqual(maxDelta);
    }
  });
});
