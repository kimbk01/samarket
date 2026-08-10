/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  interleavedMarkdownFromPastedHtml,
  isPlainClipboardMostlyImageUrls,
  stripImageReferencesPreservingParagraphs,
  stripKnownImageUrlsFromText,
  stripMarkdownImageSyntaxForFeedPreview,
  summarizeCommunityPostContent,
  workItemsFromInterleavedMd,
} from "@/lib/philife/interleaved-body-markdown";

describe("stripMarkdownImageSyntaxForFeedPreview", () => {
  it("removes markdown image syntax", () => {
    expect(
      stripMarkdownImageSyntaxForFeedPreview("hello ![x](https://cdn.example.com/a.jpg) world")
    ).toBe("hello world");
  });

  it("removes bare image file URLs so list preview never shows storage address", () => {
    const s =
      "본문입니다 https://xyz.supabase.co/storage/v1/object/public/post-images/u/community/a.jpg 끝";
    expect(stripMarkdownImageSyntaxForFeedPreview(s)).toBe("본문입니다 끝");
  });

  it("removes bare .png/.webp urls", () => {
    expect(
      stripMarkdownImageSyntaxForFeedPreview("see https://cdn.example.com/pic.png?w=1 here")
    ).toBe("see here");
  });

  it("removes a summary truncated inside markdown image URL", () => {
    expect(
      stripMarkdownImageSyntaxForFeedPreview(
        "![](https://xyz.supabase.co/storage/v1/object/public/post-images/u/community/abcdef…"
      )
    ).toBe("");
  });
});

describe("community post summary SSOT", () => {
  it("strips the image before truncating so following text becomes summary", () => {
    const longImage = `https://cdn.example.com/${"a".repeat(300)}.png`;
    const content = `![](${longImage})\n\n실제 붙여넣은 내용 요약입니다.`;
    expect(summarizeCommunityPostContent(content, 160)).toBe(
      "실제 붙여넣은 내용 요약입니다."
    );
  });

  it("preserves pasted paragraphs while removing image references", () => {
    expect(
      stripImageReferencesPreservingParagraphs(
        "첫 문단\n\n![](https://cdn.example.com/a.png)\n\n둘째 문단"
      )
    ).toBe("첫 문단\n\n둘째 문단");
  });
});

describe("isPlainClipboardMostlyImageUrls", () => {
  it("treats url-only clipboard as image-only", () => {
    expect(
      isPlainClipboardMostlyImageUrls(
        "https://xyz.supabase.co/storage/v1/object/public/post-images/u/a.jpg"
      )
    ).toBe(true);
  });

  it("keeps real text", () => {
    expect(isPlainClipboardMostlyImageUrls("기사 제목입니다")).toBe(false);
  });
});

describe("stripKnownImageUrlsFromText", () => {
  it("removes known urls", () => {
    const hosted = "https://cdn.example.com/hosted.jpg";
    expect(stripKnownImageUrlsFromText(`a ${hosted} b`, [hosted])).toBe("a b");
  });
});

describe("interleavedMarkdownFromPastedHtml data images", () => {
  it("includes data:image jpeg in markdown so paste can rehost", () => {
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const html = `<p>hello</p><img src="${tiny}" /><p>tail</p>`;
    const md = interleavedMarkdownFromPastedHtml(html, "hello\ntail");
    expect(md).toContain(`![](${tiny})`);
    expect(workItemsFromInterleavedMd(md)).toEqual([{ kind: "data", value: tiny }]);
    expect(stripImageReferencesPreservingParagraphs(md)).toBe("hello\n\ntail");
  });
});
