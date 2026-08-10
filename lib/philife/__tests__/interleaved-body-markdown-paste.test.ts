/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  interleavedMarkdownFromPastedHtml,
  isPlainClipboardMostlyImageUrls,
  stripKnownImageUrlsFromText,
  stripMarkdownImageSyntaxForFeedPreview,
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
  });
});
