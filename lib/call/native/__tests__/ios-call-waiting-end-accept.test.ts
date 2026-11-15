import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iOS 대기 통화 「종료 및 수락」 — docs/audit/ios-call-waiting-end-and-accept-plan-2026-11-16.md D1~D3 · Owner 「구현 승인」 2026-11-16.
 * 대기 통화가 아닌 통화(일반 수신·발신·종료·무응답)의 동작이 바뀌지 않음도 함께 고정한다.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const coord = read("ios/App/App/Call/NativeCallWaitingCoordinator.swift");
const voiceRuntime = read("ios/App/App/Call/NativeVoiceCallRuntime.swift");
const videoRuntime = read("ios/App/App/Call/Video/NativeVideoCallRuntime.swift");
const voiceHost = read("ios/App/App/Call/NativeVoiceCallUiHost.swift");
const videoHost = read("ios/App/App/Call/Video/NativeVideoCallUiHost.swift");
const callKit = read("ios/App/App/Push/CallKitProvider.swift");
const macAcceptor = read("ios/App/App/Call/DibayMacIncomingCallAcceptor.swift");

describe("D1 — 진행 중 통화 정리(런타임 비움)가 끝난 뒤에만 대기 통화 수락", () => {
  it("수락 준비·8초 검사·정리 완료 알림이 런타임 보유 판정을 쓴다", () => {
    const prepare = coord.slice(coord.indexOf("func prepareAnswer"), coord.indexOf("// MARK: - Hooks"));
    expect(prepare).not.toContain("liveCallSessionId");
    expect(prepare.match(/runtimeHolds\(sessionId: (current|waiting)\.liveSessionId\)/g)?.length).toBe(2);
    const cleaned = coord.slice(coord.indexOf("func onCallCleanedUp"), coord.indexOf("func onCallKitSessionEnded"));
    expect(cleaned).not.toContain("liveCallSessionId");
    expect(cleaned).toContain("guard !Self.runtimeHolds(sessionId: current.liveSessionId) else { return }");
  });

  it("런타임 보유 판정은 음성·영상 런타임 세션 id 로만 본다(단계 무관)", () => {
    const fn = coord.slice(coord.indexOf("private static func runtimeHolds"));
    expect(fn).toContain("NativeVoiceCallRuntime.shared.snapshot().session?.sessionId == sid");
    expect(fn).toContain("NativeVideoCallRuntime.shared.snapshot().session?.sessionId == sid");
  });

  it("대기로 보여줄지 판정(연결됨 기준)은 그대로", () => {
    expect(coord).toContain("guard CallTerminationPolicy.runtimePhase(callId: live) == .connected else { return nil }");
  });
});

describe("D2 — 승격 때 울림 시간은 대기 VoIP 받은 때부터 30초", () => {
  it("승격만 남은 시간을 넘긴다", () => {
    expect(coord).toContain("let remaining = max(1, Self.ringTimeoutSeconds - elapsed)");
    expect(coord.match(/missedTimeoutSeconds: remaining/g)?.length).toBe(2);
    expect(coord).toContain("receivedAt: Date()");
  });

  it("런타임 기본값은 30초 그대로", () => {
    expect(voiceRuntime).toContain("private static let missedTimeoutSeconds: TimeInterval = 30");
    expect(videoRuntime).toContain("private static let missedTimeoutSeconds: TimeInterval = 30");
    expect(voiceRuntime).toContain("missedTimeoutSeconds ?? Self.missedTimeoutSeconds");
    expect(videoRuntime).toContain("missedTimeoutSeconds ?? Self.missedTimeoutSeconds");
  });

  it("일반 수신 등록 호출부는 울림 시간을 넘기지 않는다", () => {
    for (const src of [callKit, macAcceptor]) {
      expect(src).not.toContain("missedTimeoutSeconds");
    }
    expect(callKit).toContain("try NativeVoiceCallRuntime.shared.registerIncomingSession(session)");
  });
});

describe("D3 — 다른 통화 화면이 닫힌 뒤 새 통화 화면 표시", () => {
  it("음성·영상 화면 표시 직전에 같은 이어받기 판정을 거친다", () => {
    expect(voiceHost).toContain("enum DibayCallScreenHandover");
    const voicePresent = voiceHost.slice(voiceHost.indexOf("static func ensurePresented"), voiceHost.indexOf("static func renderState"));
    expect(voicePresent.indexOf("DibayCallScreenHandover.waitForOtherCallScreen")).toBeLessThan(
      voicePresent.indexOf("presenter.present(controller, animated: true)")
    );
    const videoPresent = videoHost.slice(
      videoHost.indexOf("static func ensureIncomingPresented"),
      videoHost.indexOf("static func renderState")
    );
    expect(videoPresent.indexOf("DibayCallScreenHandover.waitForOtherCallScreen")).toBeLessThan(
      videoPresent.indexOf("presenter.present(controller")
    );
  });

  it("다른 통화 화면이 없으면 기다리지 않는다(단일 통화 경로 그대로)", () => {
    const helper = voiceHost.slice(voiceHost.indexOf("enum DibayCallScreenHandover"));
    expect(helper).toContain("voice.boundCallId != sid");
    expect(helper).toContain("video.boundCallId != sid");
    expect(helper).toMatch(/guard let stale = other, let host = stale\.presentingViewController else \{[\s\S]*?return false/);
    expect(helper).toContain("private static let maxAttempts = 20");
  });

  it("다시 표시는 그 통화가 아직 진행 중일 때만", () => {
    expect(voiceHost).toContain("guard let current = snap.session, current.sessionId == sid, !isTerminalPhase(snap.phase) else { return }");
    expect(videoHost).toMatch(/case \.ending, \.ended, \.failed:\s*return/);
  });
});
