import { beforeEach, describe, expect, it } from "vitest";
import {
  isCallEngineTerminalConsumed,
  markCallEngineTerminalConsumed,
  resetCallEngineLocksForTests,
  tryLockCallEngineActionOnce,
  tryLockCallEngineJoinOnce,
  tryLockCallEngineRouteOnce,
} from "@/lib/community-messenger/call-engine/call-engine-locks";

describe("call-engine locks", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
  });

  it("enforces accept once", () => {
    expect(tryLockCallEngineActionOnce("c1", "accept")).toBe(true);
    expect(tryLockCallEngineActionOnce("c1", "accept")).toBe(false);
  });

  it("enforces join/route once per callId", () => {
    expect(tryLockCallEngineJoinOnce("c1")).toBe(true);
    expect(tryLockCallEngineJoinOnce("c1")).toBe(false);
    expect(tryLockCallEngineRouteOnce("c1")).toBe(true);
    expect(tryLockCallEngineRouteOnce("c1")).toBe(false);
  });

  it("blocks all locks after terminal consumed", () => {
    markCallEngineTerminalConsumed("c2");
    expect(isCallEngineTerminalConsumed("c2")).toBe(true);
    expect(tryLockCallEngineActionOnce("c2", "accept")).toBe(false);
    expect(tryLockCallEngineJoinOnce("c2")).toBe(false);
    expect(tryLockCallEngineRouteOnce("c2")).toBe(false);
  });
});
