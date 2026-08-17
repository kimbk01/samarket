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

  it("post-list-preview-model uses layoutVariant before legacy skin/meta heuristics", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/posts/post-list-preview-model.ts"), "utf8");
    expect(src).toContain('const allowMetaFallback = layoutVariant === "general-card" || !skinKey;');
    expect(src).not.toMatch(/skinKey === "(real-estate|rent-car|rental-car|used-car|jobs|job|exchange)"/);
  });

  it("PostListByCategory passes category.settings.field_composition to PostCard", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/post/PostListByCategory.tsx"),
      "utf8"
    );
    expect(src).toContain("category?.settings?.field_composition");
    expect(src).toContain("fieldComposition={fieldComposition}");
  });

  it("HomeProductList and FavoritePostCard pass composition via useTradeListCompositionMap", () => {
    const home = readFileSync(
      resolve(process.cwd(), "components/home/HomeProductList.tsx"),
      "utf8"
    );
    const fav = readFileSync(
      resolve(process.cwd(), "components/favorites/FavoritePostCard.tsx"),
      "utf8"
    );
    expect(home).toContain("useTradeListCompositionMap");
    expect(home).toContain("fieldComposition={composition?.fieldComposition}");
    expect(fav).toContain("useTradeListCompositionMap");
    expect(fav).toContain("fieldComposition={composition?.fieldComposition}");
  });

  it("PostCard forwards fieldComposition into buildPostListPreviewModel", () => {
    const src = readFileSync(resolve(process.cwd(), "components/post/PostCard.tsx"), "utf8");
    expect(src).toContain("fieldComposition,");
    expect(src).toMatch(/buildPostListPreviewModel\([\s\S]*fieldComposition/);
  });

  it("PostDetailRelatedSections passes composition map into related card preview", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/post/PostDetailRelatedSections.tsx"),
      "utf8"
    );
    expect(src).toContain("useTradeListCompositionMap");
    expect(src).toContain("fieldComposition: composition?.fieldComposition ?? null");
    expect(src).toContain("skinKey: composition?.skinKey");
    expect(src).toContain("propsForCategoryId(item.category_id)");
  });
});
