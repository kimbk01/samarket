import { describe, expect, it } from "vitest";
import { buildPostImageThumbnailFetchUrl } from "@/lib/media/post-image-transform";

describe("buildPostImageThumbnailFetchUrl", () => {
  it("transforms post-images public URL to render endpoint", () => {
    const raw =
      "https://example.supabase.co/storage/v1/object/public/post-images/user1/community/a.jpg";
    const out = buildPostImageThumbnailFetchUrl(raw, 88);
    expect(out).toContain("/storage/v1/render/image/public/post-images/");
    expect(out).toContain("width=176");
    expect(out).toContain("resize=cover");
  });

  it("passes through external URLs unchanged", () => {
    const raw = "https://cdn.example.com/photo.jpg";
    expect(buildPostImageThumbnailFetchUrl(raw, 88)).toBe(raw);
  });
});
