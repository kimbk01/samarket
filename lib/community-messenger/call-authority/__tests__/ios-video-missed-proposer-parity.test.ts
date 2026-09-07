import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const videoRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallRuntime.swift"), "utf8");
const voiceRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallRuntime.swift"), "utf8");
const videoApi = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallApi.swift"), "utf8");

describe("CUT7 #2 iOS Video missed proposer parity (V1–V11 source)", () => {
  it("V1: Video incoming register schedules missed timer", () => {
    const src = videoRuntime();
    expect(src).toContain("scheduleMissedLocked(sessionId: sid)");
    expect(src).toContain("func registerIncomingSession");
  });

  it("V2: timeout while ringing calls missedAsync (propose-first)", () => {
    const src = videoRuntime();
    expect(src).toContain("NativeVideoCallApi.missedAsync");
    expect(src).toContain("missed_propose");
    const perform = src.slice(
      src.indexOf("performMissedTimeoutIfCurrent"),
      src.indexOf("handleMissedProposeResultLocked"),
    );
    expect(perform).toContain("missedAsync");
    expect(perform).not.toContain("applyMissedDismissLocked");
  });

  it("V3: server accept path dismisses only after ok", () => {
    const src = videoRuntime();
    const handle = src.slice(src.indexOf("handleMissedProposeResultLocked"));
    expect(handle).toContain("if !ok");
    expect(handle).toContain("try? applyMissedDismissLocked");
    expect(handle.indexOf("if !ok")).toBeLessThan(handle.indexOf("applyMissedDismissLocked"));
  });

  it("V4: early ring_deadline_not_reached keeps presentation", () => {
    const src = videoRuntime();
    expect(src).toContain("ring_deadline_not_reached");
    expect(src).toContain("keep_presentation=1");
    expect(src).toContain("missed_early_rejected");
  });

  it("V5: Accept cancels timer before accepting", () => {
    const src = videoRuntime();
    const beginAccept = src.slice(src.indexOf("func beginAccept"), src.indexOf("func markConnecting"));
    expect(beginAccept).toContain("cancelMissedLocked()");
    expect(beginAccept.indexOf("cancelMissedLocked()")).toBeLessThan(
      beginAccept.indexOf("state = .accepting"),
    );
  });

  it("V6: Reject cancels timer", () => {
    const src = videoRuntime();
    const beginReject = src.slice(src.indexOf("func beginReject"), src.indexOf("func markRejected"));
    expect(beginReject).toContain("cancelMissedLocked()");
  });

  it("V7: End / reset cancel timer", () => {
    const src = videoRuntime();
    expect(src).toContain("func beginEnd");
    const reset = src.slice(src.indexOf("func reset"), src.indexOf("func findOtherLiveSessionCallId"));
    expect(reset).toContain("cancelMissedLocked()");
  });

  it("V8/V9: generation + ringing guard; CallKit end only after accept", () => {
    const src = videoRuntime();
    expect(src).toContain("generation == expectedGeneration");
    expect(src).toContain("state == .ringing");
    expect(src).toContain("CallKitProvider.shared.reportCallEnded");
  });

  it("V10: missedAsync action exists on Video API (no API rewrite required)", () => {
    expect(videoApi()).toContain('action: "missed"');
  });

  it("V11: Voice/Video both propose-first", () => {
    const voice = voiceRuntime();
    const video = videoRuntime();
    expect(voice).toContain("missedAsync");
    expect(voice).toContain("ring_deadline_not_reached");
    expect(video).toContain("missedAsync");
    expect(video).toContain("ring_deadline_not_reached");
    expect(video).toContain("PROPOSER only");
  });
});
