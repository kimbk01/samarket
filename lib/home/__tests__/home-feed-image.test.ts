/** 설계 D4 (Owner 「승인·사진 받기 제외」 2026-11-18 · 문서 §16-2) */
import { describe, expect, it } from "vitest";
import { homeFeedImageSrc } from "@/lib/home/home-feed-image";

const O = "https://proj.supabase.co";

describe("homeFeedImageSrc — 자사 Storage 공개 그림만 크기 변환 주소로", () => {
  it("공개 객체 → render/image + width·quality", () => {
    expect(homeFeedImageSrc(`${O}/storage/v1/object/public/post-images/u/a.webp`, 720, O)).toBe(
      `${O}/storage/v1/render/image/public/post-images/u/a.webp?width=720&quality=70`
    );
  });
  it("다른 호스트·질의 붙은 주소·이미 변환 주소·빈 값은 그대로", () => {
    expect(homeFeedImageSrc("https://cdn.example/a.jpg", 720, O)).toBe("https://cdn.example/a.jpg");
    expect(homeFeedImageSrc(`${O}/storage/v1/object/public/a.webp?x=1`, 720, O)).toBe(`${O}/storage/v1/object/public/a.webp?x=1`);
    const r = `${O}/storage/v1/render/image/public/a.webp`;
    expect(homeFeedImageSrc(r, 720, O)).toBe(r);
    expect(homeFeedImageSrc("", 720, O)).toBe("");
  });
  it("Supabase 주소를 모르면(환경값 없음) 그대로", () => {
    expect(homeFeedImageSrc(`${O}/storage/v1/object/public/a.webp`, 720, null)).toBe(`${O}/storage/v1/object/public/a.webp`);
  });
});
