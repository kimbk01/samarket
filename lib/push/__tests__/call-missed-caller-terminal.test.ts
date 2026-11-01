import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchPushForUser = vi.fn(async () => ({ ok: true, targets_found: 0, deliveries: [] }));

vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...(args as [])),
}));
vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://example.test" }));

import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";
import {
  isMultiDeviceCallPushKind,
  isTerminalDismissCallPushKind,
  resolveCallPushProviderPolicy,
  resolveEventType,
} from "@/lib/push/dispatch/push-payload-types";
import { buildFcmDataFields, resolveFcmPushType } from "@/lib/push/dispatch/fcm-data-payload-contract";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

function lastCall(): [NotificationSideEffectPayloadOut, Record<string, unknown>] {
  return dispatchPushForUser.mock.calls.at(-1) as unknown as [NotificationSideEffectPayloadOut, Record<string, unknown>];
}

/**
 * docs/audit/android-caller-stuck-after-remote-missed-design-2026-11-01.md §3:
 * 상대 무응답(missed) → 상대 쪽 Android 에만 알림 없는 종료 신호(call_missed).
 */
describe("call missed → caller terminal signal (Android FCM only)", () => {
  beforeEach(() => dispatchPushForUser.mockClear());

  it("missed status sends call_missed with its own event type and no settings gate", async () => {
    await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "caller", sessionId: "s1", status: "missed" });
    const [out, opts] = lastCall();
    expect(out.user_id).toBe("caller");
    expect(out.meta).toMatchObject({ session_id: "s1", status: "missed" });
    expect(opts).toMatchObject({
      event_type: "call_missed_terminal",
      call_push_kind: "call_missed",
      target_type: "call_session",
      target_id: "s1",
      skip_settings_gate: true,
    });
    expect(opts.ios_voip_terminal_exclude_device_ids).toBeUndefined();
  });

  it("existing terminal kinds are unchanged", async () => {
    for (const [status, kind, eventType] of [
      ["rejected", "call_rejected", "call_reject"],
      ["ended", "call_ended", "call_end"],
      ["cancelled", "call_canceled", "call_cancel"],
    ] as const) {
      await sendWebPushForCommunityMessengerCallTerminal({ recipientUserId: "u", sessionId: "s1", status });
      expect(lastCall()[1]).toMatchObject({ call_push_kind: kind, event_type: eventType });
    }
  });

  it("call_missed is a multi-device terminal dismiss kind", () => {
    expect(isTerminalDismissCallPushKind("call_missed")).toBe(true);
    expect(isMultiDeviceCallPushKind("call_missed")).toBe(true);
    expect(resolveEventType({ notification_type: "community_messenger_call_canceled" } as NotificationSideEffectPayloadOut, {
      call_push_kind: "call_missed",
    })).toBe("call_missed_terminal");
  });

  it("provider policy: only fcm (Android) — never iOS VoIP/APNs or web push", () => {
    const base = { callPushKind: "call_missed" as const, hasNativeCallTarget: true, targetDeviceId: "d1" };
    expect(resolveCallPushProviderPolicy({ ...base, provider: "fcm" })).toEqual({ allow: true });
    for (const provider of ["voip_apns", "apns", "web_push"] as const) {
      expect(resolveCallPushProviderPolicy({ ...base, provider })).toEqual({
        allow: false,
        reason: "call_missed_terminal_android_fcm_only",
      });
    }
  });

  it("FCM data: type/call_push_kind call_missed (Android terminal handler, no missed-call tray)", () => {
    const out = {
      user_id: "caller",
      notification_type: "community_messenger_call_canceled",
      title: "통화",
      body: "",
      link_url: "/community-messenger/calls/s1",
      meta: { session_id: "s1", status: "missed" },
      link_url_absolute: null,
      occurred_at: "2026-11-01T10:16:26.000Z",
    } as NotificationSideEffectPayloadOut;
    const opts = { call_push_kind: "call_missed" as const };
    expect(resolveFcmPushType(out, opts)).toBe("call_missed");
    const fields = buildFcmDataFields(out, opts, { sessionId: "s1" });
    expect(fields).toMatchObject({
      type: "call_missed",
      call_push_kind: "call_missed",
      callId: "s1",
      tag: "samarket-incoming-call-s1",
    });
  });
});
