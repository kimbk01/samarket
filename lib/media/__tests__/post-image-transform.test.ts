import { describe, expect, it } from "vitest";
import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";

describe("buildPostImageThumbnailFetchUrl", () => {
  it("transforms post-images public URL to feed derivative for 120px display", () => {
    const raw =
      "https://abc.supabase.co/storage/v1/object/public/post-images/u1/p1.jpg";
    const out = buildPostImageThumbnailFetchUrl(raw, 120);
    expect(out).toContain("/object/public/post-images/");
    expect(out).toContain(".feed.webp");
    expect(out).not.toContain("/render/image/");
  });

  it("passes through external URLs", () => {
    const raw = "https://cdn.example.com/a.jpg";
    expect(buildPostImageThumbnailFetchUrl(raw, 88)).toBe(raw);
  });
});
