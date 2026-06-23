import { afterEach, describe, expect, it, vi } from "vitest";

describe("call-v4-lane", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("resolves v4 when V4 flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE", "1");
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE", "");
    const { resolveDibayCallLane } = await import("@/lib/community-messenger/call-v4/call-v4-lane");
    expect(resolveDibayCallLane()).toBe("v4");
  });

  it("resolves v3 when only V3 flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE", "");
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE", "1");
    const { resolveDibayCallLane } = await import("@/lib/community-messenger/call-v4/call-v4-lane");
    expect(resolveDibayCallLane()).toBe("v3");
  });

  it("prefers v4 when both flags are on", async () => {
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE", "1");
    vi.stubEnv("NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE", "1");
    const { resolveDibayCallLane } = await import("@/lib/community-messenger/call-v4/call-v4-lane");
    expect(resolveDibayCallLane()).toBe("v4");
  });
});
