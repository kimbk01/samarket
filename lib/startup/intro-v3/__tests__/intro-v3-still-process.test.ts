import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX } from "@/lib/startup/intro-v3/media-policy";
import { processIntroV3StillBuffer } from "@/lib/startup/intro-v3/still-process.server";

async function jpegExif6(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 80, height: 160, channels: 3, background: { r: 200, g: 20, b: 20 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  return sharp(base).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toBuffer();
}

async function pngAlpha(): Promise<Buffer> {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 4,
      background: { r: 10, g: 180, b: 90, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
}

async function staticWebp(): Promise<Buffer> {
  return sharp({
    create: { width: 240, height: 160, channels: 3, background: { r: 30, g: 40, b: 200 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

async function largeStill(): Promise<Buffer> {
  return sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 12, g: 90, b: 40 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

describe("intro-v3 still Sharp pipeline", () => {
  it("rotates JPEG EXIF orientation and preserves aspect", async () => {
    const buffer = await jpegExif6();
    const result = await processIntroV3StillBuffer({
      buffer,
      sourceBytes: buffer.length,
      filename: "exif.jpg",
      mime: "image/jpeg",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceWidth).toBe(160);
    expect(result.sourceHeight).toBe(80);
    expect(result.width / result.height).toBeCloseTo(160 / 80, 2);
    expect(result.contentType).toBe("image/webp");
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(result.width);
    expect(meta.height).toBe(result.height);
  });

  it("preserves PNG alpha into WebP derivative", async () => {
    const buffer = await pngAlpha();
    const result = await processIntroV3StillBuffer({
      buffer,
      sourceBytes: buffer.length,
      filename: "alpha.png",
      mime: "image/png",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hasAlpha).toBe(true);
    expect(result.width).toBe(120);
    expect(result.height).toBe(80);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.hasAlpha).toBe(true);
  });

  it("accepts static WebP and emits STILL_RUNTIME WebP", async () => {
    const buffer = await staticWebp();
    const result = await processIntroV3StillBuffer({
      buffer,
      sourceBytes: buffer.length,
      filename: "still.webp",
      mime: "image/webp",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sourceFormat).toBe("webp");
    expect(result.contentType).toBe("image/webp");
    expect(result.width).toBe(240);
    expect(result.height).toBe(160);
  });

  it("fits a large-dimension still inside 1920 long-edge without 1080×1350 poster lock", async () => {
    const buffer = await largeStill();
    expect(Math.max(2400, 1600)).toBeGreaterThan(INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX);
    const result = await processIntroV3StillBuffer({
      buffer,
      sourceBytes: buffer.length,
      filename: "wide.jpg",
      mime: "image/jpeg",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.max(result.width, result.height)).toBe(INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX);
    expect(result.width / result.height).toBeCloseTo(2400 / 1600, 2);
    expect(result.width).not.toBe(1080);
    expect(result.height).not.toBe(1350);
    expect(result.bytes).toBeGreaterThan(1);
  });

  it("rejects GIF, HEIC names, and animated-looking sources", async () => {
    const gif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .gif()
      .toBuffer();
    const gifResult = await processIntroV3StillBuffer({
      buffer: gif,
      sourceBytes: gif.length,
      filename: "a.gif",
      mime: "image/gif",
    });
    expect(gifResult.ok).toBe(false);
    if (!gifResult.ok) expect(gifResult.error).toBe("unsupported_format");

    const jpeg = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const heicName = await processIntroV3StillBuffer({
      buffer: jpeg,
      sourceBytes: jpeg.length,
      filename: "a.heic",
      mime: "image/heic",
    });
    expect(heicName.ok).toBe(false);
    if (!heicName.ok) expect(heicName.error).toBe("unsupported_format");
  });
});
