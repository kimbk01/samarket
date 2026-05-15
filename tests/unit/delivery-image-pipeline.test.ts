import { describe, expect, it } from "vitest";
import {
  canUseNextImageOptimizer,
  normalizeDeliveryImageSrc,
} from "@/lib/dibay/delivery-image-pipeline";

describe("delivery-image-pipeline", () => {
  it("normalizes protocol-relative URLs", () => {
    expect(normalizeDeliveryImageSrc("//cdn.example.com/a.jpg")).toBe(
      "https://cdn.example.com/a.jpg"
    );
    expect(normalizeDeliveryImageSrc("  ")).toBeNull();
  });

  it("detects next/image eligible sources", () => {
    expect(canUseNextImageOptimizer("https://x.supabase.co/storage/v1/object/public/a.png")).toBe(
      true
    );
    expect(canUseNextImageOptimizer("data:image/png;base64,abc")).toBe(false);
  });
});
