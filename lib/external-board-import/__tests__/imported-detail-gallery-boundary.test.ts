import { describe, expect, it } from "vitest";
import { hasInterleavedMarkdownImageSyntax } from "@/lib/philife/interleaved-body-markdown";

/**
 * Mirrors CommunityPostDetailBody showImageGallery decision (imported-only hide featured gallery).
 */
function showImageGallery(input: {
  origin_kind?: string | null;
  content: string;
  images: string[];
  meeting?: boolean;
}): boolean {
  const isInterleavedBody = !input.meeting && hasInterleavedMarkdownImageSyntax(input.content);
  return (
    !isInterleavedBody &&
    input.images.length > 0 &&
    !(input.origin_kind === "imported" && !hasInterleavedMarkdownImageSyntax(input.content))
  );
}

describe("imported Detail gallery boundary", () => {
  it("IMPORTED + featured-only images → gallery hidden (no body duplicate)", () => {
    expect(
      showImageGallery({
        origin_kind: "imported",
        content: "Paragraph only. No markdown image.",
        images: ["https://cdn.example/featured.jpg"],
      })
    ).toBe(false);
  });

  it("IMPORTED + body markdown image → interleaved path (gallery off, body shows via content)", () => {
    const content = "Hello\n\n![alt](https://cdn.example/body.jpg)\n\nMore";
    expect(hasInterleavedMarkdownImageSyntax(content)).toBe(true);
    expect(
      showImageGallery({
        origin_kind: "imported",
        content,
        images: ["https://cdn.example/featured.jpg", "https://cdn.example/body.jpg"],
      })
    ).toBe(false);
  });

  it("NORMAL + gallery images → gallery unchanged", () => {
    expect(
      showImageGallery({
        origin_kind: "member",
        content: "Normal post text",
        images: ["https://cdn.example/a.jpg"],
      })
    ).toBe(true);
  });

  it("NORMAL + interleaved body → gallery off (existing)", () => {
    expect(
      showImageGallery({
        origin_kind: "member",
        content: "Hi\n\n![x](https://cdn.example/b.jpg)",
        images: ["https://cdn.example/b.jpg"],
      })
    ).toBe(false);
  });
});
