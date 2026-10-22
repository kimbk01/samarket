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
 * 2) winner + suppressed → 세션을 되살리지 않는 준수 보고(새 UUID 무음 보고 후 즉시 종료) — 통화 정상화 계획 v2 §3-2
 * 3) bottom general orphan + suppressed → 같은 준수 보고 (completion-only 는 2026-10-22 iOS 강제 종료·VoIP 차단 원인)
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

  it("2: winner + terminalSuppressed → 준수 보고(세션 미부활 · completion-only 금지)", () => {
    const branch = winnerAnsweredElsewhereBranch(voip());
    const suppressIdx = branch.indexOf("isTerminalSuppressed(sessionId: sessionId)");
    const fulfillIdx = branch.indexOf("fulfillOrphanTerminalVoipPush(");
    expect(suppressIdx).toBeGreaterThanOrEqual(0);
    expect(fulfillIdx).toBeGreaterThan(suppressIdx);
    const suppressedArm = branch.slice(
      suppressIdx,
      branch.indexOf("ios_voip_answered_elsewhere_winner_untracked"),
    );
    expect(suppressedArm).toContain("reportComplianceIncomingThenEnd(");
    expect(suppressedArm).not.toContain("completion()");
    expect(suppressedArm).not.toContain("fulfillOrphanTerminalVoipPush(");
  });

  it("3: general orphan + terminalSuppressed → 준수 보고(no report_then_end of same session · completion-only 금지)", () => {
    const tail = generalOrphanTail(voip());
    expect(tail).toContain("ios_voip_terminal_already_suppressed");
    const suppressIdx = tail.indexOf("isTerminalSuppressed(sessionId: sessionId)");
    const fulfillIdx = tail.indexOf("fulfillOrphanTerminalVoipPush(");
    expect(suppressIdx).toBeGreaterThanOrEqual(0);
    expect(fulfillIdx).toBeGreaterThan(suppressIdx);
    const suppressedArm = tail.slice(suppressIdx, fulfillIdx);
    expect(suppressedArm).toContain("reportComplianceIncomingThenEnd(");
    expect(suppressedArm).not.toContain("completion()");
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
