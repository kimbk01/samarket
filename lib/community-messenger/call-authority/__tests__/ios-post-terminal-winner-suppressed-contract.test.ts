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

  it("2: winner_untracked + terminalSuppressed → completion-only (prior gate KEEP)", () => {
    const branch = winnerAnsweredElsewhereBranch(voip());
    expect(branch).toContain("ios_voip_answered_elsewhere_winner_terminal_suppressed");
    const suppressIdx = branch.indexOf("isTerminalSuppressed(sessionId: sessionId)");
    const fulfillIdx = branch.indexOf("fulfillOrphanTerminalVoipPush(");
    expect(suppressIdx).toBeGreaterThanOrEqual(0);
    expect(fulfillIdx).toBeGreaterThan(suppressIdx);
    const suppressedArm = branch.slice(
      suppressIdx,
      branch.indexOf("ios_voip_answered_elsewhere_winner_untracked"),
    );
    expect(suppressedArm).toContain("completion()");
    expect(suppressedArm).not.toContain("fulfillOrphanTerminalVoipPush(");
  });

  it("3: general orphan + terminalSuppressed → completion-only (no report_then_end)", () => {
    const tail = generalOrphanTail(voip());
    expect(tail).toContain("ios_voip_terminal_already_suppressed");
    expect(tail).toContain("already_terminal_suppressed");
    const suppressIdx = tail.indexOf("isTerminalSuppressed(sessionId: sessionId)");
    const fulfillIdx = tail.indexOf("fulfillOrphanTerminalVoipPush(");
    expect(suppressIdx).toBeGreaterThanOrEqual(0);
    expect(fulfillIdx).toBeGreaterThan(suppressIdx);
    const suppressedArm = tail.slice(suppressIdx, fulfillIdx);
    expect(suppressedArm).toContain("completion()");
    expect(suppressedArm).not.toContain("fulfillOrphanTerminalVoipPush(");
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
