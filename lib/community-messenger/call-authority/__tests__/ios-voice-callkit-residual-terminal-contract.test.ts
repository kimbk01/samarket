import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Voice CallKit residual — terminal coverage + ordering (no new SSOT).
 *
 * DIBAY Native Voice UI lifecycle ≠ iOS CallKit lifecycle was the residual root.
 * Contracts lock local CXEnd, remote reportCallEnded-first, cancel/missed coverage,
 * mediaFailed fallback-only, and idempotent end.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");
const voice = () => read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");

describe("iOS Voice CallKit residual terminal contract", () => {
  it("local end primary path requests CXEndCallAction", () => {
    expect(callkit()).toContain("func requestLocalEndCallAction");
    expect(callkit()).toContain("CXEndCallAction(call: uuid)");
    expect(voice()).toContain("requestLocalEndCallAction(sessionId: sid");
    expect(voice()).toContain("fromCallKitEndAction");
  });

  it("CXEnd perform does not also call reportCallEnded (no double writer)", () => {
    const endAction = callkit().slice(
      callkit().indexOf("func provider(_ provider: CXProvider, perform action: CXEndCallAction)"),
    );
    expect(endAction).not.toContain("reportCallEnded");
    expect(endAction).toContain("fromCallKitEndAction: true");
    expect(endAction).toContain("callKitEndCompletedSessionIds.insert");
  });

  it("reportCallEnded ends CallKit before Runtime remote cleanup", () => {
    const fn = callkit().slice(callkit().indexOf("func reportCallEnded("));
    const endIdx = fn.indexOf("endCallKitSession(sessionId: sid, reason: endedReason");
    const remoteIdx = fn.indexOf("handleRemoteTerminal(sessionId: sid)");
    expect(endIdx).toBeGreaterThanOrEqual(0);
    expect(remoteIdx).toBeGreaterThan(endIdx);
  });

  it("remote_terminal closes tracked CallKit when not already ended", () => {
    const fn = voice().slice(voice().indexOf("func handleRemoteTerminal"));
    expect(fn).toContain("hasTrackedCallKitSession");
    expect(fn).toContain("reportCallKitEnded: stillTracked");
    expect(fn).toContain("remote_terminal_no_runtime");
  });

  it("mediaFailed is fallback only after prior terminal suppress/complete", () => {
    const disc = voice().slice(voice().indexOf("func onDisconnected"));
    expect(disc).toContain("isTerminalSuppressed");
    expect(disc).toContain("isCallKitEndCompleted");
    expect(disc).toContain("ios_native_voice_agora_disconnect_after_terminal");
    expect(disc).toContain("failAfterFulfill");
  });

  it("endCallKitSession is idempotent per session", () => {
    const fn = callkit().slice(callkit().indexOf("func endCallKitSession("));
    expect(fn).toContain("callKitEndCompletedSessionIds.contains(sid)");
    expect(fn).toContain("ios_native_voice_callkit_end_idempotent");
    expect(fn).toContain("callKitEndCompletedSessionIds.insert(sid)");
  });

  it("VoIP cancel/missed/end still reportCallEnded when CallKit tracked", () => {
    expect(voip()).toContain("tracked_callkit_end");
    expect(voip()).toContain("reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)");
    expect(voip()).toContain("missed_call");
    expect(voip()).toContain("callKitEndReason = .unanswered");
  });

  it("orphan re-report writer-gap suppress gate preserved", () => {
    expect(voip()).toContain("ios_voip_terminal_already_suppressed");
    expect(voice()).toContain("markTerminalSuppressed(sessionId: sid, reason: reason)");
  });
});
