/**
 * 2026-10-28 실기: 기기 저장 캐시(최대 24h)로 그린 목록은 새 글을 놓친다 — 결과에 표시를 붙이고, 두 목록이 바로 다시 확인한다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("기기 저장 캐시 결과 → 바로 서버 재확인", () => {
  it("getPostsForHome 은 저장 캐시 복원 결과에 fromDeviceCache 를 붙인다", () => {
    const src = readFileSync("lib/posts/getPostsForHome.ts", "utf8");
    expect(src).toContain("return { ...storageRestored, fromDeviceCache: true };");
  });
  it("주제 목록: fromDeviceCache 면 bypassClientCache 로 1쪽을 다시 받는다", () => {
    const src = readFileSync("components/post/PostListByCategory.tsx", "utf8");
    expect(src).toMatch(/next\.fromDeviceCache\)[\s\S]{0,120}bypassClientCache: true/);
  });
  it("홈 목록: 캐시 부트·fromDeviceCache 뒤 새 글 확인(refreshSilent)을 바로 부른다", () => {
    const src = readFileSync("components/home/HomeProductList.tsx", "utf8");
    expect(src.split("refreshSilentRef.current?.()").length - 1).toBeGreaterThanOrEqual(3);
  });
});
