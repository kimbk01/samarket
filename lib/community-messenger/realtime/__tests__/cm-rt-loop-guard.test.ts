import { describe, expect, it } from "vitest";
import {
  CM_RT_MAX_CONSECUTIVE_FAILURES,
  cmRtComputeRetryDelayMs,
  cmRtRecordSubscribeFailure,
  cmRtRecordSubscribeSuccess,
  cmRtResetFailureState,
} from "@/lib/community-messenger/realtime/cm-rt-loop-guard";

describe("cm-rt-loop-guard", () => {
  it("enters cooldown after consecutive failures", () => {
    const key = "community-messenger:test-channel";
    cmRtResetFailureState(key);
    let entered = false;
    for (let i = 0; i < CM_RT_MAX_CONSECUTIVE_FAILURES; i++) {
      const r = cmRtRecordSubscribeFailure(key, "CHANNEL_ERROR");
      if (r.enteredCooldown) entered = true;
    }
    expect(entered).toBe(true);
    const wait = cmRtComputeRetryDelayMs(key, 3);
    expect(wait).toBeGreaterThanOrEqual(10_000);
    cmRtRecordSubscribeSuccess(key);
    expect(cmRtComputeRetryDelayMs(key, 0)).toBeLessThan(25_000);
  });
});
