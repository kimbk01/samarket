import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");
const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");
const voiceRuntime = () => read("ios/App/App/Call/NativeVoiceCallRuntime.swift");
const videoRuntime = () => read("ios/App/App/Call/Video/NativeVideoCallRuntime.swift");
const voiceIncoming = () => read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
const videoIncoming = () =>
  read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");

describe("CUT7 #4 missed_timeout → CallKit .unanswered (M1–M12 source)", () => {
  it("M1: VoIP missed_call → .unanswered", () => {
    const src = voip();
    expect(src).toContain('kind == "missed_call"');
    expect(src).toContain("callKitEndReason = .unanswered");
    expect(src).toContain("reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)");
  });

  it("M2: Voice local missed proposal accepted → .unanswered", () => {
    const src = voiceRuntime();
    expect(src).toContain("missedAsync");
    expect(src).toContain("ios_native_voice_missed_local_dismiss");
    expect(src).toContain("endedReason: .unanswered");
    const early = src.slice(
      src.indexOf("ios_native_voice_missed_early_rejected"),
      src.indexOf("ios_native_voice_missed_local_dismiss"),
    );
    expect(early).toContain("keep_presentation=1");
    expect(early).not.toContain(".unanswered");
  });

  it("M3: Video local missed proposal accepted → .unanswered", () => {
    const src = videoRuntime();
    expect(src).toContain("missedAsync");
    expect(src).toContain('details: "source=server_accepted"');
    expect(src).toContain("endedReason: .unanswered");
  });

  it("M4: Voice early missed proposal rejected → no dismiss / no .unanswered", () => {
    const src = voiceRuntime();
    expect(src).toContain("ios_native_voice_missed_early_rejected");
    expect(src).toContain("keep_presentation=1");
    const earlyBlock = src.slice(
      src.indexOf("ios_native_voice_missed_early_rejected"),
      src.indexOf("ios_native_voice_missed_propose_blocked"),
    );
    expect(earlyBlock).not.toContain("reportCallEnded");
    expect(earlyBlock).not.toContain(".unanswered");
  });

  it("M5: Video early missed proposal rejected → no dismiss / no .unanswered", () => {
    const src = videoRuntime();
    expect(src).toContain("missed_early_rejected");
    expect(src).toContain("keep_presentation=1");
    const earlyBlock = src.slice(
      src.indexOf('"missed_early_rejected"'),
      src.indexOf("missed_propose_blocked"),
    );
    expect(earlyBlock).not.toContain("reportCallEnded");
    expect(earlyBlock).not.toContain(".unanswered");
  });

  it("M6: caller_cancelled → .remoteEnded preserved", () => {
    const src = voip();
    expect(src).toContain('kind == "call_canceled"');
    expect(src).toContain("callKitEndReason = .remoteEnded");
    // Mapping: elsewhere / missed / else remoteEnded — cancel falls to else.
    expect(src).toMatch(
      /if kind == "call_answered_elsewhere"[\s\S]*else if kind == "missed_call"[\s\S]*else \{\s*callKitEndReason = \.remoteEnded/,
    );
  });

  it("M7: answered_elsewhere → .answeredElsewhere preserved (#3 lock)", () => {
    expect(voip()).toContain("callKitEndReason = .answeredElsewhere");
    expect(voiceIncoming()).toContain("endedReason: .answeredElsewhere");
    expect(videoIncoming()).toContain("endedReason: .answeredElsewhere");
  });

  it("M8: local reject → CXEnd only, no .unanswered report", () => {
    const src = callkit();
    const endAction = src.slice(
      src.indexOf("func provider(_ provider: CXProvider, perform action: CXEndCallAction)"),
    );
    expect(endAction).not.toContain("reportCallEnded");
    expect(endAction).not.toContain(".unanswered");
  });

  it("M9: stale reclaim → .failed preserved", () => {
    const src = callkit();
    expect(src).toContain('logDetail: "stale_before_incoming"');
    expect(src).toContain('logDetail: "stale_runtime_before_incoming"');
    expect(src).toMatch(/reason:\s*\.failed[\s\S]*?stale_before_incoming/);
  });

  it("M10: duplicate local + VoIP missed → no resurrection invent", () => {
    expect(callkit()).toContain("DO NOT invent a random CallKit UUID");
    expect(voip()).toContain("fulfillOrphanTerminalVoipPush");
    expect(callkit()).toContain("endCallKitSession(sessionId: sid, reason: endedReason");
  });

  it("M11: Voice / Video missed reason parity", () => {
    expect(voiceRuntime()).toContain("endedReason: .unanswered");
    expect(videoRuntime()).toContain("endedReason: .unanswered");
    expect(voip()).toContain("callKitEndReason = .unanswered");
    expect(callkit()).toContain("ios_callkit_ended_unanswered");
  });

  it("M12: CUT7 #1–#3 regression guards", () => {
    // #1/#2 propose-first + early keep presentation
    expect(voiceRuntime()).toContain("ring_deadline_not_reached");
    expect(videoRuntime()).toContain("ring_deadline_not_reached");
    expect(voiceRuntime()).toContain("missedAsync");
    expect(videoRuntime()).toContain("missedAsync");
    // #3 elsewhere lock
    expect(voip()).toContain("callKitEndReason = .answeredElsewhere");
    expect(callkit()).not.toContain(".declinedElsewhere");
    // Default remains remoteEnded for non-mapped terminals
    expect(callkit()).toContain("endedReason: CXCallEndedReason = .remoteEnded");
  });
});
