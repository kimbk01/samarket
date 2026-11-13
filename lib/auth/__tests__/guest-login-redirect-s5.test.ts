import { describe, expect, it } from "vitest";
import { buildGuestLoginRedirectSearch } from "@/lib/auth/guest-login-redirect";
import { sanitizeFreshLoginLandingPath } from "@/lib/auth/safe-next-path";

const nextOf = (search: string) => new URLSearchParams(search).get("next");

describe("S5 로그인 복귀 — 비회원 차단 시 next 보존", () => {
  it("공유로 들어오는 회원 전용 화면은 next 를 붙인다", () => {
    expect(nextOf(buildGuestLoginRedirectSearch("auth_required", "/moim/1234"))).toBe("/moim/1234");
    expect(nextOf(buildGuestLoginRedirectSearch("auth_required", "/u/someone?tab=posts"))).toBe("/u/someone?tab=posts");
    expect(new URLSearchParams(buildGuestLoginRedirectSearch("session_expired", "/moim/1")).get("reason")).toBe(
      "session_expired"
    );
  });

  it("계정 의존 경로(채팅방·통화·주문·쓰기)는 next 없이 — 기존 계약", () => {
    for (const p of [
      "/community-messenger/rooms/r1",
      "/community-messenger/calls/c1",
      "/chats/1",
      "/orders/store/1",
      "/write",
      "/mypage/trade/chat/1",
    ]) {
      expect(nextOf(buildGuestLoginRedirectSearch("auth_required", p)), p).toBeNull();
    }
  });

  it("열린 리다이렉트·로그인 화면은 next 없음", () => {
    for (const p of ["//evil.com", "/\\evil.com", "/https://evil.com", "/login", "/signup"]) {
      expect(nextOf(buildGuestLoginRedirectSearch("auth_required", p)), p).toBeNull();
    }
  });

  it("로그인 직후 복귀 — 거래 상품 상세(/post/) 허용, 채팅방은 계속 금지", () => {
    expect(sanitizeFreshLoginLandingPath("/post/abc")).toBe("/post/abc");
    expect(sanitizeFreshLoginLandingPath("/products/abc")).toBe("/products/abc");
    expect(sanitizeFreshLoginLandingPath("/moim/i/" + "a".repeat(64))).toBe("/moim/i/" + "a".repeat(64));
    expect(sanitizeFreshLoginLandingPath("/group/tok")).toBe("/group/tok");
    expect(sanitizeFreshLoginLandingPath("/community-messenger/rooms/r1")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/chats/1")).toBeNull();
  });
});
