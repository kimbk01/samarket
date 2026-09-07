import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");
const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");
const service = () => read("lib/community-messenger/service.ts");
const voiceIncoming = () => read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
const videoIncoming = () =>
  read("ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift");
const voiceRuntime = () => read("ios/App/App/Call/NativeVoiceCallRuntime.swift");
const videoRuntime = () => read("ios/App/App/Call/Video/NativeVideoCallRuntime.swift");

describe("CUT7 #5 late VoIP terminal applicability (LT1–LT13 source)", () => {
  it("LT1: ringing + missed_call still maps to .unanswered end", () => {
    const src = voip();
    expect(src).toContain('kind == "missed_call"');
    expect(src).toContain("callKitEndReason = .unanswered");
    expect(src).toContain("shouldApplyVoipTerminal");
    // Suppress only when post-accept — ringing still applies.
    expect(src).toMatch(
      /missed_call[\s\S]*call_canceled[\s\S]*call_rejected[\s\S]*return !postAccept/,
    );
  });

  it("LT2: post-accept + late missed_call suppressed (no reportCallEnded)", () => {
    const src = voip();
    expect(src).toContain("ios_voip_terminal_stale_suppressed");
    expect(src).toContain("isPostAcceptEstablishedSession");
    expect(src).toContain(".accepting, .accepted, .tokenPending, .joining, .connected");
    expect(src).toContain(".accepting, .connecting, .connected");
    const guard = src.slice(
      src.indexOf("func shouldApplyVoipTerminal"),
      src.indexOf("func isPostAcceptEstablishedSession"),
    );
    expect(guard).toContain('kind == "missed_call"');
    expect(guard).toContain("return !postAccept");
  });

  it("LT3: loser answered_elsewhere → .answeredElsewhere preserved", () => {
    expect(voip()).toContain("callKitEndReason = .answeredElsewhere");
    expect(voiceIncoming()).toContain("endedReason: .answeredElsewhere");
    expect(videoIncoming()).toContain("endedReason: .answeredElsewhere");
  });

  it("LT4: winner / post-accept answered_elsewhere not ended", () => {
    const src = voip();
    expect(src).toContain("ios_voip_answered_elsewhere_ignored_winner");
    const guard = src.slice(
      src.indexOf("func shouldApplyVoipTerminal"),
      src.indexOf("func isPostAcceptEstablishedSession"),
    );
    expect(guard).toContain('kind == "call_answered_elsewhere"');
    expect(guard).toContain("if postAccept");
    expect(guard).toContain("return false");
  });

  it("LT5: ringing + caller cancel → .remoteEnded path preserved", () => {
    const src = voip();
    expect(src).toContain('kind == "call_canceled"');
    expect(src).toContain("callKitEndReason = .remoteEnded");
    const guard = src.slice(
      src.indexOf("func shouldApplyVoipTerminal"),
      src.indexOf("func isPostAcceptEstablishedSession"),
    );
    expect(guard).toContain('kind == "call_canceled"');
    // call_ended is early-return true — not gated by !postAccept.
    expect(guard).toMatch(/if kind == "call_ended" \{\s*return true/);
    expect(guard).not.toMatch(/call_ended" \|\| kind == "call_canceled"/);
  });

  it("LT6: call_ended always applies (never suppressed by phase)", () => {
    const guard = voip().slice(
      voip().indexOf("func shouldApplyVoipTerminal"),
      voip().indexOf("func isPostAcceptEstablishedSession"),
    );
    expect(guard).toContain('kind == "call_ended"');
    expect(guard).toMatch(/if kind == "call_ended" \{\s*return true/);
  });

  it("LT7: local reject CXEnd semantics preserved (no .unanswered)", () => {
    const endAction = callkit().slice(
      callkit().indexOf(
        "func provider(_ provider: CXProvider, perform action: CXEndCallAction)",
      ),
    );
    expect(endAction).not.toContain("reportCallEnded");
    expect(endAction).not.toContain(".unanswered");
  });

  it("LT8: duplicate terminal still uses existing end/idempotent paths", () => {
    expect(callkit()).toContain("DO NOT invent a random CallKit UUID");
    expect(voip()).toContain("fulfillOrphanTerminalVoipPush");
    expect(voip()).toContain("reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)");
  });

  it("LT9/LT10: Voice + Video post-accept phases both gated", () => {
    const src = voip();
    expect(src).toContain("NativeVoiceCallRuntime.shared.snapshot()");
    expect(src).toContain("NativeVideoCallRuntime.shared.snapshot()");
    expect(src).toContain(".accepting, .accepted, .tokenPending, .joining, .connected");
    expect(src).toContain(".accepting, .connecting, .connected");
  });

  it("LT11: CUT7 #3 .answeredElsewhere preserved", () => {
    expect(voip()).toContain("callKitEndReason = .answeredElsewhere");
    expect(callkit()).toContain("ios_callkit_ended_answered_elsewhere");
  });

  it("LT12: CUT7 #4 .unanswered preserved", () => {
    expect(voip()).toContain("callKitEndReason = .unanswered");
    expect(voiceRuntime()).toContain("endedReason: .unanswered");
    expect(videoRuntime()).toContain("endedReason: .unanswered");
  });

  it("LT13: cancel/reject after accept — server evidence + native guard", () => {
    // Server: reject only from ringing; cancel on active → ended (call_ended push).
    const svc = service();
    expect(svc).toContain('if (input.action === "reject")');
    expect(svc).toContain("status !== \"ringing\") return null");
    expect(svc).toContain('if (status === "active") return { nextStatus: "ended"');
    // Native: ringing-era kinds suppressed post-accept; call_ended never.
    const guard = voip().slice(
      voip().indexOf("func shouldApplyVoipTerminal"),
      voip().indexOf("func isPostAcceptEstablishedSession"),
    );
    expect(guard).toContain('kind == "call_rejected"');
    expect(guard).toContain('kind == "call_canceled"');
    expect(guard).toMatch(/if kind == "call_ended" \{\s*return true/);
  });
});
