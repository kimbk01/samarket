import { describe, expect, it } from "vitest";
import {
  isCommunityMessengerStickerPublicPath,
  normalizeCommunityMessengerStickerContent,
} from "@/lib/stickers/sticker-content";

describe("normalizeCommunityMessengerStickerContent", () => {
  it("accepts fallback basic webp path", () => {
    expect(normalizeCommunityMessengerStickerContent("/stickers/packs/basic/1f600.webp")).toBe(
      "/stickers/packs/basic/1f600.webp"
    );
  });

  it("rejects arbitrary URLs and path traversal", () => {
    expect(normalizeCommunityMessengerStickerContent("https://evil.example/x.webp")).toBeNull();
    expect(normalizeCommunityMessengerStickerContent("/stickers/../etc/passwd")).toBeNull();
    expect(normalizeCommunityMessengerStickerContent("/stickers/packs/basic/1f600.png")).toBe(
      "/stickers/packs/basic/1f600.png"
    );
    expect(normalizeCommunityMessengerStickerContent("  /stickers/packs/basic/1f600.webp  ")).toBe(
      "/stickers/packs/basic/1f600.webp"
    );
  });

  it("rejects empty and non-sticker paths", () => {
    expect(normalizeCommunityMessengerStickerContent("")).toBeNull();
    expect(normalizeCommunityMessengerStickerContent("😀")).toBeNull();
  });
});

describe("isCommunityMessengerStickerPublicPath", () => {
  it("detects sticker static paths only", () => {
    expect(isCommunityMessengerStickerPublicPath("/stickers/packs/basic/1f600.webp")).toBe(true);
    expect(isCommunityMessengerStickerPublicPath("/avatars/u1.webp")).toBe(false);
  });
});
