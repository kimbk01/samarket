import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * POST-TERMINAL CallKit resurrection — MERGE existing terminalSuppressed authority.
 *
 * Writer gap (55abc0d5-…): fail_after_fulfill → endCallKitSession without mark →
 * late call_ended → general orphan report_then_end → resurrection.
 *
 * Contracts:
 * 1) reportCallKitEnded cleanup marks terminalSuppressed BEFORE Runtime reset / map clear
 * 2) winner_untracked + suppressed → completion-only
 * 3) bottom general orphan + suppressed → completion-only
 * 4) genuine cold orphan (not suppressed) → report_then_end preserved
 */
const ROOT = process.cwd();
const voip = () => readFileSync(join(ROOT, "ios/App/App/Push/VoIPPushRegistry.swift"), "utf8");
const voiceIncoming = () =>
  readFileSync(join(ROOT, "ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift"), "utf8");

function winnerAnsweredElsewhereBranch(src: string): string {
  const start = src.indexOf('if kind == "call_answered_elsewhere"');
  const end = src.indexOf("// CUT7 #5: ringing-era terminals");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function generalOrphanTail(src: string): string {
  const start = src.indexOf("tracked_callkit_end");
  const end = src.indexOf("func shouldApplyVoipTerminal");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

function voiceCleanup(src: string): string {
  const start = src.indexOf("private func cleanup(");
  const end = src.indexOf("private func isCurrentAnswer");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("iOS post-terminal terminalSuppressed writer+reader MERGE", () => {
  it("1: fail_after_fulfill cleanup marks suppress BEFORE reset/map clear", () => {
    const cleanup = voiceCleanup(voiceIncoming());
    expect(cleanup).toContain("markTerminalSuppressed(sessionId: sid, reason: reason)");
    expect(cleanup).toContain("endCallKitSession(");
    expect(cleanup).toContain("NativeVoiceCallRuntime.shared.reset(sessionId: sid)");
    const markIdx = cleanup.indexOf("markTerminalSuppressed(sessionId: sid, reason: reason)");
    const resetIdx = cleanup.indexOf("NativeVoiceCallRuntime.shared.reset(sessionId: sid)");
    const endIdx = cleanup.indexOf("endCallKitSession(");
    expect(markIdx).toBeGreaterThanOrEqual(0);
    expect(markIdx).toBeLessThan(endIdx);
    expect(endIdx).toBeLessThan(resetIdx);
    // CallKit end before Runtime wipe — residual InCallService guard.
    // Only when reportCallKitEnded — not inventing always-on mark.
    const beforeMark = cleanup.slice(0, markIdx);
    expect(beforeMark).toMatch(/if reportCallKitEnded/);
  });

  it("2: winner branches never completion-only — mustReport NO skip or obligation report (A2)", () => {
    const branch = winnerAnsweredElsewhereBranch(voip());
    expect(branch).toContain("ios_voip_answered_elsewhere_winner_terminal_suppressed");
    // A2 (재감사 §4-15-1): completion-only arms replaced — iOS terminated the app when a report was required.
    expect(branch).not.toContain('detail: "winner_tracked"');
    expect(branch).not.toContain('detail: "winner_untracked_terminal_suppressed"');
    expect(branch).toContain('branch: "winner_tracked"');
    expect(branch).toContain('branch: "winner_untracked_terminal_suppressed"');
    expect(branch).toContain("satisfyReportObligationWithoutTouchingCall(");
  });

  it("3: general already-suppressed terminal → obligation report, not completion-only (A2)", () => {
    const tail = generalOrphanTail(voip());
    expect(tail).toContain("ios_voip_terminal_already_suppressed");
    const suppressIdx = tail.indexOf("isTerminalSuppressed(sessionId: sessionId)");
    const fulfillIdx = tail.indexOf("fulfillOrphanTerminalVoipPush(");
    expect(suppressIdx).toBeGreaterThanOrEqual(0);
    expect(fulfillIdx).toBeGreaterThan(suppressIdx);
    const suppressedArm = tail.slice(suppressIdx, fulfillIdx);
    expect(suppressedArm).toContain("satisfyReportObligationWithoutTouchingCall(");
    expect(suppressedArm).not.toContain('detail: "already_terminal_suppressed');
  });

  it("A2: iOS 26.4 mustReport delegate + obligation report never touches a live call", () => {
    const src = voip();
    expect(src).toContain("@available(iOS 26.4, *)");
    expect(src).toContain("didReceiveIncomingVoIPPushWith payload: PKPushPayload");
    expect(src).toContain("metadata.mustReport");
    // both delegates funnel into one handler with duplicate-delivery guard
    expect(src).toContain('via: "metadata"');
    expect(src).toContain('via: "legacy"');
    expect(src).toContain("isDuplicateDelivery(payload)");
    // mustReport NO → completion without CallKit API; live branches never marked suppressed
    const helper = src.slice(src.indexOf("private func satisfyReportObligationWithoutTouchingCall"));
    expect(helper).toContain("if mustReport == false {");
    expect(helper).toContain("markSuppressed: !callMayBeLive(branch: branch)");
    expect(src).toContain('branch == "winner_tracked" || branch == "stale_terminal_suppressed"');
    const ck = readFileSync(join(ROOT, "ios/App/App/Push/CallKitProvider.swift"), "utf8");
    const obligation = ck.slice(ck.indexOf("func reportForPushObligation("), ck.indexOf("static func callKitErrorSummary"));
    expect(obligation).toContain("provider.reportNewIncomingCall(with: uuid, update: update)");
    // never reconciles/ends other sessions or touches session maps / runtime
    expect(obligation).not.toContain("reconcileStaleSessionsBeforeIncoming");
    expect(obligation).not.toContain("callUuidBySessionId[");
    expect(obligation).not.toContain("NativeVoiceCallRuntime");
    expect(obligation).not.toContain("handleRemoteTerminal");
    // ends ONLY the call this report created (error == nil)
    expect(obligation).toMatch(/if error == nil \{\s*self\.provider\.reportCall\(with: uuid, endedAt: Date\(\), reason: \.remoteEnded\)/);
  });

  it("A2 L1: late incoming on terminal session ends the call this report created (gate bypass), not on error", () => {
    const ck = readFileSync(join(ROOT, "ios/App/App/Push/CallKitProvider.swift"), "utf8");
    const arm = ck.slice(ck.indexOf("if terminalAlreadySeen {\n        // PushKit required"), ck.indexOf("completion(error)\n    }\n  }"));
    expect(arm).toContain("if error == nil {");
    expect(arm).toContain("self.endCallCreatedByThisReport(");
    expect(arm).toContain("ios_callkit_terminal_report_not_created");
    expect(arm).not.toContain("self.endCallKitSession(");
    // idempotent gate itself is kept for normal ends
    expect(ck).toContain("if callKitEndCompletedSessionIds.contains(sid) {");
  });

  it("4: genuine cold orphan (not suppressed) → report_then_end preserved", () => {
    const src = voip();
    expect(src).toContain("ios_voip_terminal_orphan_report_then_end");
    expect(src).toContain("fulfillOrphanTerminalVoipPush(");
    const orphanFn = src.slice(src.indexOf("func fulfillOrphanTerminalVoipPush"));
    expect(orphanFn).toContain("reportIncomingCall(");
    // Terminal orphan must force silent — not payload default (audible one-ring).
    expect(orphanFn).toContain('ringtonePolicy: "silent"');
    // Tracked normal path still uses reportCallEnded.
    expect(src).toContain("tracked_incoming_end");
    expect(src).toContain("reportCallEnded(uuidString: sessionId, endedReason: callKitEndReason)");
  });
});
