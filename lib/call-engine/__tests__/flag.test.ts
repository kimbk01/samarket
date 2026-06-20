/** @vitest-environment node */

import { afterEach, describe, expect, it, vi } from "vitest";

describe("isCallEngineV2Enabled", () => {
  const prev = process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2;
    } else {
      process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2 = prev;
    }
    vi.resetModules();
  });

  it("defaults to enabled when env unset", async () => {
    delete process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2;
    const { isCallEngineV2Enabled } = await import("@/lib/call-engine/flag");
    expect(isCallEngineV2Enabled()).toBe(true);
  });

  it("opts out only when env is 0", async () => {
    process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2 = "0";
    const { isCallEngineV2Enabled } = await import("@/lib/call-engine/flag");
    expect(isCallEngineV2Enabled()).toBe(false);
  });

  it("stays enabled when env is 1", async () => {
    process.env.NEXT_PUBLIC_DIBAY_CALL_ENGINE_V2 = "1";
    const { isCallEngineV2Enabled } = await import("@/lib/call-engine/flag");
    expect(isCallEngineV2Enabled()).toBe(true);
  });
});
