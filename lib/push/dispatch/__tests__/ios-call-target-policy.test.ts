/**
 * 통화 정상화 계획 v2 §3-1 — iPhone 통화 채널 발송 규칙 (VoIP 는 살아 있는 벨이 있는 기기에만 · CallKit 기기에 일반 알림 중복 금지).
 * 하네스는 cd1-preference-fail-closed-provider-boundary.test.ts 와 동일.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const insertNotificationDelivery = vi.fn();
const shouldSendWebPushForUserMock = vi.fn();
const sendFcmToTarget = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
  insertNotificationDelivery: (...args: unknown[]) => insertNotificationDelivery(...args),
  insertNotificationDeliveryDetailed: async (...args: unknown[]) => {
    const id = await insertNotificationDelivery(...args);
    return id ? { kind: "inserted", id } : { kind: "conflict" };
  },
  reclaimNotificationDeliveryForRetry: vi.fn(async () => ({ kind: "already_sent" })),
  isPermanentPushFailureResponse: () => false,
}));

vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: (...args: unknown[]) => shouldSendWebPushForUserMock(...args),
}));

vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));

const sendApnsToTarget = vi.fn();
const sendVoipApnsToTarget = vi.fn();

vi.mock("@/lib/push/dispatch/apns-sender", () => ({
  sendApnsToTarget: (...args: unknown[]) => sendApnsToTarget(...args),
  sendVoipApnsToTarget: (...args: unknown[]) => sendVoipApnsToTarget(...args),
}));

vi.mock("@/lib/push/dispatch/web-push-sender", () => ({
  isWebPushConfigured: () => false,
  sendWebPushToTarget: vi.fn(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: (...args: unknown[]) => tryCreateSupabaseServiceClient(...args),
}));

vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/push/dispatch/push-sound-ssot-enrichment", () => ({
  enrichPushPayloadWithSoundSsotMeta: (out: NotificationSideEffectPayloadOut) => out,
}));

vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: vi.fn(async () => ({ allow: true })),
}));

vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateFailedPushTarget: vi.fn(),
}));

import { decideIosCallTarget } from "@/lib/push/dispatch/dispatch-push-for-user";

const IPHONE = "iphone-1";

function target(id: string, provider: "apns" | "voip_apns" | "fcm", deviceId: string | null) {
  return {
    id,
    source: "user_devices",
    push_provider: provider,
    push_token: `${id}-token-abcdefg`,
    device_id: deviceId,
    platform: provider === "fcm" ? "android" : "ios",
  };
}

let ringRows: Array<{ device_id: string; provider_response: Record<string, unknown> }> = [];
let ringQueryFails = 0;
let ringQueryCalls = 0;

function supabaseMock() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: vi.fn(self),
    eq: vi.fn(self),
    update: vi.fn(self),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => {
      ringQueryCalls += 1;
      if (ringQueryCalls <= ringQueryFails) return resolve({ data: null, error: { message: "boom" } });
      return resolve({ data: ringRows, error: null });
    },
  });
  return { from: vi.fn(() => chain) };
}

type Kind = "incoming_call" | "missed_call" | "call_canceled" | "call_rejected" | "call_ended" | "call_answered_elsewhere";

async function dispatch(kind: Kind, extra: Record<string, unknown> = {}) {
  const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
  return dispatchPushForUser(
    {
      user_id: "user-1",
      notification_type: kind === "incoming_call" ? "community_messenger_incoming_call" : "community_messenger_call_canceled",
      title: "통화",
      body: "",
      link_url: null,
      link_url_absolute: null,
      occurred_at: new Date().toISOString(),
      meta: { session_id: "s1" },
    },
    { skip_settings_gate: true, call_push_kind: kind, target_type: "call_session", target_id: "s1", ...extra }
  );
}

const sentIds = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => (c[0] as { id: string }).id);

describe("통화 정상화 계획 v2 §3-1 — decideIosCallTarget", () => {
  const base = {
    targetId: "voip",
    deviceId: IPHONE,
    ringDeliveredTargetIds: new Set(["voip"]),
    iosExcludedDeviceIds: new Set<string>(),
    voipTargetDeviceIds: new Set([IPHONE]),
    voipSentDeviceIds: new Set<string>(),
  };
  it("missed_call VoIP 금지 · 부재중 일반 알림 유지", () => {
    expect(decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "missed_call" }).skip).toBe(true);
    expect(decideIosCallTarget({ ...base, provider: "apns", callPushKind: "missed_call" }).skip).toBe(false);
  });
  it("종료류 VoIP: 벨이 간 기기만 · 행동/받은 기기 제외 · 벨 기록 조회 실패(null)면 기존대로", () => {
    expect(decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "call_ended" }).skip).toBe(false);
    expect(
      decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "call_ended", ringDeliveredTargetIds: new Set() }).skip
    ).toBe(true);
    expect(
      decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "call_rejected", iosExcludedDeviceIds: new Set([IPHONE]) }).skip
    ).toBe(true);
    // 조회 실패·판단 불가 → 보내지 않음(벨 없는 기기에 보내 iOS 차단을 만들지 않는다)
    expect(
      decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "call_canceled", ringDeliveredTargetIds: "lookup_failed" })
    ).toEqual({ skip: true, reason: "ios_voip_ring_lookup_failed" });
    expect(
      decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "call_canceled", ringDeliveredTargetIds: null }).skip
    ).toBe(true);
  });
  it("수신 VoIP 는 항상 전송", () => {
    expect(
      decideIosCallTarget({ ...base, provider: "voip_apns", callPushKind: "incoming_call", ringDeliveredTargetIds: new Set() }).skip
    ).toBe(false);
  });
  it("일반 알림: 같은 기기 VoIP 대상이 있으면 생략(수신은 VoIP sent 일 때만) · VoIP 없는 기기는 발송", () => {
    expect(decideIosCallTarget({ ...base, provider: "apns", callPushKind: "call_canceled" }).skip).toBe(true);
    expect(decideIosCallTarget({ ...base, provider: "apns", callPushKind: "incoming_call" }).skip).toBe(false);
    expect(
      decideIosCallTarget({ ...base, provider: "apns", callPushKind: "incoming_call", voipSentDeviceIds: new Set([IPHONE]) }).skip
    ).toBe(true);
    expect(decideIosCallTarget({ ...base, provider: "apns", callPushKind: "call_ended", deviceId: "other" }).skip).toBe(false);
  });
  it("Android·웹은 판단 대상 아님", () => {
    expect(decideIosCallTarget({ ...base, provider: "fcm", callPushKind: "call_ended" }).skip).toBe(false);
  });
});

describe("통화 정상화 계획 v2 §3-1 — dispatchPushForUser 통합", () => {
  beforeEach(() => {
    loadActivePushTargets.mockReset();
    insertNotificationDelivery.mockReset();
    shouldSendWebPushForUserMock.mockReset();
    sendFcmToTarget.mockReset();
    sendApnsToTarget.mockReset();
    sendVoipApnsToTarget.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    process.env.PUSH_DISPATCH_ENABLED = "1";
    ringRows = [];
    ringQueryFails = 0;
    ringQueryCalls = 0;
    tryCreateSupabaseServiceClient.mockReturnValue(supabaseMock());
    insertNotificationDelivery.mockResolvedValue(undefined);
    sendFcmToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    sendApnsToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    sendVoipApnsToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    loadActivePushTargets.mockResolvedValue([
      target("alert", "apns", IPHONE),
      target("voip", "voip_apns", IPHONE),
      target("android", "fcm", "android-1"),
    ]);
  });

  it("수신: VoIP·Android 발송 · iPhone 일반 알림(전화 왔다 배너) 생략", async () => {
    await dispatch("incoming_call");
    expect(sentIds(sendVoipApnsToTarget)).toEqual(["voip"]);
    expect(sendApnsToTarget).not.toHaveBeenCalled();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("수신: VoIP 실패 → iPhone 일반 알림 대체 발송", async () => {
    sendVoipApnsToTarget.mockResolvedValue({ status: "failed", provider_response: {} });
    await dispatch("incoming_call");
    expect(sentIds(sendApnsToTarget)).toEqual(["alert"]);
  });

  it("취소: 벨이 간 iPhone 에만 VoIP · 일반 알림 없음 · Android 유지", async () => {
    ringRows = [{ device_id: "voip", provider_response: { push_provider: "voip_apns" } }];
    await dispatch("call_canceled");
    expect(sentIds(sendVoipApnsToTarget)).toEqual(["voip"]);
    expect(sendApnsToTarget).not.toHaveBeenCalled();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("종료: 이 iPhone 에 벨 기록 없음(발신자 iPhone 등) → VoIP·일반 알림 모두 없음", async () => {
    ringRows = [];
    await dispatch("call_ended");
    expect(sendVoipApnsToTarget).not.toHaveBeenCalled();
    expect(sendApnsToTarget).not.toHaveBeenCalled();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("종료: 받은 iPhone 은 제외(ios_call_exclude_device_ids) · Android 는 그대로", async () => {
    ringRows = [{ device_id: "voip", provider_response: { push_provider: "voip_apns" } }];
    await dispatch("call_ended", { ios_call_exclude_device_ids: [IPHONE, "android-1"] });
    expect(sendVoipApnsToTarget).not.toHaveBeenCalled();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("벨 기록 조회 1회 실패 → 재시도 성공이면 정상 판단", async () => {
    ringRows = [{ device_id: "voip", provider_response: { push_provider: "voip_apns" } }];
    ringQueryFails = 1;
    await dispatch("call_canceled");
    expect(sentIds(sendVoipApnsToTarget)).toEqual(["voip"]);
  });

  it("벨 기록 조회 2회 모두 실패 → iPhone 종료 VoIP·일반 알림 보내지 않음 (차단 재발 방지) · Android 유지", async () => {
    ringRows = [{ device_id: "voip", provider_response: { push_provider: "voip_apns" } }];
    ringQueryFails = 2;
    await dispatch("call_ended");
    expect(sendVoipApnsToTarget).not.toHaveBeenCalled();
    expect(sendApnsToTarget).not.toHaveBeenCalled();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("부재중: VoIP 없음 · 부재중 일반 알림 발송", async () => {
    await dispatch("missed_call");
    expect(sendVoipApnsToTarget).not.toHaveBeenCalled();
    expect(sentIds(sendApnsToTarget)).toEqual(["alert"]);
  });
});
