import { describe, expect, it } from "vitest";
import {
  communityMessengerFriendRequestFailureMessage,
  formatFriendRejectCooldownMessage,
} from "@/lib/community-messenger/community-messenger-friend-request-client";
import { afterEach as afterEachRuntimeLang, beforeEach as beforeEachRuntimeLang } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

/** 언어 재감사 2026-11-27 — 라벨은 화면 언어(런타임)로 그린다. 이 파일의 한국어 기대값은 ko 화면 기준 */
beforeEachRuntimeLang(() => setRuntimeAppLanguage("ko"));
afterEachRuntimeLang(() => setRuntimeAppLanguage("en"));

describe("formatFriendRejectCooldownMessage", () => {
  it("uses minutes for sub-hour cooldown", () => {
    expect(formatFriendRejectCooldownMessage(5 * 60_000)).toMatch(/5분/);
  });

  it("uses hours for long cooldown", () => {
    const s = formatFriendRejectCooldownMessage(2 * 60 * 60_000);
    expect(s).toMatch(/2시간/);
  });
});

describe("communityMessengerFriendRequestFailureMessage", () => {
  it("returns null for success", () => {
    expect(communityMessengerFriendRequestFailureMessage({ ok: true })).toBeNull();
  });

  it("maps blocked_target — 차단 여부를 드러내지 않는다 (연락처 동기화 정책 #7 A안)", () => {
    const msg = communityMessengerFriendRequestFailureMessage({ ok: false, error: "blocked_target" });
    expect(msg).toBe("친구 요청을 보낼 수 없어요.");
    expect(msg).not.toContain("차단");
  });
});
