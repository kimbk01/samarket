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

describe("NORMAL iOS Video missed dismiss (source)", () => {
  it("incoming register schedules missed timer", () => {
    const src = videoRuntime();
    expect(src).toContain("scheduleMissedLocked(sessionId: sid)");
    expect(src).toContain("func registerIncomingSession");
  });

  it("timeout dismisses via markMissedLocked (not propose-first)", () => {
    const src = videoRuntime();
    expect(src).toContain("markMissedLocked");
    expect(src).toContain("NativeVideoCallApi.missedAsync");
    expect(src).not.toContain("handleMissedProposeResultLocked");
    expect(src).not.toContain("scheduleMissedRetryLocked");
    expect(src).not.toContain("ring_deadline_not_reached");
    const perform = src.slice(
      src.indexOf("performMissedTimeoutIfCurrent"),
      src.indexOf("private func scheduleMissedLocked"),
    );
    expect(perform).toContain("markMissedLocked");
  });

  it("Accept/Reject cancel timer", () => {
    const src = videoRuntime();
    const beginAccept = src.slice(src.indexOf("func beginAccept"), src.indexOf("func markConnecting"));
    expect(beginAccept).toContain("cancelMissedLocked()");
    const beginReject = src.slice(src.indexOf("func beginReject"), src.indexOf("func markRejected"));
    expect(beginReject).toContain("cancelMissedLocked()");
  });

  it("missedAsync action exists on Video API", () => {
    expect(videoApi()).toContain('action: "missed"');
  });

  it("Voice/Video both local-dismiss", () => {
    const voice = voiceRuntime();
    const video = videoRuntime();
    expect(voice).toContain("missedAsync");
    expect(video).toContain("missedAsync");
    expect(voice).not.toContain("ring_deadline_not_reached");
    expect(video).not.toContain("ring_deadline_not_reached");
  });
});
