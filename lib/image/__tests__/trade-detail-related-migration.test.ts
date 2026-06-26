import { describe, expect, it } from "vitest";
import {
  imageResolveTradePostDetailRelatedDisplayUrl,
  imageResolveTradePostDetailRelatedThumbRaw,
} from "@/lib/image";

const FULL_OBJECT =
  "https://abc.supabase.co/storage/v1/object/public/post-images/user1/related.jpg";
const EXTERNAL_RAW = "https://cdn.example.com/related-thumb.jpg";

function legacyItemThumb(item: {
  thumbnail_url?: string | null;
  images?: unknown;
}): string | null {
  if (typeof item.thumbnail_url === "string" && item.thumbnail_url.trim()) {
    return item.thumbnail_url.trim();
  }
  const firstImage = Array.isArray(item.images)
    ? item.images.find((u): u is string => typeof u === "string" && u.trim().length > 0)
    : null;
  return firstImage ?? null;
}

function legacyRelatedDisplayUrl(raw: string | null): string | null {
  if (!raw) return null;
  return raw;
}

describe("trade detail related image migration (PostDetailRelatedSections SSOT)", () => {
  it("thumb raw — prefers thumbnail_url", () => {
    const item = {
      thumbnail_url: `  ${FULL_OBJECT}  `,
      images: ["https://ignored.example/first.jpg"],
    };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBe(
      legacyItemThumb(item)
    );
  });

  it("thumb raw — first image when thumbnail empty", () => {
    const item = {
      thumbnail_url: "",
      images: ["", `  ${FULL_OBJECT}  `, "https://second.example/x.jpg"],
    };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBe(
      legacyItemThumb(item)
    );
  });

  it("thumb raw — null when no usable URL", () => {
    const item = { thumbnail_url: null, images: [] };
    expect(imageResolveTradePostDetailRelatedThumbRaw(item)).toBeNull();
  });

  it("display URL — byte-identical passthrough (full object)", () => {
    const adapter = imageResolveTradePostDetailRelatedDisplayUrl(FULL_OBJECT);
    const legacy = legacyRelatedDisplayUrl(FULL_OBJECT);
    expect(adapter).toBe(legacy);
    expect(adapter).toBe(FULL_OBJECT);
    expect(adapter).toContain("/object/public/post-images/");
    expect(adapter).not.toContain("/render/image/");
  });

  it("display URL — external URL passthrough", () => {
    expect(imageResolveTradePostDetailRelatedDisplayUrl(EXTERNAL_RAW)).toBe(
      legacyRelatedDisplayUrl(EXTERNAL_RAW)
    );
  });
});
