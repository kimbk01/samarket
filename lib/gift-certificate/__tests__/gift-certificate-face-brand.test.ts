import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_ASPECT_RATIO_NUMBER,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { GIFT_PORTRAIT_LANDMARKS } from "@/components/gift-certificate/DibayGiftCertificateFace";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { giftMallShowsDiscountArrow } from "@/lib/gift-certificate/gift-certificate-visual-model";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate portrait face SSOT", () => {
  it("locks 800×1200 / 2:3 and preserveAspect meet — no landscape / cqw / none", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const paths = source("lib/brand/brand-asset-paths.ts");

    expect(GIFT_CERT_COORD_WIDTH).toBe(800);
    expect(GIFT_CERT_COORD_HEIGHT).toBe(1200);
    expect(GIFT_CERT_ASPECT_RATIO).toBe("2 / 3");
    expect(Math.abs(GIFT_CERT_ASPECT_RATIO_NUMBER - 2 / 3)).toBeLessThanOrEqual(0.001);

    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "2 / 3"');
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
    expect(giftMallShowsDiscountArrow(10000, 7000)).toBe(true);
    expect(giftMallShowsDiscountArrow(10000, 10000)).toBe(false);
    expect(giftMallShowsDiscountArrow(10000, null)).toBe(false);
  });

  it("landmark normalized Y are fixed fractions of 1200", () => {
    const h = GIFT_CERT_COORD_HEIGHT;
    expect(GIFT_PORTRAIT_LANDMARKS.heroBottomY / h).toBeCloseTo(320 / 1200, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.amountY / h).toBeCloseTo(520 / 1200, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.perforationY / h).toBeCloseTo(720 / 1200, 5);
    expect(GIFT_PORTRAIT_LANDMARKS.expiryY / h).toBeCloseTo(880 / 1200, 5);
  });

  it("outer scale sizes preserve identical aspect constant", () => {
    const widths = [360, 375, 390, 430, 768, 820, 1024, 1440];
    const maxDelta = 0.001;
    for (const w of widths) {
      const capped = Math.min(w, 420);
      const height = capped / GIFT_CERT_ASPECT_RATIO_NUMBER;
      const ratio = capped / height;
      expect(Math.abs(ratio - 2 / 3)).toBeLessThanOrEqual(maxDelta);
    }
  });
});
