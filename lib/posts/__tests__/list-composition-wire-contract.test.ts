import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("list composition wire (R5)", () => {
  it("post-list-preview-model forwards opts.fieldComposition into resolve", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/posts/post-list-preview-model.ts"), "utf8");
    expect(src).toContain("fieldComposition: opts.fieldComposition ?? null");
    expect(src).not.toMatch(
      /resolveTradeComposition\(\{\s*icon_key: inferredIcon,\s*fieldComposition: null,/
    );
  });

  it("PostListByCategory passes category.settings.field_composition to PostCard", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/post/PostListByCategory.tsx"),
      "utf8"
    );
    expect(src).toContain("category?.settings?.field_composition");
    expect(src).toContain("fieldComposition={fieldComposition}");
  });

  it("PostCard forwards fieldComposition into buildPostListPreviewModel", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostCard.tsx"), "utf8");
    expect(src).toContain("fieldComposition,");
    expect(src).toMatch(/buildPostListPreviewModel\([\s\S]*fieldComposition/);
  });
});
