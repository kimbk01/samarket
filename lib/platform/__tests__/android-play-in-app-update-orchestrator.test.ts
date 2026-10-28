import { describe, expect, it } from "vitest";
import {
  dismissAndroidFlexibleInstallReadyForThisRun,
  isAndroidFlexibleInstallReadyDismissedForThisRun,
  isAndroidPlayUpdateDeferred,
  parseAndroidPlayUpdateDeferral,
  shouldAwaitUserConfirmToStart,
} from "@/lib/platform/android-play-in-app-update-orchestrator";

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

describe("android-play-in-app-update-orchestrator D1 deferral (나중에 24h per build)", () => {
  const HOUR = 60 * 60 * 1000;
  const now = 1_800_000_000_000;

  it("parses a valid record and rejects corrupt values", () => {
    expect(parseAndroidPlayUpdateDeferral(JSON.stringify({ versionCode: 18, at: now }))).toEqual({
      versionCode: 18,
      at: now,
    });
    expect(parseAndroidPlayUpdateDeferral(null)).toBeNull();
    expect(parseAndroidPlayUpdateDeferral("")).toBeNull();
    expect(parseAndroidPlayUpdateDeferral("{not json")).toBeNull();
    expect(parseAndroidPlayUpdateDeferral(JSON.stringify({ versionCode: "18", at: now }))).toBeNull();
    expect(parseAndroidPlayUpdateDeferral(JSON.stringify({ versionCode: 18 }))).toBeNull();
    expect(parseAndroidPlayUpdateDeferral(JSON.stringify({ versionCode: -1, at: now }))).toBeNull();
    expect(parseAndroidPlayUpdateDeferral("null")).toBeNull();
  });

  it("suppresses the same build within 24h", () => {
    const deferral = { versionCode: 18, at: now - 23 * HOUR };
    expect(isAndroidPlayUpdateDeferred({ deferral, availableVersionCode: 18, now })).toBe(true);
  });

  it("prompts again after 24h", () => {
    const deferral = { versionCode: 18, at: now - 24 * HOUR };
    expect(isAndroidPlayUpdateDeferred({ deferral, availableVersionCode: 18, now })).toBe(false);
  });

  it("prompts immediately for a higher build", () => {
    const deferral = { versionCode: 18, at: now - HOUR };
    expect(isAndroidPlayUpdateDeferred({ deferral, availableVersionCode: 19, now })).toBe(false);
  });

  it("does not suppress without a record or when the clock moved backwards", () => {
    expect(isAndroidPlayUpdateDeferred({ deferral: null, availableVersionCode: 18, now })).toBe(false);
    expect(
      isAndroidPlayUpdateDeferred({
        deferral: { versionCode: 18, at: now + HOUR },
        availableVersionCode: 18,
        now,
      })
    ).toBe(false);
  });

  it("treats an unreported build as 0 (same unknown build stays suppressed, a reported build prompts)", () => {
    const deferral = { versionCode: 0, at: now - HOUR };
    expect(isAndroidPlayUpdateDeferred({ deferral, availableVersionCode: undefined, now })).toBe(true);
    expect(isAndroidPlayUpdateDeferred({ deferral, availableVersionCode: 18, now })).toBe(false);
  });
});

describe("android-play-in-app-update-orchestrator D3 install-ready dismiss (this run only)", () => {
  it("starts not dismissed and stays dismissed for the rest of the run", () => {
    expect(isAndroidFlexibleInstallReadyDismissedForThisRun()).toBe(false);
    dismissAndroidFlexibleInstallReadyForThisRun();
    expect(isAndroidFlexibleInstallReadyDismissedForThisRun()).toBe(true);
  });
});
