import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { collectStickerAssetPublicPaths } from "@/lib/stickers/sticker-asset-contract-paths";

const root = path.resolve(__dirname, "../../..");

describe("collectStickerAssetPublicPaths", () => {
  it("lists 11 unique fallback sticker files", () => {
    const paths = collectStickerAssetPublicPaths();
    expect(paths.length).toBe(11);
    expect(new Set(paths).size).toBe(11);
    for (const p of paths) {
      expect(p.startsWith("/stickers/")).toBe(true);
      expect(p.endsWith(".webp")).toBe(true);
    }
  });

  it("matches committed public assets (contract with verify:sticker-assets-contract)", () => {
    for (const publicPath of collectStickerAssetPublicPaths()) {
      const disk = path.join(root, "public", publicPath.replace(/^\//, "").split("/").join(path.sep));
      expect(fs.existsSync(disk), `missing ${publicPath}`).toBe(true);
      expect(fs.statSync(disk).size).toBeGreaterThan(0);
    }
  });
});
