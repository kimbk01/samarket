import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R4 (2026-11-09) — 수신 화면 표시 결과 사후 보고 잠금.
 * 문서: `docs/audit/call-residual-risk-design-2026-11-09.md` §2 R4.
 * 원칙: 보고는 수신 동작(벨·화면·종료 처리)에 관여하지 않는다.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const ANDROID = "android/app/src/main/java/com/dibay/app";

describe("Android incoming presentation ack", () => {
  const helper = src(`${ANDROID}/IncomingCallPushAckHelper.java`);
  const fcm = src(`${ANDROID}/DibayFirebaseMessagingService.java`);
  const delivery = src(`${ANDROID}/IncomingCallPushDelivery.java`);

  it("표시 결과는 수신 확인 전송이 끝난 뒤 보낸다 (서버 행 덮어쓰기 방지)", () => {
    expect(helper).toContain("RECEIVE_ACK_DONE");
    expect(helper).toContain("done.await(PRESENTATION_WAIT_MS, TimeUnit.MILLISECONDS)");
    expect(helper).toMatch(/finally \{\s*done\.countDown\(\);/);
  });

  it("F4: 대기 상한은 수신 확인 최대 소요보다 길고, 이미 「띄움」 보고한 통화는 「안 띄움」을 다시 보내지 않는다", () => {
    expect(helper).toContain("PRESENTATION_WAIT_MS = 15_000L");
    expect(helper).toMatch(/"suppressed"\.equals\(stage\) && PRESENTED_CALL_IDS\.contains\(sid\)/);
    expect(helper).toContain("PRESENTED_CALL_IDS.add(sid)");
  });

  it("표시 결과 응답으로 종료 처리를 하지 않는다 (동작 무관)", () => {
    const presentation = helper.slice(
      helper.indexOf("private static void sendPresentation("),
      helper.indexOf("static int mediaChannelImportance("),
    );
    expect(presentation).not.toContain("IncomingCallTerminalHandler");
    expect(presentation).not.toContain("readBody");
  });

  it("실제 수신 채널(음성·영상 v2) 중요도를 보낸다", () => {
    expect(helper).toContain("NativeVideoCallNotification.CHANNEL_ID");
    expect(helper).toContain("NativeVoiceCallNotification.CHANNEL_ID");
    expect(helper).toContain('\\"mediaChannelImportance\\":');
  });

  it("수신 확인 뒤 화면을 띄우지 않고 끝나는 분기마다 suppressed 보고", () => {
    const suppressed = (text: string, reason: string) =>
      new RegExp(`"suppressed",\\s*"${reason}`).test(text);
    for (const reason of ["already_consumed", "expired", "server_terminal:", "stale_presentation"]) {
      expect(suppressed(fcm, reason), reason).toBe(true);
    }
    for (const reason of ["auth_ineligible:", "notification_gate:", "no_native_lane"]) {
      expect(suppressed(delivery, reason), reason).toBe(true);
    }
  });

  it("음성·영상 런타임 결과(true=벨·화면 시작)를 그대로 보고", () => {
    expect(delivery).toMatch(/boolean presented =\s*NativeVoiceCallRuntime\.handleIncoming\(/);
    expect(delivery).toMatch(/boolean presented =\s*NativeVideoCallRuntime\.handleIncoming\(/);
    expect(delivery).toContain('presented ? "presented" : "suppressed"');
  });
});

describe("iOS incoming presentation ack", () => {
  const provider = src("ios/App/App/Push/CallKitProvider.swift");
  const api = src("ios/App/App/Call/NativeVoiceCallApi.swift");

  it("CallKit 보고 완료 시 presented / suppressed(사유) 보고", () => {
    expect(provider).toContain('stage: "presented"');
    expect(provider).toContain('reason: "terminal_suppressed:\\(suppressReason)"');
    expect(provider).toContain('reason: "callkit_error:\\((error as NSError).code)"');
    expect(provider).toContain("terminalSuppressedReasonBySessionId[sid] = reason");
  });

  it("보고 요청은 push-ack 로, 응답은 로그만", () => {
    const fn = api.slice(
      api.indexOf("static func reportIncomingPresentationAsync"),
      api.indexOf("static func startCallerJoinAsync"),
    );
    expect(fn).toContain("/push-ack");
    expect(fn).toContain('"platform": "ios"');
    expect(fn).not.toContain("completion(");
  });
});
