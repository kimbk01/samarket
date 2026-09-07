import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const voiceRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallRuntime.swift"), "utf8");
const voiceApi = () => readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallApi.swift"), "utf8");
const videoRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallRuntime.swift"), "utf8");

describe("CUT7 iOS Voice missed presentation parity (NV1–NV10 source)", () => {
  it("NV1: Voice incoming register schedules missed timer", () => {
    const src = voiceRuntime();
    expect(src).toContain("func registerIncomingSession");
    expect(src).toContain("scheduleMissedLocked(sessionId:");
  });

  it("NV2: Accept cancels timer before accept pipeline", () => {
    const src = voiceRuntime();
    const beginAccept = src.slice(src.indexOf("func beginAccept"), src.indexOf("func markAcceptSucceeded"));
    expect(beginAccept).toContain("cancelMissedLocked()");
    expect(beginAccept.indexOf("cancelMissedLocked()")).toBeLessThan(beginAccept.indexOf("phase = .accepting"));
  });

  it("NV3: Reject cancels timer", () => {
    const beginReject = voiceRuntime().slice(
      voiceRuntime().indexOf("func beginReject"),
      voiceRuntime().indexOf("func markRejected"),
    );
    expect(beginReject).toContain("cancelMissedLocked()");
  });

  it("NV4/NV5: End / reset / replace cancel timer (caller cancel + answered elsewhere paths)", () => {
    const src = voiceRuntime();
    expect(src).toContain("func beginEnd");
    const beginEnd = src.slice(src.indexOf("func beginEnd"), src.indexOf("func markEnded"));
    expect(beginEnd).toContain("cancelMissedLocked()");
    const reset = src.slice(src.indexOf("func reset"), src.indexOf("func snapshot"));
    expect(reset).toContain("cancelMissedLocked()");
  });

  it("NV6: Timeout while ringing proposes missedAsync", () => {
    const src = voiceRuntime();
    expect(src).toContain("performMissedTimeoutIfCurrent");
    expect(src).toContain("NativeVoiceCallApi.missedAsync");
    expect(voiceApi()).toContain('action: "missed"');
  });

  it("NV7: early missed keeps presentation (ring_deadline_not_reached)", () => {
    const src = voiceRuntime();
    expect(src).toContain("ring_deadline_not_reached");
    expect(src).toContain("keep_presentation=1");
    expect(src).toContain("ios_native_voice_missed_early_rejected");
  });

  it("NV8/NV9: callId + generation guard; ok dismiss only", () => {
    const src = voiceRuntime();
    expect(src).toContain("generation == expectedGeneration");
    expect(src).toContain("phase == .incomingPresented");
    expect(src).toContain("CallKitProvider.shared.reportCallEnded");
  });

  it("NV10: Voice schedule/cancel mirrors Video naming", () => {
    const voice = voiceRuntime();
    const video = videoRuntime();
    expect(video).toContain("scheduleMissedLocked");
    expect(video).toContain("cancelMissedLocked");
    expect(voice).toContain("scheduleMissedLocked");
    expect(voice).toContain("cancelMissedLocked");
    expect(voice).toContain("missedTimeoutSeconds");
  });
});
