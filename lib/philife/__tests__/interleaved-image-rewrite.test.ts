import { describe, expect, it } from "vitest";
import { interleavedImageUrlKey, rewriteInterleavedImages } from "@/lib/philife/interleaved-body-markdown";

const HOSTED = "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/a.webp";

describe("붙여넣기 이미지 URL 단위 처리 (CM-R-07)", () => {
  it("재호스팅 성공분은 교체, 실패분은 제거 — 사이에 사용자가 고친 글은 보존", () => {
    const current = "기사 제목(수정함)\n\n![](https://ext.example/a.jpg)\n\n본문\n\n![](//cdn.example/b.png)\n\n끝";
    const hosted = new Map([[interleavedImageUrlKey("https://ext.example/a.jpg"), HOSTED]]);
    const pasted = new Set([interleavedImageUrlKey("https://ext.example/a.jpg"), interleavedImageUrlKey("//cdn.example/b.png")]);
    const out = rewriteInterleavedImages(current, (k) => hosted.get(k) ?? (pasted.has(k) ? null : undefined));
    expect(out).toBe(`기사 제목(수정함)\n\n![](${HOSTED})\n\n본문\n\n끝`);
  });

  it("관련 없는 이미지는 그대로 둔다", () => {
    const md = `a\n![](${HOSTED})\nb`;
    expect(rewriteInterleavedImages(md, () => undefined)).toBe(md);
  });
});

describe("이미지 문법 괄호 주소 (D8)", () => {
  it("주소 안 괄호 한 겹까지 이미지로 인식하고 뒷부분이 글자로 남지 않는다", async () => {
    const { parseInterleavedMarkdownToSegments, stripMarkdownImageSyntaxForFeedPreview } = await import(
      "@/lib/philife/interleaved-body-markdown"
    );
    const url = "https://cdn.example.com/photo_(1).jpg";
    const segs = parseInterleavedMarkdownToSegments(`앞\n![](${url})\n뒤`);
    expect(segs.filter((s) => s.kind === "img").map((s) => s.value)).toEqual([url]);
    expect(segs.map((s) => s.value).join("")).not.toContain(".jpg)");
    expect(stripMarkdownImageSyntaxForFeedPreview(`앞 ![](${url}) 뒤`)).toBe("앞 뒤");
  });
  it("괄호 없는 주소는 예전과 같다", async () => {
    const { parseInterleavedMarkdownToSegments } = await import("@/lib/philife/interleaved-body-markdown");
    const segs = parseInterleavedMarkdownToSegments(`a![x](${HOSTED})b![](${HOSTED})`);
    expect(segs.map((s) => s.kind)).toEqual(["text", "img", "text", "img"]);
  });
});
