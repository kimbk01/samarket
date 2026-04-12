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

  it("maps blocked_target", () => {
    expect(communityMessengerFriendRequestFailureMessage({ ok: false, error: "blocked_target" })).toContain("차단");
  });
});
