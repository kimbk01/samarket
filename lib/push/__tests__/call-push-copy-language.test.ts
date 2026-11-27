import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 통화 푸시·부재중 문구 = 받는 사람 언어 (docs/audit/i18n-call-copy-plan-2026-11-27.md).
 * 2026-11-27 C2: 통화 신호 푸시는 ko·en 두 벌(`localized_alert`)을 넘기고 발송부가 기기 언어로 고른다. 기본 글자(기기 언어 모름)는 변경 전 한국어.
 * ko 는 예전 글자와 같아야 하고, 네이티브가 읽는 데이터 키(caller_name 등)는 언어와 무관하게 그대로여야 한다.
 */
const dispatchPushForUser = vi.fn(async () => ({ ok: true, targets_found: 0, deliveries: [] }));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...(args as [])),
}));
vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://example.test" }));
/** 통화 신호 발송부는 언어를 조회하지 않는다 — DB 클라이언트를 만들지 않아야 한다(지연 0) */
const createServiceClient = vi.fn(() => ({}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => createServiceClient() }));

import { sendWebPushForCommunityMessengerIncomingCall } from "@/lib/push/send-community-messenger-incoming-call-push";
import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";
import { sendWebPushForCommunityMessengerCallAnsweredElsewhere } from "@/lib/push/send-community-messenger-call-answered-elsewhere-push";
import { buildRoomBoundMissedCallNotificationInput } from "@/lib/community-messenger/call-authority/call-missed-notification-authority";

function lastOut(): Record<string, unknown> {
  const call = dispatchPushForUser.mock.calls.at(-1) as unknown as [Record<string, unknown>];
  return call[0];
}

function lastAlert(lang: "ko" | "en"): { title: string; body: string } | undefined {
  const call = dispatchPushForUser.mock.calls.at(-1) as unknown as [unknown, { localized_alert?: Record<string, { title: string; body: string }> }];
  return call[1]?.localized_alert?.[lang];
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

  it("수신 — ko 예전 글자 / en 영어 두 벌, 기본 글자 = 예전 한국어, 데이터 키 유지", async () => {
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "video" });
    expect(lastAlert("ko")).toEqual({ title: "영상 통화", body: "홍길동님의 전화" });
    expect(lastAlert("en")).toEqual({ title: "Video call", body: "홍길동 is calling" });
    const out = lastOut();
    expect(out).toMatchObject({ title: "영상 통화", body: "홍길동님의 전화" });
    expect(out.meta).toMatchObject({ caller_name: "홍길동", kind: "video", call_kind: "video", media_type: "video" });
  });

  it("수신 voice — 데이터 키는 언어와 무관", async () => {
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "voice" });
    expect(lastAlert("ko")).toEqual({ title: "음성 통화", body: "홍길동님의 전화" });
    expect(lastAlert("en")).toEqual({ title: "Voice call", body: "홍길동 is calling" });
    expect(lastOut().meta).toMatchObject({ caller_name: "홍길동", kind: "voice", call_kind: "voice", media_type: "audio" });
  });

  it("종료 신호 제목 — ko 「통화」 / en 「Call」, 본문 비움", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u", sessionId: "s1", status: "cancelled" });
    expect(lastAlert("ko")).toEqual({ title: "통화", body: "" });
    expect(lastAlert("en")).toEqual({ title: "Call", body: "" });
    expect(lastOut()).toMatchObject({ title: "통화", body: "", meta: { session_id: "s1", status: "cancelled" } });
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({ recipientUserId: "u", sessionId: "s1", answeredDeviceId: null });
    expect(lastAlert("ko")).toEqual({ title: "통화", body: "" });
    expect(lastOut()).toMatchObject({ title: "통화", body: "" });
  });

  it("통화 신호 3종은 언어 조회 없이 바로 발송 (DB 클라이언트 생성 0 · 발송 1번씩)", async () => {
    createServiceClient.mockClear();
    dispatchPushForUser.mockClear();
    await sendWebPushForCommunityMessengerIncomingCall({ ...incomingBase, callKind: "voice" });
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u", sessionId: "s1", status: "rejected" });
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({ recipientUserId: "u", sessionId: "s1", answeredDeviceId: "d1" });
    expect(dispatchPushForUser).toHaveBeenCalledTimes(3);
    expect(createServiceClient).not.toHaveBeenCalled();
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
