import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimCallTerminalPatch } from "@/lib/community-messenger/call-terminal-patch-dedupe";

describe("claimCallTerminalPatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T08:00:00.000Z"));
  });

  it("allows first claim and blocks duplicate within window", () => {
    expect(claimCallTerminalPatch("s1", "cancel")).toBe(true);
    expect(claimCallTerminalPatch("s1", "cancel")).toBe(false);
    vi.advanceTimersByTime(8_001);
    expect(claimCallTerminalPatch("s1", "cancel")).toBe(true);
  });

  it("scopes dedupe per session and action", () => {
    expect(claimCallTerminalPatch("s-scope-1", "cancel")).toBe(true);
    expect(claimCallTerminalPatch("s-scope-1", "end")).toBe(true);
    expect(claimCallTerminalPatch("s-scope-2", "cancel")).toBe(true);
  });
});
