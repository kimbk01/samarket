import { describe, expect, it } from "vitest";
import {
  canTransitionCallEngineState,
  isCallEngineTerminalState,
} from "@/lib/community-messenger/call-engine/call-engine-transitions";

describe("call-engine transitions", () => {
  it("allows canonical ringing->accepting->joining->connected", () => {
    expect(canTransitionCallEngineState("incoming_ringing", "accepting")).toBe(true);
    expect(canTransitionCallEngineState("accepting", "joining")).toBe(true);
    expect(canTransitionCallEngineState("joining", "connected")).toBe(true);
  });

  it("blocks terminal to non-terminal transition", () => {
    expect(canTransitionCallEngineState("ended", "joining")).toBe(false);
    expect(canTransitionCallEngineState("rejected", "connected")).toBe(false);
  });

  it("recognizes terminal states", () => {
    expect(isCallEngineTerminalState("ended")).toBe(true);
    expect(isCallEngineTerminalState("connected")).toBe(false);
  });
});
