import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearCoalescedChatAlertSoundForTests,
  playCoalescedChatNotificationSound,
} from "@/lib/notifications/coalesced-chat-alert-sound";
import { __resetNotificationSoundDecisionForTests } from "@/lib/notifications/notification-sound-decision";
import { shouldSuppressMessengerInAppSoundOnTradeExplorationSurface } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playDomainNotificationSound: vi.fn().mockResolvedValue(undefined),
  playEventNotificationSound: vi.fn().mockResolvedValue(undefined),
  resetNotificationSoundEngineForAuthEpoch: vi.fn(),
}));

describe("CM sound policy vs trade exploration surface", () => {
  beforeEach(() => {
    clearCoalescedChatAlertSoundForTests();
    __resetNotificationSoundDecisionForTests({
      recipientId: "user-1",
      isLeader: true,
      visibility: "visible",
      windowFocused: true,
      sessionStartedAt: Date.now() - 1_000,
    });
  });

  it("trade exploration suppress still true for /market (trade_chat paths only)", () => {
    expect(shouldSuppressMessengerInAppSoundOnTradeExplorationSurface("/market")).toBe(true);
    expect(shouldSuppressMessengerInAppSoundOnTradeExplorationSurface("/community-messenger")).toBe(
      false
    );
  });

  it("participant full-effects source does not gate CM sound on trade exploration", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/notifications/cm-participant-unread-full-effects.ts"),
      "utf8"
    );
    expect(src).not.toContain("shouldSuppressMessengerInAppSoundOnTradeExplorationSurface");
    expect(src).not.toContain("playCoalescedChatNotificationSound");
    expect(src).toContain("unread_delta_not_sound_authority");
  });

  it("playCoalescedChatNotificationSound returns scheduled then skips duplicate", () => {
    const first = playCoalescedChatNotificationSound("k1", "community_direct_chat");
    expect(first).toEqual({ status: "scheduled", dedupeKey: "k1" });
    const second = playCoalescedChatNotificationSound("k1", "community_direct_chat");
    expect(second.status).toBe("skipped");
  });
});
