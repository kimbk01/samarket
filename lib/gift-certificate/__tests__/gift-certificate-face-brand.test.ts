import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate brand face", () => {
  it("uses canonical transparent mark, comp layers, and live value data — no logo redraw", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const card = source("components/gift-certificate/GiftVisualCard.tsx");
    const paths = source("lib/brand/brand-asset-paths.ts");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const detail = source("components/gift-certificate/BuyerGiftDetailView.tsx");

    expect(paths).toContain('DIBAY_LOGO_MARK_PATH = "/images/brand/dibay-logo-mark.png"');
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(true);

    expect(face).toContain("DIBAY_LOGO_MARK_PATH");
    expect(face).toContain('data-gift-dibay-logo="1"');
    expect(face).toContain('data-gift-cert-top-badge="1"');
    expect(face).toContain('data-gift-cert-s-curve="1"');
    expect(face).toContain('data-gift-cert-value-panel="1"');
    expect(face).toContain('data-gift-cert-footer="1"');

    expect(card).toContain('data-gift-gold-divider="1"');
    expect(card).toContain("formatMoneyPhp(face)");
    expect(card).toContain("formatMoneyPhp(purchase)");
    expect(layout).toContain('aspect-[1.65/1]');
    expect(detail).toContain('data-gift-detail-buy-cta="1"');
  });
});
