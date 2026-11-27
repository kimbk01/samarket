import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 통화 신호 발송은 언어 조회(DB)를 기다리지 않는다 (docs/audit/i18n-call-copy-plan-2026-11-27.md §2-4).
 * 조회를 영원히 끝나지 않게 막아도 발송이 즉시 일어나야 한다.
 */
let releaseLookup: ((v: "en") => void) | null = null;
const lookup = vi.fn(
  () =>
    new Promise<"en">((resolve) => {
      releaseLookup = resolve;
    })
);
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: () => lookup(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => ({}) }));
const dispatchPushForUser = vi.fn(async () => ({ ok: true, targets_found: 0, deliveries: [] }));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...(args as [])),
}));
vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://example.test" }));

import {
  __resetCallPushRecipientLanguageCacheForTests,
  peekCallPushRecipientLanguage,
} from "@/lib/push/call-push-recipient-language";
import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";
import { sendWebPushForCommunityMessengerCallAnsweredElsewhere } from "@/lib/push/send-community-messenger-call-answered-elsewhere-push";
import { sendWebPushForCommunityMessengerIncomingCall } from "@/lib/push/send-community-messenger-incoming-call-push";

function lastOut(): Record<string, unknown> {
  const call = dispatchPushForUser.mock.calls.at(-1) as unknown as [Record<string, unknown>];
  return call[0];
}

describe("call signal push — no wait on language lookup", () => {
  beforeEach(() => {
    __resetCallPushRecipientLanguageCacheForTests();
    dispatchPushForUser.mockClear();
    lookup.mockClear();
    releaseLookup = null;
  });
  afterEach(() => __resetCallPushRecipientLanguageCacheForTests());

  it("캐시 없음 + 조회가 끝나지 않음 → 취소 신호는 즉시 예전 문구로 발송, 조회는 뒤에서 1회", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u1", sessionId: "s1", status: "cancelled" });
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    expect(lastOut().title).toBe("통화");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(peekCallPushRecipientLanguage("u1")).toBeNull();

    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({ recipientUserId: "u1", sessionId: "s1", answeredDeviceId: null });
    expect(dispatchPushForUser).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenCalledTimes(1); // 같은 사람 진행 중 조회는 1번
  });

  it("수신 신호도 조회를 기다리지 않는다 — 조회 끝난 뒤 다음 발송부터 그 언어", async () => {
    const base = {
      recipientUserId: "u2",
      sessionId: "s2",
      roomId: "r2",
      callerId: "c2",
      callKind: "video" as const,
      callerDisplayName: "Kim",
      startedAt: "2026-11-27T00:00:00.000Z",
    };
    await sendWebPushForCommunityMessengerIncomingCall(base);
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    expect(lastOut()).toMatchObject({ title: "영상 통화", body: "Kim님의 전화" });

    releaseLookup?.("en");
    await new Promise((r) => setTimeout(r, 0));
    expect(peekCallPushRecipientLanguage("u2")).toBe("en");

    await sendWebPushForCommunityMessengerIncomingCall(base);
    expect(lastOut()).toMatchObject({ title: "Video call", body: "Kim is calling" });
  });
});
