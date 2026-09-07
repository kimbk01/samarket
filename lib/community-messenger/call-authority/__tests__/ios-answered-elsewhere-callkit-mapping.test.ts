import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");
const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");
const voiceIncoming = () => read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
const videoIncoming = () =>
  read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");

describe("CUT7 #3 answered_elsewhere → CallKit .answeredElsewhere (AE1–AE12 source)", () => {
  it("AE1: VoIP call_answered_elsewhere loser passes .answeredElsewhere", () => {
    const src = voip();
    expect(src).toContain('kind == "call_answered_elsewhere"');
    expect(src).toContain(
      'kind == "call_answered_elsewhere" ? .answeredElsewhere : .remoteEnded',
    );
    expect(src).toContain("reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)");
  });

  it("AE2: accept CAS answered_elsewhere → .answeredElsewhere (Voice + Video)", () => {
    expect(voiceIncoming()).toContain("endedReason: .answeredElsewhere");
    expect(videoIncoming()).toContain("endedReason: .answeredElsewhere");
    expect(voiceIncoming()).toContain('err.contains("answered_elsewhere")');
    expect(videoIncoming()).toContain('err.contains("answered_elsewhere")');
  });

  it("AE3/AE4: default reportCallEnded remains .remoteEnded (caller cancel / remote end)", () => {
    const src = callkit();
    expect(src).toContain("endedReason: CXCallEndedReason = .remoteEnded");
    // Missed / cancel / plugin paths still call reportCallEnded without overriding reason.
    expect(voip()).toContain(
      'kind == "call_answered_elsewhere" ? .answeredElsewhere : .remoteEnded',
    );
  });

  it("AE5: missed_timeout does not map to .unanswered", () => {
    const src = callkit();
    expect(src).not.toContain(".unanswered");
    expect(voip()).not.toContain(".unanswered");
    expect(voiceIncoming()).not.toContain(".unanswered");
    expect(videoIncoming()).not.toContain(".unanswered");
  });

  it("AE6: stale reclaim remains .failed", () => {
    const src = callkit();
    expect(src).toContain("logDetail: \"stale_before_incoming\"");
    expect(src).toContain("logDetail: \"stale_runtime_before_incoming\"");
    expect(src).toMatch(/reason:\s*\.failed[\s\S]*?stale_before_incoming/);
    expect(src).toMatch(/reason:\s*\.failed[\s\S]*?stale_runtime_before_incoming/);
  });

  it("AE7: local CXEndCallAction does not call reportCallEnded", () => {
    const src = callkit();
    const endAction = src.slice(src.indexOf("func provider(_ provider: CXProvider, perform action: CXEndCallAction)"));
    expect(endAction).not.toContain("reportCallEnded");
  });

  it("AE8/AE9: Voice + Video share CallKitProvider answeredElsewhere mapping (no duplicate impl)", () => {
    expect(voiceIncoming()).toContain("CallKitProvider.shared.reportCallEnded");
    expect(videoIncoming()).toContain("CallKitProvider.shared.reportCallEnded");
    expect(voiceIncoming()).toContain("endedReason: .answeredElsewhere");
    expect(videoIncoming()).toContain("endedReason: .answeredElsewhere");
    // Mapping lives once on CallKitProvider — no per-media duplicate end helpers.
    expect(callkit()).toContain("ios_callkit_ended_answered_elsewhere");
  });

  it("AE10: duplicate answered_elsewhere ends existing UUID (no resurrection invent)", () => {
    const src = callkit();
    expect(src).toContain("endCallKitSession(sessionId: sid, reason: endedReason");
    // Orphan invent ban preserved.
    expect(src).toContain("DO NOT invent a random CallKit UUID");
    expect(voip()).toContain("fulfillOrphanTerminalVoipPush");
  });

  it("AE11: winner device skips CallKit end on answered_elsewhere", () => {
    const src = voip();
    expect(src).toContain("ios_voip_answered_elsewhere_ignored_winner");
    expect(src).toContain("winner_device");
    const winnerBranch = src.slice(
      src.indexOf('kind == "call_answered_elsewhere"'),
      src.indexOf("let terminalReason"),
    );
    expect(winnerBranch).toContain("answered == local");
    expect(winnerBranch).toContain("completion()");
    expect(winnerBranch).not.toContain("endedReason: .answeredElsewhere");
  });

  it("AE12: CUT1–6 / orphan report-then-end / declinedElsewhere not introduced", () => {
    const src = callkit();
    expect(src).not.toContain(".declinedElsewhere");
    expect(voip()).toContain("ios_voip_terminal_orphan_report_then_end");
    expect(src).toContain("pendingCallKitEndReasonBySessionId");
    // Winner untracked orphan still uses .remoteEnded (not answeredElsewhere).
    expect(voip()).toContain("callKitEndReason: .remoteEnded");
  });
});
