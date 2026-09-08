import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const voiceRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallRuntime.swift"), "utf8");
const voiceApi = () => readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceCallApi.swift"), "utf8");
const videoRuntime = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/Video/NativeVideoCallRuntime.swift"), "utf8");

describe("NORMAL iOS Voice missed dismiss (source)", () => {
  it("incoming register schedules missed timer", () => {
    const src = voiceRuntime();
    expect(src).toContain("func registerIncomingSession");
    expect(src).toContain("scheduleMissedLocked(sessionId:");
  });

  it("Accept/Reject/End cancel timer", () => {
    const src = voiceRuntime();
    const beginAccept = src.slice(src.indexOf("func beginAccept"), src.indexOf("func markAcceptSucceeded"));
    expect(beginAccept).toContain("cancelMissedLocked()");
    const beginReject = src.slice(src.indexOf("func beginReject"), src.indexOf("func markRejected"));
    expect(beginReject).toContain("cancelMissedLocked()");
    const beginEnd = src.slice(src.indexOf("func beginEnd"), src.indexOf("func markEnded"));
    expect(beginEnd).toContain("cancelMissedLocked()");
  });

  it("timeout dismisses locally then best-effort missedAsync", () => {
    const src = voiceRuntime();
    expect(src).toContain("performMissedTimeoutIfCurrent");
    expect(src).toContain("ios_native_voice_missed_local_dismiss");
    expect(src).toContain("NativeVoiceCallApi.missedAsync");
    expect(src).not.toContain("ring_deadline_not_reached");
    expect(src).not.toContain("scheduleMissedRetryLocked");
    expect(voiceApi()).toContain('action: "missed"');
  });

  it("CallKit unanswered on local dismiss (KEEP map)", () => {
    expect(voiceRuntime()).toContain("endedReason: .unanswered");
  });

  it("Voice/Video share schedule/cancel naming", () => {
    const voice = voiceRuntime();
    const video = videoRuntime();
    expect(video).toContain("scheduleMissedLocked");
    expect(video).toContain("cancelMissedLocked");
    expect(voice).toContain("scheduleMissedLocked");
    expect(voice).toContain("cancelMissedLocked");
  });
});
