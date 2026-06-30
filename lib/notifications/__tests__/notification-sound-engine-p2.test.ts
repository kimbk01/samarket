/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { playDomainNotificationSound } from "@/lib/notifications/notification-sound-engine";

describe("playDomainNotificationSound P2", () => {
  it("does not fetch legacy /api/app/notification-sound-config", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play").mockImplementation(() => Promise.resolve());

    await playDomainNotificationSound("trade_chat");

    const legacyConfigFetch = fetchSpy.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("notification-sound-config")
    );
    expect(legacyConfigFetch).toBe(false);

    fetchSpy.mockRestore();
    playSpy.mockRestore();
  });
});
