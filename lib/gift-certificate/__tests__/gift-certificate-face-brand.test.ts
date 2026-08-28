import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DIBAY gift certificate brand face", () => {
  it("uses fixed 1600x950 SVG, canonical PNG logo, visual model SSOT", () => {
    const svg = readFileSync(resolve(process.cwd(), "components/gift-certificate/DibayGiftCertificateSvg.tsx"), "utf8");
    const card = readFileSync(resolve(process.cwd(), "components/gift-certificate/GiftVisualCard.tsx"), "utf8");
    const paths = readFileSync(resolve(process.cwd(), "lib/brand/brand-asset-paths.ts"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "lib/gift-certificate/gift-visual-layout.ts"), "utf8");
    const model = readFileSync(resolve(process.cwd(), "lib/gift-certificate/gift-certificate-visual-model.ts"), "utf8");

    expect(paths).toContain('DIBAY_LOGO_MARK_PATH = "/images/brand/dibay-logo-mark.png"');
    expect(existsSync(resolve(process.cwd(), "public/images/brand/dibay-logo-mark.png"))).toBe(true);
    expect(svg).toContain("const VB_W = 1600");
    expect(card).toContain("buildGiftCertificateVisualModel");
    expect(model).toContain("validity: GiftCertificateVisualValidity | null");
    expect(model).toContain("formatGiftValidityRange");
    expect(svg).toContain('data-gift-validity-rendered="0"');
    expect(layout).toContain('GIFT_CERT_ASPECT_RATIO = "1600 / 950"');
  });
});
