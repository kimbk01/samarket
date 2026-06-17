import { describe, expect, it, vi } from "vitest";
import { buildCommunityPostCanonicalUrl, isSafeCommunityShareUrl } from "../community-share-url";
import { buildCommunityPostShareCardData, buildCommunityPostExcerpt } from "../community-share-payload";
import { copyTextToClipboard, isShareAbortError } from "../community-share-copy";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

describe("buildCommunityPostCanonicalUrl", () => {
  it("uses production origin with UTM and no localhost", () => {
    const url = buildCommunityPostCanonicalUrl("550e8400-e29b-41d4-a716-446655440000");
    expect(url).toMatch(/^https:\/\//);
    expect(url).not.toMatch(/localhost/);
    expect(url).toContain("/community/posts/");
    expect(url).toContain("utm_source=dibay_share");
    expect(url).toContain("utm_medium=community");
    expect(url).toContain("utm_campaign=post_share");
    expect(isSafeCommunityShareUrl(url)).toBe(true);
  });

  it("rejects localhost URLs", () => {
    expect(isSafeCommunityShareUrl("http://localhost:3000/community/posts/x")).toBe(false);
  });

  it("rejects token query params", () => {
    expect(
      isSafeCommunityShareUrl("https://samarket.vercel.app/community/posts/x?access_token=abc")
    ).toBe(false);
  });
});

describe("buildCommunityPostShareCardData", () => {
  const post = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    title: "  Hello world  ",
    content: "Body text here",
    summary: "",
    author_name: "Kim (@kim123)",
    category_label: "동네소식",
    category: "news",
    images: ["https://cdn.example.com/a.jpg"],
  } as NeighborhoodFeedPostDTO;

  it("builds card with nickname-only author and canonical url", () => {
    const card = buildCommunityPostShareCardData(post);
    expect(card.title).toBe("Hello world");
    expect(card.authorName).toBe("Kim");
    expect(card.thumbnailUrl).toBe("https://cdn.example.com/a.jpg");
    expect(card.canonicalUrl).toContain("/community/posts/");
  });

  it("truncates excerpt", () => {
    const long = "x".repeat(200);
    const excerpt = buildCommunityPostExcerpt({ title: "", content: long, summary: "" }, 50);
    expect(excerpt.length).toBeLessThanOrEqual(50);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const result = await copyTextToClipboard("https://example.com/a");
    expect(result).toBe("clipboard");
    expect(writeText).toHaveBeenCalledWith("https://example.com/a");
    vi.unstubAllGlobals();
  });

  it("detects AbortError", () => {
    expect(isShareAbortError({ name: "AbortError" })).toBe(true);
    expect(isShareAbortError(new Error("fail"))).toBe(false);
  });
});
