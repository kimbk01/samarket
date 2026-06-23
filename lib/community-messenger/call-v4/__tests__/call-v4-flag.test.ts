import { afterEach, describe, expect, it, vi } from "vitest";

describe("call-v4-flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE", "");
    const { isCallV4TelegramLaneEnabled } = await import("@/lib/community-messenger/call-v4/call-v4-flag");
    expect(isCallV4TelegramLaneEnabled()).toBe(false);
  });

  it("is enabled when env is 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE", "1");
    vi.resetModules();
    const { isCallV4TelegramLaneEnabled } = await import("@/lib/community-messenger/call-v4/call-v4-flag");
    expect(isCallV4TelegramLaneEnabled()).toBe(true);
  });
});
