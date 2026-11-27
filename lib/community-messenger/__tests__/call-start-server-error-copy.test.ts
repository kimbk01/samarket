import { afterEach, describe, expect, it } from "vitest";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  callStartServerErrorCodeOrNull,
  isRateLimitedErrorCode,
  resolveCallInAppNoticeMessage,
  resolveCallStartServerErrorMessage,
} from "@/lib/community-messenger/stores/call-in-app-notice-store";

/** 통화 시작 실패 — 서버 `error` 문장을 화면에 쓰지 않는다 (docs/audit/i18n-call-copy-plan-2026-11-27.md §1 F·G) */
describe("call start server error copy", () => {
  afterEach(() => setRuntimeAppLanguage("en"));

  it("429·요청 제한 코드 → 앱 언어 요청 제한 문구", () => {
    setRuntimeAppLanguage("en");
    expect(resolveCallStartServerErrorMessage("community_messenger_room_call_start_rate_limited", 429)).toBe(
      "Too many requests. Please try again shortly."
    );
    setRuntimeAppLanguage("ko");
    expect(resolveCallStartServerErrorMessage("rate_limited", null)).toBe(
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
    );
    expect(resolveCallInAppNoticeMessage("call_failed", "community_messenger_incoming_call_rate_limited")).toBe(
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
    );
  });

  it("서버 한국어 문장은 영어 화면에 나오지 않는다", () => {
    setRuntimeAppLanguage("en");
    const msg = resolveCallStartServerErrorMessage("통화 시작 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.", 400);
    expect(msg).not.toMatch(/[가-힣]/);
    expect(callStartServerErrorCodeOrNull("서버 문장입니다.")).toBeNull();
    expect(callStartServerErrorCodeOrNull("peer_busy")).toBe("peer_busy");
  });

  it("isRateLimitedErrorCode", () => {
    expect(isRateLimitedErrorCode("community_messenger_incoming_call_rate_limited")).toBe(true);
    expect(isRateLimitedErrorCode("peer_busy")).toBe(false);
    expect(isRateLimitedErrorCode("요청 rate_limited")).toBe(false);
  });
});
