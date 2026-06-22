import { describe, expect, it } from "vitest";
import {
  CM_CALL_PHASE0_BASICS_ONLY,
  isCmCallDockEnabled,
  isCmCallPhase0BasicsOnly,
  isCmCallVideoEnabled,
  isCmGroupCallEnabled,
} from "@/lib/community-messenger/call-phase0-basics";

describe("call-phase0-basics", () => {
  it("enables basics-only mode by default", () => {
    expect(CM_CALL_PHASE0_BASICS_ONLY).toBe(true);
    expect(isCmCallPhase0BasicsOnly()).toBe(true);
    expect(isCmCallDockEnabled()).toBe(false);
    expect(isCmCallVideoEnabled()).toBe(false);
    expect(isCmGroupCallEnabled()).toBe(false);
  });
});
