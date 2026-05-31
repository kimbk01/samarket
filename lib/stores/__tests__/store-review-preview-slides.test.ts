import { describe, expect, it } from "vitest";
import { buildStoreReviewPreviewSlides, starGlyphs } from "@/lib/stores/store-review-preview-slides";

describe("buildStoreReviewPreviewSlides", () => {
  it("리뷰 본문 있는 건만 슬라이드로 만든다", () => {
    const slides = buildStoreReviewPreviewSlides(
      [
        { id: "r1", rating: 5, content: "  맛있어요  ", product_id: "p1", image_urls: ["https://x/a.jpg"] },
        { id: "r2", rating: 4, content: "", product_id: null },
      ],
      [{ id: "p1", title: "짬뽕", thumbnail_url: "https://x/menu.jpg", is_representative: true }]
    );
    expect(slides).toHaveLength(1);
    expect(slides[0]?.reviewId).toBe("r1");
    expect(slides[0]?.thumbUrl).toBe("https://x/a.jpg");
    expect(slides[0]?.hasPhoto).toBe(true);
  });

  it("사진 없으면 메뉴 썸네일을 쓴다", () => {
    const slides = buildStoreReviewPreviewSlides(
      [{ id: "r1", rating: 5, content: "good", product_id: "p1", image_urls: [] }],
      [{ id: "p1", title: "T", thumbnail_url: "https://x/t.jpg", is_representative: false }]
    );
    expect(slides[0]?.thumbUrl).toBe("https://x/t.jpg");
  });

  it("starGlyphs", () => {
    expect(starGlyphs(3)).toBe("★★★");
  });
});
