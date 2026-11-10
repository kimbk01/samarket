import { describe, expect, it } from "vitest";
import {
  communityMessengerFriendRequestFailureMessage,
  formatFriendRejectCooldownMessage,
} from "@/lib/community-messenger/community-messenger-friend-request-client";

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
