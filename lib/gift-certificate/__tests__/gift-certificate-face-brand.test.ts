import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("DIBAY gift certificate brand face", () => {
  it("uses canonical transparent mark and live value data — no gift-box SVG, no logo redraw", () => {
    const face = source("components/gift-certificate/DibayGiftCertificateFace.tsx");
    const card = source("components/gift-certificate/GiftVisualCard.tsx");
    const paths = source("lib/brand/brand-asset-paths.ts");
    const layout = source("lib/gift-certificate/gift-visual-layout.ts");
    const detail = source("components/gift-certificate/BuyerGiftDetailView.tsx");

    expect(paths).toContain('DIBAY_LOGO_MARK_PATH = "/images/brand/dibay-logo-mark.png"');
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-auth-logo.png"))).toBe(true);

    expect(face).toContain("DIBAY_LOGO_MARK_PATH");
    expect(face).toContain('data-gift-dibay-logo="1"');
    expect(face).not.toContain("<svg");
    expect(face).not.toContain("strokeDasharray");
    expect(face).not.toMatch(/path d=/);
    expect(face).not.toContain("lucide");
    expect(face).not.toContain("GiftIcon");

    expect(card).toContain("DibayGiftCertificateFace");
    expect(card).toContain("formatMoneyPhp(face)");
    expect(card).toContain("formatMoneyPhp(purchase)");
    expect(card).toContain('data-gift-face-amount="1"');
    expect(card).toContain('data-gift-purchase-amount="1"');
    expect(card).not.toContain("GiftHeroArtwork");
    expect(card).not.toContain("DibayPlatformGiftFallback");
    expect(card).not.toContain("line-through");

    expect(layout).toContain('aspect-[1.65/1]');

    expect(detail).toContain('data-gift-detail-buy-cta="1"');
    expect(detail).toContain("fullWidth");
    expect(detail).toContain("product.faceValue");
    expect(detail).toContain("product.purchasePrice");

    expect(existsSync(resolve(process.cwd(), "components/gift-certificate/DibayPlatformGiftFallback.tsx"))).toBe(
      false
    );
    expect(existsSync(resolve(process.cwd(), "components/gift-certificate/GiftHeroArtwork.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "components/gift-certificate/StoreGiftFallback.tsx"))).toBe(false);
  });
});
