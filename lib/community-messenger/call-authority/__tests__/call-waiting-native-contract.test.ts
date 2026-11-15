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

describe("Android 대기 통화 선택지 유지 (실기 CW1 FAIL 수정 · 2026-11-15)", () => {
  const presenter = () => read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallWaitingPresenter.java");

  it("대기 알림은 통화 화면이 안 보일 때만 전체 화면 인텐트 (heads-up 자동 내림 방지)", () => {
    const src = presenter();
    expect(src).toContain("if (!quiet) builder.setFullScreenIntent(ongoingCallScreen, true);");
    expect(src).toContain("NativeVoiceCallNotification.ongoingCallActivityIntent(app, live)");
    expect(src).toContain("NativeVideoCallNotification.ongoingCallActivityIntent(app, live)");
    for (const f of [
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallNotification.java",
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java",
    ]) {
      expect(read(f), f).toContain("public static PendingIntent ongoingCallActivityIntent(Context context, String callId)");
    }
  });

  it("표면 1개: 통화 화면이 보이면 조용한 알림(진행 중 통화 채널·FSI 없음) — AOSP Dialer QUIET 와 같음", () => {
    const src = presenter();
    expect(src).toContain("public static void setCallScreenVisible(Context context, Object host, boolean visible)");
    expect(src).toMatch(/\? NativeVoiceCallService\.CHANNEL_ID\s*: NativeVideoCallService\.CHANNEL_ID;/);
    expect(src).toContain(".setSilent(quiet)");
    expect(src).toContain("if (postedQuiet != null && postedQuiet != quiet) nm.cancel(id);");
    const banner = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallWaitingBanner.java");
    expect(banner).toContain("NativeCallWaitingPresenter.setCallScreenVisible(activity, this, hostResumed && !isInPip());");
    for (const f of [
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java",
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java",
    ]) {
      const src2 = read(f);
      expect(src2, f).toContain("if (waitingBanner != null) waitingBanner.onHostResumed();");
      expect(src2, f).toContain("if (waitingBanner != null) waitingBanner.onHostPaused();");
    }
  });

  it("통화 화면 대기 띠: 두 통화 화면이 붙이고·떼고, 버튼은 알림과 같은 처리", () => {
    const banner = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallWaitingBanner.java");
    expect(banner).toContain("NativeCallWaitingPresenter.reject(activity, callId)");
    expect(banner).toContain("NativeCallWaitingPresenter.endAndAccept(activity, callId)");
    expect(banner).toContain("NativeCallWaitingPresenter.addListener(view);");
    expect(presenter()).toContain("if (pending == null || pending.acceptRequested) return null;");
    for (const f of [
      "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallActivity.java",
      "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallActivity.java",
    ]) {
      const src = read(f);
      expect(src, f).toContain("waitingBanner = NativeCallWaitingBanner.attach(this);");
      expect(src, f).toContain("waitingBanner.detach();");
    }
  });

  it("보임 상태는 화면별 기록 — 옛 화면이 끝나며 새 화면의 「보임」을 덮지 않음 (설계 A)", () => {
    const src = presenter();
    expect(src).toContain("Collections.newSetFromMap(new IdentityHashMap<>())");
    expect(src).toContain("VISIBLE_HOSTS.remove(host);");
    expect(src).not.toMatch(/callScreenVisible = visible;/);
    // 진행 중 통화가 이미 정리됐으면(곧 이어받기) 시끄러운 대기 알림을 다시 올리지 않음
    expect(src).toContain('log("notice_repost_skipped", p.callId, "reason=live_call_gone");');
  });

  for (const [lane, runtime, activity] of [
    ["voice", `${A}/nativevoice/NativeVoiceCallRuntime.java`, `${A}/nativevoice/NativeVoiceCallActivity.java`],
    ["video", `${A}/nativevideo/NativeVideoCallRuntime.java`, `${A}/nativevideo/NativeVideoCallActivity.java`],
  ] as const) {
    it(`${lane}: 대기 통화가 있으면 통화 화면을 닫지 않고 이어받기 (설계 B · Dialer startOrFinishUi)`, () => {
      const src = read(runtime);
      const cls = lane === "voice" ? "NativeVoiceCallActivity" : "NativeVideoCallActivity";
      // 런타임의 통화 화면 닫기는 모두 finishCallScreen 한 곳을 지난다
      expect(src.match(new RegExp(`${cls}\\.finishIfActive\\(sid, `, "g"))?.length ?? 0).toBe(1);
      expect(src).toContain(`NativeCallWaitingPresenter.holdCallScreenForHandover(sid, "${lane}")`);
      expect(src).toContain("NativeCallWaitingPresenter.isHandoverLaunch(sid) && DibayKeyguardHelper.isInteractive(app)");
      // 잠금 해제를 요구하면 잠금 화면 이어받기가 막힘(실기 T7 FAIL) — 설계 B2-1
      expect(src).not.toMatch(/isHandoverLaunch\(sid\)\s*&& DibayKeyguardHelper\.isForegroundUnlockedInteractive/);
      expect(src).toContain("if (handover) NativeCallWaitingPresenter.markHandoverLaunched(callId);");
      expect(src).toMatch(
        /handover\s*\? android\.content\.Intent\.FLAG_ACTIVITY_NEW_TASK \| android\.content\.Intent\.FLAG_ACTIVITY_CLEAR_TASK/,
      );
      expect(read(activity)).toContain("NativeCallWaitingPresenter.onCallScreenShown(callId);");
    });
  }

  it("남겨 둔 화면은 이어받은 화면이 뜨거나 대기 통화가 끝나면(거절·종료 신호·무응답) 닫힘", () => {
    const src = presenter();
    expect(src).toContain('releaseHeld("waiting_rejected");');
    expect(src).toContain('releaseHeld("waiting_terminal");');
    expect(src).toContain('releaseHeld("waiting_timeout");');
    expect(src).toContain('releaseHeld("promote_not_presented");');
    // 이어받기를 실제로 시작하지 않았으면 남겨 둔 화면을 바로 닫음(5초 대기 없음) — 설계 B2-2
    expect(src).toContain('releaseHeld("handover_not_launched");');
    expect(src).toMatch(/\} else if \(stillHeld && !launched\) \{/);
    expect(src).toContain('scheduleHeldRelease("next_screen_shown", HANDOVER_RELEASE_AFTER_SHOWN_MS);');
    expect(src).toContain('scheduleHeldRelease("hold_timeout", HANDOVER_HOLD_MAX_MS);');
    // 화면이 앞에 보일 때만 남김
    // 화면이 앞에 보이거나 PiP 로 떠 있을 때만 남김(설계 P)
    expect(src).toMatch(/if \(!callScreenVisible && PIP_HOSTS\.isEmpty\(\)\) return false;\s*held = new Held\(sid, lane\);/);
    expect(src).toContain("handover = held != null && (callScreenVisible || !PIP_HOSTS.isEmpty());");
    const banner = read("android/app/src/main/java/com/dibay/app/nativecall/NativeCallWaitingBanner.java");
    expect(banner).toContain("NativeCallWaitingPresenter.setCallScreenInPip(this, !detached && isInPip());");
    // 대기 알림 조용/시끄러움은 여전히 「앞에 보임」만 — PiP 는 띠가 숨겨지므로 시끄러운 알림
    expect(banner).toContain("NativeCallWaitingPresenter.setCallScreenVisible(activity, this, hostResumed && !isInPip());");
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
