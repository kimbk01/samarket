import { describe, expect, it } from "vitest";
import {
  collectPostRowImageUrls,
  diffRemovedImageUrls,
} from "@/lib/media/canonical-image-lifecycle.server";

const POST =
  "https://abc.supabase.co/storage/v1/object/public/post-images/u1/a.jpg";

describe("canonical-image-lifecycle", () => {
  it("collectPostRowImageUrls — dedupes canonical originals", () => {
    const urls = collectPostRowImageUrls({
      thumbnail_url: POST,
      images: [POST, "https://cdn.example.com/x.jpg"],
    });
    expect(urls).toEqual([POST]);
  });

  it("diffRemovedImageUrls — replace detection", () => {
    const next =
      "https://abc.supabase.co/storage/v1/object/public/post-images/u1/b.jpg";
    const removed = diffRemovedImageUrls([POST], [next]);
    expect(removed).toEqual([POST]);
  });
});
