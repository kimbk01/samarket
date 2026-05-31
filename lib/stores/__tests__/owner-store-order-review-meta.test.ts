import { describe, expect, it } from "vitest";
import { mapOwnerStoreOrderReviewRow, normalizeOwnerStoreOrderReviewDetail } from "@/lib/stores/owner-store-order-review-meta";

describe("normalizeOwnerStoreOrderReviewDetail", () => {
  it("returns null for invalid payload", () => {
    expect(normalizeOwnerStoreOrderReviewDetail(null)).toBeNull();
    expect(normalizeOwnerStoreOrderReviewDetail({ rating: 5 })).toBeNull();
  });

  it("normalizes partial review payload safely", () => {
    const row = normalizeOwnerStoreOrderReviewDetail({
      id: "rev-1",
      rating: 5,
      content: "nice",
      image_urls: ["https://example.com/a.jpg"],
    });
    expect(row).toMatchObject({
      id: "rev-1",
      rating: 5,
      content: "nice",
      image_urls: ["https://example.com/a.jpg"],
    });
  });
});

describe("mapOwnerStoreOrderReviewRow", () => {
  it("maps owner review fields with defaults", () => {
    const row = mapOwnerStoreOrderReviewRow({
      id: "rev-1",
      rating: 4,
      content: "good",
      visible_to_public: true,
      image_urls: ["https://example.com/a.jpg"],
      item_feedback: { "line-1": "up" },
      status: "visible",
      created_at: "2026-06-01T00:00:00Z",
      owner_reply_content: null,
      owner_reply_created_at: null,
    });

    expect(row).toMatchObject({
      id: "rev-1",
      rating: 4,
      content: "good",
      image_urls: ["https://example.com/a.jpg"],
      item_feedback: { "line-1": "up" },
      status: "visible",
    });
  });

  it("returns null without id", () => {
    expect(mapOwnerStoreOrderReviewRow({ rating: 5, content: "x" })).toBeNull();
  });
});
