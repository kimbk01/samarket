/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { playOrderMatchChatAlert } from "@/lib/notifications/play-order-match-alert";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";

vi.mock("@/lib/notifications/notification-sound-engine", () => ({
  playEventNotificationSound: vi.fn(async () => {}),
}));

describe("playOrderMatchChatAlert", () => {
  beforeEach(() => {
    vi.mocked(playEventNotificationSound).mockClear();
  });

  it("uses SSOT eventKey only (no legacy URL fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await playOrderMatchChatAlert();
    expect(playEventNotificationSound).toHaveBeenCalledWith("delivery_order_match_chat");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
