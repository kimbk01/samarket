import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  PRODUCT_INTRO_CANONICAL_HEIGHT_PX,
  PRODUCT_INTRO_CANONICAL_WIDTH_PX,
  PRODUCT_INTRO_MAX_OUTPUT_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_BYTES,
  PRODUCT_INTRO_OUTPUT_QUALITY,
} from "@/lib/startup/product-intro-geometry";
import { optimizeProductIntroCreativeBuffer } from "@/lib/startup/product-intro-optimize.server";

describe("product-intro-optimize.server", () => {
  it("locks source/output contract split (not a blind 2MB reject)", () => {
    expect(PRODUCT_INTRO_MAX_SOURCE_BYTES).toBe(8 * 1024 * 1024);
    expect(PRODUCT_INTRO_MAX_OUTPUT_BYTES).toBe(1024 * 1024);
    expect(PRODUCT_INTRO_OUTPUT_QUALITY).toBe(88);
    expect(PRODUCT_INTRO_CANONICAL_WIDTH_PX).toBe(1080);
    expect(PRODUCT_INTRO_CANONICAL_HEIGHT_PX).toBe(1350);
  });

  it("optimizes the Owner oversize PNG fixture to canonical WebP under output max", async () => {
    const fixturePath = resolve(
      process.cwd(),
      ".tmp/first-entry-oversize/owner-failed.png"
    );
    let source: Buffer;
    try {
      source = readFileSync(fixturePath);
    } catch {
      // CI without local Owner fixture: synthesize an inefficient >2MB near-4:5 PNG.
      source = await sharp({
        create: {
          width: 1122,
          height: 1402,
          channels: 3,
          background: { r: 20, g: 90, b: 40 },
        },
      })
        .png({ compressionLevel: 0 })
        .toBuffer();
    }

    expect(source.length).toBeGreaterThan(2 * 1024 * 1024);

    const result = await optimizeProductIntroCreativeBuffer({
      buffer: source,
      sourceBytes: source.length,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.contentType).toBe("image/webp");
    // V2: aspect preserved inside 1080×1350 box (no force-fill crop).
    expect(result.width).toBeLessThanOrEqual(PRODUCT_INTRO_CANONICAL_WIDTH_PX);
    expect(result.height).toBeLessThanOrEqual(PRODUCT_INTRO_CANONICAL_HEIGHT_PX);
    expect(result.width / result.height).toBeCloseTo(result.sourceWidth / result.sourceHeight, 2);
    expect(result.outputBytes).toBeLessThanOrEqual(PRODUCT_INTRO_MAX_OUTPUT_BYTES);
    expect(result.outputBytes).toBeLessThan(source.length);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(result.width);
    expect(meta.height).toBe(result.height);
  });
});
