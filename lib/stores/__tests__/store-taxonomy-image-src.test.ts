import { describe, expect, it } from "vitest";
import {
  resolveStoreTaxonomyImageSrc,
  storeTaxonomyImageObjectClass,
  storeTaxonomyUploadedImageUrl,
} from "@/lib/stores/store-taxonomy-image-src";

describe("store-taxonomy-image-src", () => {
  it("uploaded URL 우선", () => {
    expect(
      resolveStoreTaxonomyImageSrc("https://cdn.example/a.png", "/icons/food/icon_0_1.png")
    ).toBe("https://cdn.example/a.png");
  });

  it("업로드 없으면 폴백", () => {
    expect(resolveStoreTaxonomyImageSrc("", "/icons/mart/mart_0_1.png")).toBe("/icons/mart/mart_0_1.png");
  });

  it("빈 raw 는 미설정", () => {
    expect(storeTaxonomyUploadedImageUrl("  ")).toBe("");
    expect(storeTaxonomyUploadedImageUrl("https://x/y.png")).toBe("https://x/y.png");
  });

  it("object class 분기", () => {
    expect(storeTaxonomyImageObjectClass(true)).toContain("object-cover");
    expect(storeTaxonomyImageObjectClass(false)).toContain("object-contain");
  });
});

describe("store-taxonomy-thumbnail-ui", () => {
  it("고정 40px 프레임", async () => {
    const { STORE_TAXONOMY_THUMB_FRAME, storeTaxonomyThumbImgClass } = await import(
      "@/lib/stores/store-taxonomy-thumbnail-ui"
    );
    expect(STORE_TAXONOMY_THUMB_FRAME).toContain("h-10 w-10");
    expect(STORE_TAXONOMY_THUMB_FRAME).toContain("overflow-hidden");
    expect(STORE_TAXONOMY_THUMB_FRAME).not.toContain("border");
    expect(storeTaxonomyThumbImgClass(true)).toContain("object-cover");
    expect(storeTaxonomyThumbImgClass(true)).toContain("border-0");
  });
});
