import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate brand face", () => {
  it("uses fixed 1600x960 comp, canonical PNG logo, cqw typography — no logo SVG", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const card = source("components/gift-certificate/GiftVisualCard.tsx");
    const paths = source("lib/brand/brand-asset-paths.ts");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const detail = source("components/gift-certificate/BuyerGiftDetailView.tsx");

    expect(paths).toContain('DIBAY_LOGO_MARK_PATH = "/images/brand/dibay-logo-mark.png"');
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(true);

    expect(face).toContain("viewBox=\"0 0 1600 960\"");
    expect(face).toContain('data-gift-cert-face="1"');
    expect(face).toContain("containerType: \"inline-size\"");
    expect(face).toContain('data-gift-cert-artwork');
    expect(face).toContain('data-gift-dibay-logo="1"');
    expect(face).toContain('data-gift-cert-top-badge="1"');
    expect(face).toContain('data-gift-cert-s-curve="1"');
    expect(face).toContain('data-gift-cert-value-panel="1"');
    expect(face).toContain('data-gift-cert-footer="1"');
    expect(face).toContain('data-gift-gold-divider="1"');
    expect(face).toContain("formatMoneyPhp(face)");
    expect(face).toContain("7.0cqw");
    expect(face).not.toContain("10vw");
    expect(face).not.toContain("clamp(");

    expect(card).not.toContain("clamp(");
    expect(card).not.toContain("10vw");
    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "5 / 3"');
    expect(detail).toContain('data-gift-detail-buy-cta="1"');
  });
});
