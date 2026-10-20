// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clearAppClientCaches, isClearableLocalCacheKey } from "@/lib/mypage/clear-app-client-caches";
import { isClearableSessionStorageKey } from "@/lib/mypage/client-cache-key-registry";

/** D16 — 캐시 삭제는 다시 받을 수 있는 데이터만 지우고 로그인·기기 설정은 보존 */
describe("clearAppClientCaches", () => {
  it("목록 캐시 키만 대상", () => {
    /** 주소 목록 캐시는 sessionStorage 에 있다 (SSOT-009) */
    expect(isClearableLocalCacheKey("samarket:me-addresses-list-cache:v1")).toBe(false);
    expect(isClearableSessionStorageKey("samarket:me-addresses-list-cache:v1")).toBe(true);
    expect(isClearableSessionStorageKey("samarket:me-addresses-list-cache:updated-at:v1")).toBe(true);
    expect(isClearableSessionStorageKey("dibay.address.edit.draft.v3:u1:new")).toBe(false);
    expect(isClearableLocalCacheKey("cache_feed")).toBe(true);
    expect(isClearableLocalCacheKey("temp_x")).toBe(true);
    expect(isClearableLocalCacheKey("sb-ckdosyydvgzqwpbwuhon-auth-token")).toBe(false);
    expect(isClearableLocalCacheKey("samarket:app-language")).toBe(false);
  });

  it("로그인 토큰·언어는 남기고 캐시·세션 임시값은 지움", async () => {
    localStorage.setItem("sb-proj-auth-token", "token");
    localStorage.setItem("samarket:app-language", "ko");
    localStorage.setItem("cache_feed", "[]");
    sessionStorage.setItem("samarket:me-addresses-list-cache:v1", "[]");
    sessionStorage.setItem("dibay:mypage-hub-scroll", "{}");
    const r = await clearAppClientCaches();
    expect(r.localKeys).toBe(1);
    expect(localStorage.getItem("sb-proj-auth-token")).toBe("token");
    expect(localStorage.getItem("samarket:app-language")).toBe("ko");
    expect(localStorage.getItem("cache_feed")).toBeNull();
    expect(sessionStorage.getItem("samarket:me-addresses-list-cache:v1")).toBeNull();
    expect(sessionStorage.getItem("dibay:mypage-hub-scroll")).toBeNull();
  });
});
