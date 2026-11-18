/** 시안 R4 수정안 #12 — 홈 카드 사진 주소 (2026-11-18) */
import { describe, expect, it } from "vitest";
import { homePostCardImageSrc, homeTradeCardImageSrc } from "@/lib/home/home-feed-image";

const O = "https://proj.supabase.co";

describe("homePostCardImageSrc — 정보 공유 16:10 맞춤 변환", () => {
  it("공개 원본 → 가로·세로·cover 모두 지정 (가로만 주면 가운데 띠만 잘림 — 운영 FAIL 재발 방지)", () => {
    const u = homePostCardImageSrc(`${O}/storage/v1/object/public/post-images/u/community/a.webp`, O);
    expect(u).toBe(`${O}/storage/v1/render/image/public/post-images/u/community/a.webp?width=800&height=500&resize=cover&quality=75`);
    expect(u).toMatch(/height=\d+/);
    expect(u).toMatch(/resize=cover/);
  });
  it("작은 사본(.thumb/.feed) → 원본으로 되돌려 변환", () => {
    expect(homePostCardImageSrc(`${O}/storage/v1/object/public/post-images/u/a.thumb.webp`, O)).toContain("/render/image/public/post-images/u/a.webp?");
    expect(homePostCardImageSrc(`${O}/storage/v1/object/public/post-images/u/a.feed.webp`, O)).toContain("/render/image/public/post-images/u/a.webp?");
  });
  it("다른 호스트·질의 붙은 주소·빈 값·환경값 없음 = 그대로", () => {
    expect(homePostCardImageSrc("https://cdn.example/a.jpg", O)).toBe("https://cdn.example/a.jpg");
    expect(homePostCardImageSrc(`${O}/storage/v1/object/public/a.webp?x=1`, O)).toBe(`${O}/storage/v1/object/public/a.webp?x=1`);
    expect(homePostCardImageSrc("", O)).toBe("");
    expect(homePostCardImageSrc(`${O}/storage/v1/object/public/a.webp`, null)).toBe(`${O}/storage/v1/object/public/a.webp`);
  });
});

describe("homeTradeCardImageSrc — 마켓 카드는 가로만 준 변환을 쓰지 않는다", () => {
  it("결과 주소에 width 만 붙은 render 변환이 없다", () => {
    const u = homeTradeCardImageSrc("https://cdn.example/a.jpg");
    expect(u).not.toMatch(/render\/image[^?]*\?width=\d+&quality/);
  });
});
