import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 통화 푸시·부재중 문구 = 받는 사람 언어 (docs/audit/i18n-call-copy-plan-2026-11-27.md).
 * ko 는 예전 글자와 같아야 하고, 네이티브가 읽는 데이터 키(caller_name 등)는 언어와 무관하게 그대로여야 한다.
 */
const dispatchPushForUser = vi.fn(async () => ({ ok: true, targets_found: 0, deliveries: [] }));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...(args as [])),
}));
vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://example.test" }));
/** 캐시 값 — null 이면 캐시 없음(예전 문구로 즉시 발송) */
let recipientLanguage: "ko" | "en" | null = "ko";
vi.mock("@/lib/push/call-push-recipient-language", () => ({
  CALL_SIGNAL_LEGACY_COPY_LANGUAGE: "ko",
  resolveCallPushLanguageNoWait: () => recipientLanguage,
}));

import { sendWebPushForCommunityMessengerIncomingCall } from "@/lib/push/send-community-messenger-incoming-call-push";
import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";
import { sendWebPushForCommunityMessengerCallAnsweredElsewhere } from "@/lib/push/send-community-messenger-call-answered-elsewhere-push";
import { buildRoomBoundMissedCallNotificationInput } from "@/lib/community-messenger/call-authority/call-missed-notification-authority";

function lastOut(): Record<string, unknown> {
  const call = dispatchPushForUser.mock.calls.at(-1) as unknown as [Record<string, unknown>];
  return call[0];
}

const incomingBase = {
  recipientUserId: "callee",
  sessionId: "s1",
  roomId: "r1",
  callerId: "caller",
  callerDisplayName: "홍길동",
  startedAt: "2026-11-27T00:00:00.000Z",
};

describe("call push copy language", () => {
  beforeEach(() => dispatchPushForUser.mockClear());

  it("수신 ko — 예전 글자 그대로 + 데이터 키 유지", async () => {
    recipientLanguage = "ko";
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "video" });
    const out = lastOut();
    expect(out.title).toBe("영상 통화");
    expect(out.body).toBe("홍길동님의 전화");
    expect(out.meta).toMatchObject({ caller_name: "홍길동", kind: "video", call_kind: "video", media_type: "video" });
  });

  it("수신 en — 영어 제목·본문, 데이터 키는 같음", async () => {
    recipientLanguage = "en";
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "voice" });
    const out = lastOut();
    expect(out.title).toBe("Voice call");
    expect(out.body).toBe("홍길동 is calling");
    expect(out.meta).toMatchObject({ caller_name: "홍길동", kind: "voice", call_kind: "voice", media_type: "audio" });
  });

  it("수신 — 호출자가 준 언어가 있으면 조회 없이 그것", async () => {
    recipientLanguage = "ko";
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "voice", recipientLanguage: "en" });
    expect(lastOut().title).toBe("Voice call");
  });

  it("종료 신호 제목 — ko 「통화」 / en 「Call」, 본문 비움", async () => {
    recipientLanguage = "ko";
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u", sessionId: "s1", status: "cancelled" });
    expect(lastOut()).toMatchObject({ title: "통화", body: "" });
    recipientLanguage = "en";
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({ recipientUserId: "u", sessionId: "s1", answeredDeviceId: null });
    expect(lastOut()).toMatchObject({ title: "Call", body: "" });
  });

  it("캐시 없음 — 예전(변경 전) 한국어 문구로 보낸다", async () => {
    recipientLanguage = null;
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "voice" });
    expect(lastOut()).toMatchObject({ title: "음성 통화", body: "홍길동님의 전화" });
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u", sessionId: "s1", status: "cancelled" });
    expect(lastOut()).toMatchObject({ title: "통화" });
  });

  it("부재중 — ko 예전 글자 / en 영어 · 다시 그리기용 키 저장", () => {
    const base = { recipientUserId: "callee", roomId: "r1", callSessionId: "s1", actorUserId: "caller" } as const;
    const ko = buildRoomBoundMissedCallNotificationInput({ ...base, callKind: "voice", callerDisplayName: "홍길동", recipientLanguage: "ko" });
    expect(ko.title).toBe("부재중 전화");
    expect(ko.body).toBe("홍길동 · 부재중 음성 통화");
    const en = buildRoomBoundMissedCallNotificationInput({ ...base, callKind: "video", callerDisplayName: null, recipientLanguage: "en" });
    expect(en.title).toBe("Missed call");
    expect(en.body).toBe("Other party · Missed video call");
    expect(en.displayPayload).toMatchObject({
      kind: "missed_call",
      callKind: "video",
      title_key: "reaudit_call_missed_title",
      body_key: "reaudit_call_missed_body_video",
    });
    const koFallback = buildRoomBoundMissedCallNotificationInput({ ...base, callKind: "voice", recipientLanguage: "ko" });
    expect(koFallback.body).toBe("상대방 · 부재중 음성 통화");
  });
});
