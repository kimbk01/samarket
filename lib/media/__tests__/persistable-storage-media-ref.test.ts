import { describe, expect, it } from "vitest";
import {
  filterPersistableStorageMediaRefs,
  isPersistableStorageMediaRef,
} from "@/lib/media/persistable-storage-media-ref";
import { resolvePostImagePublicUrl } from "@/lib/posts/resolve-post-image-public-url";
import { normalizePostImages } from "@/lib/posts/post-normalize";
import { resolveCanonicalFeedImageUrl } from "@/lib/media/canonical-image-resolver";

describe("persistable storage media ref", () => {
  it("rejects blob/localhost/undefined/empty keys", () => {
    expect(isPersistableStorageMediaRef("blob:http://localhost:3000/ab6d510b-2df8-46a1-847d-1e4bdf7b5cc4")).toBe(
      false
    );
    expect(isPersistableStorageMediaRef("http://localhost:3000/x.jpg")).toBe(false);
    expect(isPersistableStorageMediaRef("undefined")).toBe(false);
    expect(isPersistableStorageMediaRef("")).toBe(false);
    expect(isPersistableStorageMediaRef("file:///tmp/a.jpg")).toBe(false);
  });

  it("allows https public and bucket-relative paths", () => {
    expect(
      isPersistableStorageMediaRef(
        "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/u/a.jpg"
      )
    ).toBe(true);
    expect(isPersistableStorageMediaRef("u1/community/a.jpg")).toBe(true);
  });

  it("resolvePostImagePublicUrl does not prefix blob onto storage", () => {
    expect(
      resolvePostImagePublicUrl("blob:http://localhost:3000/ab6d510b-2df8-46a1-847d-1e4bdf7b5cc4")
    ).toBe("");
    const kept =
      "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/u/a.jpg";
    expect(resolvePostImagePublicUrl(kept)).toBe(kept);
  });

  it("normalizePostImages drops blob and keeps persistable sibling", () => {
    expect(
      normalizePostImages([
        "blob:http://localhost:3000/ab6d510b-2df8-46a1-847d-1e4bdf7b5cc4",
        "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/u/a.jpg",
      ])
    ).toEqual(["https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/u/a.jpg"]);
    expect(filterPersistableStorageMediaRefs(["blob:x", ""])).toEqual([]);
  });

  it("does not invent feed derivatives for avif originals", () => {
    const avif =
      "https://abc.supabase.co/storage/v1/object/public/post-images/u1/1780912744922-0.avif";
    expect(resolveCanonicalFeedImageUrl(avif)).toBe(avif);
  });
});
