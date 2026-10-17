import { describe, expect, it } from "vitest";
import { shouldAwaitUserConfirmToStart } from "@/lib/platform/android-play-in-app-update-orchestrator";

describe("android-play-in-app-update-orchestrator confirmStart gate", () => {
  it("requires Host confirm before auto FLEXIBLE start", () => {
    expect(
      shouldAwaitUserConfirmToStart({
        manual: false,
        confirmStart: false,
        choice: "flexible",
      })
    ).toBe(true);
  });

  it("does not await when user confirmed start or opened Version manually", () => {
    expect(
      shouldAwaitUserConfirmToStart({
        manual: false,
        confirmStart: true,
        choice: "flexible",
      })
    ).toBe(false);
    expect(
      shouldAwaitUserConfirmToStart({
        manual: true,
        confirmStart: false,
        choice: "flexible",
      })
    ).toBe(false);
  });

  it("does not soft-gate IMMEDIATE or complete_flexible", () => {
    expect(
      shouldAwaitUserConfirmToStart({
        manual: false,
        confirmStart: false,
        choice: "immediate",
      })
    ).toBe(false);
    expect(
      shouldAwaitUserConfirmToStart({
        manual: false,
        confirmStart: false,
        choice: "complete_flexible",
      })
    ).toBe(false);
  });
});
