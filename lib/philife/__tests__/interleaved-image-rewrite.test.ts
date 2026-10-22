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
