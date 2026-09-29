import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processGifB2 } from "@/lib/intro/media/processor/gif-b2";
import { processStaticImage } from "@/lib/intro/media/processor/static";
import { identifySourceBytes, IdentifiedFormat } from "@/lib/intro/media/identify";
import { integrityOf, sha256Hex } from "@/lib/intro/media/integrity";
import { GifForbiddenPath, GifProcessingPath } from "@/lib/intro/contracts/gif";
import { PROCESS_RECIPE } from "@/lib/intro/media/paths";

const GIF_DIR = join(process.cwd(), "fixtures/intro/gif");

describe("Phase 3 — local C-R1 processor", () => {
  it("keeps cgif encode forbidden and B2 path selected", () => {
    expect(GifForbiddenPath.SHARP_CGIF_ENCODE).toBe("SHARP_CGIF_ENCODE");
    expect(GifProcessingPath.B2_SHARP_PAGES_OMGGIF_ENCODE).toBe(
      "B2_SHARP_PAGES_OMGGIF_ENCODE",
    );
    expect(PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1).toBe("GIF_B2_SHARP_OMGGIF_V1");
  });

  it("fixture 05: 3 frames, 120/120/120, distinct visual states, deterministic", async () => {
    const src = readFileSync(join(GIF_DIR, "05_disposal_sensitive.gif"));
    const a = await processGifB2(src);
    const b = await processGifB2(src);
    expect(a.animationMetadata.frameCount).toBe(3);
    expect(a.animationMetadata.delaysMs).toEqual([120, 120, 120]);
    expect(a.animationMetadata.pageHashPrefixes).toEqual([
      "32d8f02d9c51",
      "869735cd4e96",
      "7055f6668fde",
    ]);
    expect(a.animationMetadata.encoder).toBe("omggif.GifWriter");
    expect(a.animationMetadata.forbiddenEncoder).toBe("cgif");
    expect(sha256Hex(a.bytes)).toBe(sha256Hex(b.bytes));
    expect(new Set(a.animationMetadata.pageHashPrefixes).size).toBe(3);
  });

  it("fixtures 01–04 process without static collapse", async () => {
    for (const id of [
      "01_normal_multiframe",
      "02_transparent",
      "03_looping",
      "04_varied_delay",
    ]) {
      const src = readFileSync(join(GIF_DIR, `${id}.gif`));
      const out = await processGifB2(src);
      expect(out.animationMetadata.frameCount).toBeGreaterThan(1);
      expect(out.animationMetadata.pageHashPrefixes.length).toBe(
        out.animationMetadata.frameCount,
      );
    }
  });

  it("fixture 03: sharp↔omggif loop round-trip preserves source loop", async () => {
    const src = readFileSync(join(GIF_DIR, "03_looping.gif"));
    const sourceMeta = await sharp(src, { animated: true }).metadata();
    const out = await processGifB2(src);
    const reread = await sharp(out.bytes, { animated: true }).metadata();
    expect(sourceMeta.loop).toBe(4);
    expect(out.animationMetadata.loop).toBe(4);
    expect(reread.loop).toBe(4);
  });

  it("identifies JPEG/PNG/WebP/GIF by bytes", async () => {
    const gif = readFileSync(join(GIF_DIR, "01_normal_multiframe.gif"));
    expect((await identifySourceBytes(gif)).format).toBe(IdentifiedFormat.GIF);

    const png = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const idPng = await identifySourceBytes(png);
    expect(idPng.format).toBe(IdentifiedFormat.PNG);
    expect(idPng.hasAlpha).toBe(true);

    const jpeg = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 0, g: 128, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();
    expect((await identifySourceBytes(jpeg)).format).toBe(IdentifiedFormat.JPEG);

    const webp = await sharp(png).webp().toBuffer();
    expect((await identifySourceBytes(webp)).format).toBe(IdentifiedFormat.WEBP);
  });

  it("static processing preserves alpha and applies orientation", async () => {
    const rgba = await sharp({
      create: {
        width: 16,
        height: 8,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.4 },
      },
    })
      .png()
      .toBuffer();
    const processed = await processStaticImage(rgba, IdentifiedFormat.PNG);
    expect(processed.hasAlpha).toBe(true);
    expect(processed.orientationApplied).toBe(true);
    expect(integrityOf(processed.bytes).startsWith("sha256:")).toBe(true);

    // Orientation 6 (90 CW): 20x10 pixels → after rotate becomes 10x20
    const base = await sharp({
      create: {
        width: 20,
        height: 10,
        channels: 3,
        background: { r: 200, g: 100, b: 50 },
      },
    })
      .jpeg()
      .toBuffer();
    // Inject Orientation=6 via sharp withWithMetadata
    const oriented = await sharp(base)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const out = await processStaticImage(oriented, IdentifiedFormat.JPEG);
    expect(out.width).toBe(10);
    expect(out.height).toBe(20);
  });
});
