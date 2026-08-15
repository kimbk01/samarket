import { describe, expect, it } from "vitest";
import {
  isCustomerCenterRenderableMediaUrl,
  normalizeCustomerCenterHeroImageUrl,
} from "@/lib/notices/customer-center-media";
import { parseCustomerCenterSafeMarkdown } from "@/lib/notices/customer-center-safe-markdown";

describe("customer-center-media", () => {
  it("rejects empty / whitespace / javascript / data", () => {
    expect(isCustomerCenterRenderableMediaUrl(null)).toBe(false);
    expect(isCustomerCenterRenderableMediaUrl("")).toBe(false);
    expect(isCustomerCenterRenderableMediaUrl("   ")).toBe(false);
    expect(isCustomerCenterRenderableMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isCustomerCenterRenderableMediaUrl("data:image/png;base64,xx")).toBe(false);
  });

  it("rejects store-product-fallback placeholder even when absolute URL", () => {
    const placeholder =
      "https://samarket.vercel.app/images/common/store-product-fallback.svg";
    expect(isCustomerCenterRenderableMediaUrl(placeholder)).toBe(false);
    expect(normalizeCustomerCenterHeroImageUrl(placeholder)).toBeNull();
    expect(
      isCustomerCenterRenderableMediaUrl("/images/common/store-product-fallback.svg")
    ).toBe(false);
  });

  it("accepts real https media", () => {
    expect(isCustomerCenterRenderableMediaUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(normalizeCustomerCenterHeroImageUrl(" https://cdn.example.com/a.jpg ")).toBe(
      "https://cdn.example.com/a.jpg"
    );
  });

  it("markdown parser drops placeholder image blocks", () => {
    const blocks = parseCustomerCenterSafeMarkdown(
      [
        "## Title",
        "![body1](https://samarket.vercel.app/images/common/store-product-fallback.svg)",
        "![ok](https://cdn.example.com/real.png)",
      ].join("\n")
    );
    const images = blocks.filter((b) => b.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      type: "image",
      src: "https://cdn.example.com/real.png",
    });
  });
});
