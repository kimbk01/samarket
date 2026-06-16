import { describe, expect, it, beforeEach } from "vitest";
import {
  isDibayCallConsumed,
  markCallConsumed,
  resetDibayCallSessionState,
  shouldAllowIncomingRingtone,
} from "@/lib/community-messenger/incoming-call-state";

describe("incoming-call-state consumed SSOT", () => {
  beforeEach(() => {
    resetDibayCallSessionState();
  });

  it("marks callId consumed and blocks ringtone", () => {
    markCallConsumed("call-1", "accepted");
    expect(isDibayCallConsumed("call-1")).toBe(true);
    expect(shouldAllowIncomingRingtone("call-1")).toBe(false);
  });

  it("allows ringtone before consumed", () => {
    expect(shouldAllowIncomingRingtone("call-2")).toBe(true);
  });

  it("blocks re-incoming after decline/missed/ended", () => {
    markCallConsumed("call-3", "declined");
    expect(isDibayCallConsumed("call-3")).toBe(true);
    markCallConsumed("call-4", "missed");
    expect(isDibayCallConsumed("call-4")).toBe(true);
    markCallConsumed("call-5", "ended");
    expect(isDibayCallConsumed("call-5")).toBe(true);
  });
});
