import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DIBAY 통화 푸시 · iOS CallKit SSOT HARD LOCK — docs/dibay-call-push-callkit-ssot-hard-lock.md
 * 2026-10-22 실기기: 이미 끝난 통화의 VoIP 를 CallKit 보고 없이 완료 → iOS 강제 종료 → 앱 VoIP 차단.
 * 이 테스트가 깨지면 iPhone 이 앱 꺼짐·잠금 상태에서 전화를 못 받게 될 수 있다. 문서 절차 없이 완화 금지.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("H1 서버 — iPhone VoIP 는 살아 있는 벨이 있는 기기에만", () => {
  const dispatch = () => read("lib/push/dispatch/dispatch-push-for-user.ts");

  it("decideIosCallTarget 이 통화 푸시 루프에서 쓰인다", () => {
    const src = dispatch();
    expect(src).toContain("export function decideIosCallTarget");
    expect(src).toMatch(/const iosDecision = decideIosCallTarget\(/);
    expect(src).toContain("orderCallPushTargetsNativeFirst(scopedTargets)");
  });

  it("missed_call VoIP 금지 · 벨 기록 없음/조회 실패 시 종료 VoIP 금지 · CallKit 기기 일반 알림 금지", () => {
    const src = dispatch();
    expect(src).toContain('reason: "ios_voip_missed_local_timeout"');
    expect(src).toContain('reason: "ios_voip_no_live_ring"');
    expect(src).toContain('reason: "ios_voip_ring_lookup_failed"');
    expect(src).toContain('reason: "ios_voip_actor_or_answered_device"');
    expect(src).toContain('reason: "ios_callkit_owns_call"');
    expect(src).toContain('return retry ?? "lookup_failed"');
  });

  it("종료 발송은 행동·받은 기기를 넘긴다", () => {
    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain("iosExcludeDeviceIds: [requestDeviceId, updated.answered_device_id]");
    expect(svc).toContain("iosExcludeDeviceIds: [requestDeviceId]");
    const ae = read("lib/push/send-community-messenger-call-answered-elsewhere-push.ts");
    expect(ae).toContain("exclude_device_ids: [answeredDeviceId]");
  });
});

describe("H2 iOS — 모든 VoIP 는 CallKit 에 보고", () => {
  const voip = () => read("ios/App/App/Push/VoIPPushRegistry.swift");
  const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");

  it("보고 없는 완료(completion_only) 분기가 없다", () => {
    const src = voip();
    expect(src).not.toMatch(/reason:\s*"completion_only/);
    expect(src).not.toContain("winner_untracked_terminal_suppressed");
    expect(src).not.toContain('detail: "winner_tracked"');
  });

  it("준수 보고 경로가 받은 기기·stale·already·CallKit 종료 후 늦은 수신에 쓰인다", () => {
    const src = voip();
    const uses = src.split("reportComplianceIncomingThenEnd(").length - 1;
    expect(uses).toBeGreaterThanOrEqual(5);
    expect(src).toContain('reason: "answered_elsewhere_winner"');
    expect(src).toContain('"stale_terminal_post_accept kind=');
    expect(src).toContain('"already_terminal kind=');
    expect(src).toContain('reason: "incoming_after_callkit_end"');
    expect(src).toContain("callProvider.isCallKitCallLive(sessionId: sessionId)");
  });

  it("준수 보고는 새 UUID · 무음 · 즉시 종료 · CallKit 실제 상태 기준", () => {
    const src = callkit();
    expect(src).toContain("private let callObserver = CXCallObserver()");
    const fn = src.slice(src.indexOf("func reportComplianceIncomingThenEnd"));
    expect(fn).toContain("let complianceUuid = UUID()");
    expect(fn).toContain('policy: "silent"');
    expect(fn).toContain("reportCall(with: complianceUuid, endedAt: Date(), reason: .remoteEnded)");
  });
});

describe("H3 iOS 음성 통화 종료 분류", () => {
  it("연결 후 상대 정상 퇴장 = 정상 종료 · 그 밖의 연결 후 끊김 = connectionLost", () => {
    const incoming = read("ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift");
    expect(incoming).toContain('if reason == "remote_offline=0" {');
    expect(incoming).toContain("failAfterFulfill(sessionId: sid, reason: .connectionLost, serverAction: \"end\")");
    const outgoing = read("ios/App/App/Call/NativeVoiceOutgoingCallCoordinator.swift");
    expect(outgoing).toContain("fail(sessionId: sid, reason: .connectionLost)");
    const notice = read("ios/App/App/Call/NativeCallInAppNotice.swift");
    expect(notice).toContain('return "통화 연결이 끊어졌습니다."');
    expect(notice).toMatch(/case \.connectionLost:\s*return \.disconnected/);
  });
});

describe("H4 iOS 음성 통화 스피커·음소거 = 실제 동작", () => {
  it("버튼이 엔진·CallKit 을 호출한다(모양만 바꾸기 금지)", () => {
    const vc = read("ios/App/App/Call/NativeVoiceCallViewController.swift");
    const speaker = vc.slice(vc.indexOf("@objc private func onSpeakerTapped"), vc.indexOf("@objc private func onMuteTapped"));
    expect(speaker).toContain("NativeVoiceCallAgoraEngine.shared.setSpeakerphoneEnabled(next)");
    const mute = vc.slice(vc.indexOf("@objc private func onMuteTapped"), vc.indexOf("@objc private func onEndTapped"));
    expect(mute).toContain("CallKitProvider.shared.requestSetMuted(");
    expect(mute).not.toContain("micMutedChrome.toggle()");
    const callkit = read("ios/App/App/Push/CallKitProvider.swift");
    expect(callkit).toContain("func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction)");
    const engine = read("ios/App/App/Call/NativeVoiceCallAgoraEngine.swift");
    expect(engine).toContain("rtc.setEnableSpeakerphone(enabled)");
    expect(engine).toContain("rtc.muteLocalAudioStream(muted)");
  });
});

describe("H5 VoIP 토큰 재전달", () => {
  it("웹 리스너 부착 후 재전달 요청 · 앱이 마지막 토큰 재전달", () => {
    const web = read("lib/push/native/register-native-push-client.ts");
    expect(web).toContain("dibayVoipCallPlugin.startVoipRegistration()");
    const plugin = read("ios/App/App/Plugins/DibayVoipCallPlugin.swift");
    expect(plugin).toContain("DibayPushTokenBridge.replayLastVoipTokenIfPresent()");
  });
});
