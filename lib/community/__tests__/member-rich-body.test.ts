import { describe, expect, it } from "vitest";
import { resolveMemberRichBody } from "@/lib/community/member-rich-body";
import {
  contentFromRichBlocks,
  sanitizeImportedContentBlocks,
  sanitizeMemberContentBlocks,
} from "@/lib/community/imported-content-blocks";
import { mergePostBodyImages } from "@/lib/philife/post-body-images";
import { communityPostImagePathFromUrl, collectCommunityPostRowImageUrls } from "@/lib/community/community-post-image-gc.server";

const IMG = "https://p.supabase.co/storage/v1/object/public/post-images/11111111-1111-4111-8111-111111111111/community/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp";

describe("회원 서식 본문 (승인 ①)", () => {
  const blocks = [
    { t: "h", level: 2, text: "제목 둘" },
    { t: "p", text: "x", runs: [{ text: "첫 " }, { text: "굵게", b: true }, { text: " 문단 " }, { text: "링크", href: "https://x.com/a" }] },
    { t: "ul", items: ["하나", "둘"], itemRuns: [[{ text: "하나" }], [{ text: "둘", i: true }]] },
    { t: "img", url: IMG, alt: "a]b", caption: "캡션" },
    { t: "quote", text: "인용", runs: [{ text: "인용" }] },
    { t: "table", rows: [["A", "B"], ["1", "2"]], header: true },
  ];

  it("서버가 블록에서 평문 content 를 만든다 — 클라이언트 content 무시", () => {
    const r = resolveMemberRichBody({ content: "위조된 평문", contentBlocks: blocks });
    expect(r.content).toBe(
      ["제목 둘", "첫 굵게 문단 링크", "• 하나\n• 둘", `![a b](${IMG})\n캡션`, "인용", "A | B\n1 | 2"].join("\n\n")
    );
    expect(r.contentBlocks).not.toBeNull();
    /** images SSOT 가 본문 사진을 그대로 읽는다 */
    expect(mergePostBodyImages({ content: r.content, candidates: [] })).toEqual([IMG]);
  });

  it("서식 없는 문단·사진뿐이면 블록 저장 안 함(중복 저장 방지)", () => {
    const r = resolveMemberRichBody({
      content: "",
      contentBlocks: [{ t: "p", text: "그냥 글", runs: [{ text: "그냥 글" }] }, { t: "img", url: IMG, alt: null, caption: null }],
    });
    expect(r.contentBlocks).toBeNull();
    expect(r.content).toBe(`그냥 글\n\n![](${IMG})`);
  });

  it("contentBlocks 없으면 예전 계약", () => {
    expect(resolveMemberRichBody({ content: "  평문  ", contentBlocks: undefined })).toEqual({ content: "평문", contentBlocks: null });
  });

  it("정제: 외부 사진·javascript 링크·알 수 없는 블록 제거, 조각 사이 공백 보존", () => {
    const out = sanitizeMemberContentBlocks([
      { t: "img", url: "https://evil.example/a.jpg", alt: "", caption: "" },
      { t: "p", runs: [{ text: "가 " }, { text: "나", b: true, href: "javascript:alert(1)" }, { text: "  다\n라" }] },
      { t: "script", text: "x" },
    ]);
    expect(out).toEqual([
      { t: "p", text: "가 나 다\n라", runs: [{ text: "가 " }, { text: "나", b: true }, { text: " 다\n라" }] },
    ]);
  });

  it("가져온 글 정제는 예전과 같다(runs 무시)", () => {
    expect(sanitizeImportedContentBlocks([{ t: "p", text: " a  b ", runs: [{ text: "x", b: true }] }])).toEqual([{ t: "p", text: "a b" }]);
  });

  it("contentFromRichBlocks 번호 목록", () => {
    expect(contentFromRichBlocks([{ t: "ol", items: ["a", "b"] }])).toBe("1. a\n2. b");
  });
});

describe("커뮤니티 사진 정리 경로 판정 (승인 ③)", () => {
  it("커뮤니티 글 사진 원본만", () => {
    expect(communityPostImagePathFromUrl(IMG)).toBe("11111111-1111-4111-8111-111111111111/community/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp");
    expect(communityPostImagePathFromUrl(IMG.replace("/community/", "/community/import/"))).toContain("/community/import/");
    expect(communityPostImagePathFromUrl(IMG.replace(".webp", ".detail.webp"))).toBeNull();
    expect(communityPostImagePathFromUrl(IMG.replace("/community/", "/community/messenger-image/r/"))).toBeNull();
    expect(communityPostImagePathFromUrl("https://evil.example/post-images/x.webp")).toBeNull();
  });
  it("글 행에서 사진 주소 전부 모으기", () => {
    const urls = collectCommunityPostRowImageUrls({
      images: [IMG],
      thumbnail_url: IMG,
      content: `글 ![](${IMG.replace("aaaaaaaa", "bbbbbbbb")}) 끝`,
      content_blocks: [{ t: "img", url: IMG.replace("aaaaaaaa", "cccccccc") }],
    });
    expect(urls).toHaveLength(3);
  });
});
