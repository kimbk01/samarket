import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { collectStickerAssetPublicPaths } from "@/lib/stickers/sticker-asset-contract-paths";

const root = path.resolve(__dirname, "../../..");

describe("collectStickerAssetPublicPaths", () => {
  /** Twemoji 11개 + OpenMoji 7묶음 595개 (Owner 2026-11-16 「OpenMoji 로 진행」) */
  it("lists 606 unique sticker files (Twemoji 11 + OpenMoji 595)", () => {
    const paths = collectStickerAssetPublicPaths();
    expect(paths.length).toBe(606);
    expect(new Set(paths).size).toBe(606);
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
