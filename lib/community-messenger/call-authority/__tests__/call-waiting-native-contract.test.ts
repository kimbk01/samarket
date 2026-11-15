import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 대기 통화 네이티브 1단계 계약 — docs/audit/call-waiting-stage2-design-2026-11-15.md §9-1 (Owner 「네이티브부터 승인」 2026-11-15).
 * 서버가 waiting=true 를 보내기 전에는 동작 변화 없음 · 대기 조건이 아니면 기존 busy 처리 그대로.
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const A = "android/app/src/main/java/com/dibay/app";

describe("Android 대기 통화", () => {
  for (const [lane, file] of [
    ["voice", `${A}/nativevoice/NativeVoiceCallRuntime.java`],
    ["video", `${A}/nativevideo/NativeVideoCallRuntime.java`],
  ] as const) {
    it(`${lane}: waiting 일 때만 대기 알림, 실패면 기존 busy_suppressed 그대로`, () => {
      const src = read(file);
      const waitingAt = src.indexOf("NativeCallWaitingPresenter.tryPresent(");
      const suppressedAt = src.indexOf('"incoming_busy_suppressed"');
      expect(waitingAt).toBeGreaterThan(-1);
      expect(suppressedAt).toBeGreaterThan(waitingAt);
      expect(src.slice(waitingAt - 40, waitingAt)).toContain("if (waiting");
      expect(src).toContain("action=suppress_no_reject");
      // 기존 시그니처는 waiting=false 로 위임
      expect(src).toContain("return handleIncoming(context, callId, roomId, callerId, callerName, mediaType, false);");
      // 정리 끝에서 대기 통화 이어 처리
      expect(src).toContain("NativeCallWaitingPresenter.onCallCleanedUp(app, sid);");
    });
  }

  it("FCM payload: waiting 은 \"true\"/\"1\" 만 참, 만료 갱신 때도 유지", () => {
    const src = read(`${A}/FcmPayloadResolver.java`);
    expect(src).toContain(".withWaiting(isCallWaitingFlag(data));");
    expect(src).toContain('return "true".equalsIgnoreCase(v) || "1".equals(v);');
    const withExpires = src.slice(src.indexOf("IncomingCallPayload withExpiresAt("));
    expect(withExpires.slice(0, withExpires.indexOf("IncomingCallPayload withWaiting("))).toContain("waiting);");
    expect(read(`${A}/IncomingCallPushDelivery.java`).match(/payload\.waiting\);/g)?.length).toBe(2);
  });

  it("presenter: 대기 통화는 SESSIONS 밖 · 종료 후 받기 = 기존 end → 정리 끝 → 일반 수신 등록 후 accept", () => {
    const src = read(`${A}/nativecall/NativeCallWaitingPresenter.java`);
    expect(src).toContain('if (!isConnected(live)) {');
    expect(src).toContain('NativeVoiceCallRuntime.end(app, live, "call_waiting_end_and_accept");');
    expect(src).toContain("if (presented && accept) NativeVoiceCallRuntime.accept(app, p.callId);");
    expect(src).toContain("if (presented && accept) NativeVideoCallRuntime.accept(app, p.callId);");
    expect(src).toContain("NativeVoiceCallApi.rejectAsync(");
    expect(src).toContain("TONE_SUP_CALL_WAITING");
    // 화면 문구는 리소스로만 — 주석을 뺀 코드의 문자열에 한글 없음
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/"[^"\n]*[가-힣][^"\n]*"/);
  });

  it("종료 신호·Manifest·문구 리소스", () => {
    expect(read(`${A}/IncomingCallTerminalHandler.java`)).toContain(
      "com.dibay.app.nativecall.NativeCallWaitingPresenter.onTerminal(app, sid, kind);",
    );
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain(
      'android:name=".nativecall.NativeCallWaitingActionReceiver"',
    );
    for (const f of ["android/app/src/main/res/values/strings.xml", "android/app/src/main/res/values-ko/strings.xml"]) {
      const xml = read(f);
      for (const key of ["dibay_call_waiting_end_and_accept", "dibay_call_waiting_text_voice", "dibay_call_waiting_text_video"]) {
        expect(xml, `${f}:${key}`).toContain(`name="${key}"`);
      }
    }
  });
});

describe("iOS 대기 통화", () => {
  const callkit = () => read("ios/App/App/Push/CallKitProvider.swift");

  it("waiting + 연결된 통화일 때만 정상 보고(무음 종료 대신), 그 밖은 device_busy_live_call 그대로", () => {
    const src = callkit();
    expect(src).toContain("isCallWaiting: Bool = false,");
    expect(src).toContain("NativeCallWaitingCoordinator.shared.eligibleLiveSessionId(incoming: sessionId)");
    expect(src).toMatch(/if waitingLiveSessionId == nil,\s*!isTerminalSuppressed\(sessionId: sessionId\),\s*let live = CallTerminationPolicy\.liveCallSessionId/);
    expect(src).toContain('markTerminalSuppressed(sessionId: sessionId, reason: "device_busy_live_call")');
    expect(src).toContain("update.supportsHolding = false");
  });

  it("CallKit 「종료 및 수락」·「거절」 분기", () => {
    const src = callkit();
    expect(src).toContain("NativeCallWaitingCoordinator.shared.prepareAnswer(sessionId: sessionId)");
    expect(src).toContain("NativeCallWaitingCoordinator.shared.decline(sessionId: sessionId)");
  });

  it("coordinator: 맥 제외 · 연결됨만 · 정리 끝 뒤 런타임 등록", () => {
    const src = read("ios/App/App/Call/NativeCallWaitingCoordinator.swift");
    expect(src).toContain("guard DibayCallPlatformCapability.supportsCallKitCallUi else { return nil }");
    expect(src).toContain("guard CallTerminationPolicy.runtimePhase(callId: live) == .connected else { return nil }");
    expect(src).toContain("NativeVoiceCallRuntime.shared.registerIncomingSession(");
    for (const f of [
      "ios/App/App/Call/NativeVoiceIncomingCallCoordinator.swift",
      "ios/App/App/Call/Video/NativeVideoIncomingCallCoordinator.swift",
    ]) {
      expect(read(f), f).toContain("NativeCallWaitingCoordinator.shared.onCallCleanedUp(sessionId: sid)");
    }
    expect(read("ios/App/App/Push/VoIPPushRegistry.swift")).toContain("isCallWaiting: isCallWaiting");
    expect(read("ios/App/App.xcodeproj/project.pbxproj")).toContain("NativeCallWaitingCoordinator.swift in Sources");
  });
});
