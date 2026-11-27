/**
 * 2026-11-27 언어 사후 검토 C2·C3 — 기기별 알림 글자 언어 (docs/audit/i18n-postmerge-fix-design-2026-11-27.md §3).
 * - 기기 앱 언어(대상 조회에서 이미 읽은 값)로 제목·본문을 고른다
 * - 데이터(meta) 는 그대로
 * - 대상 조회·DB 호출 수는 언어별 글자 유무와 무관하게 같다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import type { PushTarget } from "@/lib/push/dispatch/push-payload-types";
import { filterUserDevicePushTargets } from "@/lib/push/dispatch/filter-user-device-push-targets";
import {
  applyLocalizedPushAlert,
  buildLocalizedPushAlert,
  resolvePushTargetAlertLanguage,
} from "@/lib/push/dispatch/localized-push-alert";

const loadActivePushTargets = vi.fn();
const sendFcmToTarget = vi.fn();
const sendApnsToTarget = vi.fn();
const sendWebPushToTarget = vi.fn();
const svcFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  update: vi.fn().mockReturnThis(),
}));

vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
  insertNotificationDelivery: vi.fn(async () => undefined),
  insertNotificationDeliveryDetailed: vi.fn(async () => ({ kind: "error", message: "x" })),
  reclaimNotificationDeliveryForRetry: vi.fn(async () => ({ kind: "already_sent" })),
  isPermanentPushFailureResponse: () => false,
}));
vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: vi.fn(async () => true),
}));
vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));
vi.mock("@/lib/push/dispatch/apns-sender", () => ({
  sendApnsToTarget: (...args: unknown[]) => sendApnsToTarget(...args),
  sendVoipApnsToTarget: vi.fn(async () => ({ status: "sent", provider_response: {} })),
}));
vi.mock("@/lib/push/dispatch/web-push-sender", () => ({
  isWebPushConfigured: () => true,
  sendWebPushToTarget: (...args: unknown[]) => sendWebPushToTarget(...args),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: svcFrom }),
}));
vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push/dispatch/push-sound-ssot-enrichment", () => ({
  enrichPushPayloadWithSoundSsotMeta: (o: NotificationSideEffectPayloadOut) => o,
}));
vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: vi.fn(async () => ({ allow: true })),
}));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateFailedPushTarget: vi.fn(),
}));

const TARGETS: PushTarget[] = [
  { id: "a", source: "user_devices", push_provider: "fcm", push_token: "tok-android-ko", device_id: "android-1", platform: "android", app_language: "ko" },
  { id: "b", source: "user_devices", push_provider: "apns", push_token: "tok-iphone-en", device_id: "iphone-1", platform: "ios", app_language: "en" },
  { id: "c", source: "web_push_subscriptions", push_provider: "web_push", push_token: "https://push.example/x", platform: "web", endpoint: "https://push.example/x" },
];

function payload(partial: Partial<NotificationSideEffectPayloadOut> = {}): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "community_messenger_incoming_call",
    title: "Video call",
    body: "Kim is calling",
    link_url: null,
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: { session_id: "s1", caller_name: "Kim", kind: "video" },
    ...partial,
  };
}

const alert = buildLocalizedPushAlert((lang) =>
  lang === "ko" ? { title: "영상 통화", body: "Kim님의 전화" } : { title: "Video call", body: "Kim is calling" }
);

function sentTitle(fn: ReturnType<typeof vi.fn>): string | undefined {
  return (fn.mock.calls[0]?.[1] as NotificationSideEffectPayloadOut | undefined)?.title;
}

describe("localized push alert — per-device language", () => {
  beforeEach(() => {
    process.env.PUSH_DISPATCH_ENABLED = "1";
    for (const fn of [sendFcmToTarget, sendApnsToTarget, sendWebPushToTarget]) {
      fn.mockReset();
      fn.mockResolvedValue({ status: "sent", provider_response: {} });
    }
    loadActivePushTargets.mockReset();
    loadActivePushTargets.mockResolvedValue(TARGETS);
    svcFrom.mockClear();
  });

  it("통화 푸시: 기기마다 그 기기 언어 글자 · 언어 없는 웹 대상은 같은 사람 최근 기기 언어 · 데이터 불변", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), {
      call_push_kind: "incoming_call",
      skip_settings_gate: true,
      localized_alert: alert,
    });
    const android = sendFcmToTarget.mock.calls[0]?.[1] as NotificationSideEffectPayloadOut;
    expect(android).toMatchObject({ title: "영상 통화", body: "Kim님의 전화" });
    expect(android.meta).toEqual({ session_id: "s1", caller_name: "Kim", kind: "video" });
    const iphone = sendApnsToTarget.mock.calls[0]?.[1] as NotificationSideEffectPayloadOut | undefined;
    if (iphone) expect(iphone).toMatchObject({ title: "Video call", body: "Kim is calling" });
    const web = sendWebPushToTarget.mock.calls[0]?.[1] as NotificationSideEffectPayloadOut | undefined;
    if (web) expect(web.title).toBe("영상 통화");
  });

  it("일반 알림: 언어별 글자로 기기마다 · 없으면 원래 글자", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload({ notification_type: "system", title: "stored", body: "stored body", meta: { kind: "x" } }), {
      localized_alert: { ko: { title: "한국어", body: "본문" }, en: { title: "English", body: "Body" } },
    });
    expect(sentTitle(sendFcmToTarget)).toBe("한국어");
    expect(sentTitle(sendApnsToTarget)).toBe("English");
    expect(sentTitle(sendWebPushToTarget)).toBe("한국어");

    for (const fn of [sendFcmToTarget, sendApnsToTarget, sendWebPushToTarget]) fn.mockClear();
    await dispatchPushForUser(payload({ notification_type: "system", title: "stored", body: "stored body", meta: { kind: "x" } }), {});
    expect(sentTitle(sendFcmToTarget)).toBe("stored");
    expect(sentTitle(sendApnsToTarget)).toBe("stored");
  });

  it("통화 푸시: 어느 기기에도 app_language 가 없으면 넘겨받은 예전 한국어 글자 그대로", async () => {
    loadActivePushTargets.mockResolvedValue(TARGETS.map((t) => ({ ...t, app_language: null })));
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload({ title: "영상 통화", body: "Kim님의 전화" }), {
      call_push_kind: "incoming_call",
      skip_settings_gate: true,
      localized_alert: alert,
    });
    expect(sendFcmToTarget.mock.calls[0]?.[1]).toMatchObject({ title: "영상 통화", body: "Kim님의 전화" });
  });

  it("조회 수 불변 — 언어별 글자가 있어도 대상 조회 1번·DB 호출 수 같음", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), { call_push_kind: "incoming_call", skip_settings_gate: true });
    const withoutAlert = { targets: loadActivePushTargets.mock.calls.length, from: svcFrom.mock.calls.length };
    loadActivePushTargets.mockClear();
    svcFrom.mockClear();
    await dispatchPushForUser(payload(), { call_push_kind: "incoming_call", skip_settings_gate: true, localized_alert: alert });
    expect({ targets: loadActivePushTargets.mock.calls.length, from: svcFrom.mock.calls.length }).toEqual(withoutAlert);
    expect(withoutAlert.targets).toBe(1);
  });
});

describe("localized push alert — helpers", () => {
  it("기기 언어를 전혀 모르면 원래 payload 그대로(같은 객체)", () => {
    const out = payload();
    const targets: PushTarget[] = [{ ...TARGETS[2]! }];
    expect(resolvePushTargetAlertLanguage(targets[0]!, targets)).toBeNull();
    expect(applyLocalizedPushAlert(out, targets[0]!, targets, alert)).toBe(out);
    expect(applyLocalizedPushAlert(out, TARGETS[0]!, TARGETS, null)).toBe(out);
  });

  it("filterUserDevicePushTargets — 행 언어, 없으면 같은 사람 최근 행(토큰 없는 행 포함) 언어", () => {
    const targets = filterUserDevicePushTargets([
      { id: "w", platform: "web", device_id: "web-1", push_token: "", push_provider: "web_push", app_language: "en" },
      { id: "1", platform: "android", device_id: "d1", push_token: "t1", push_provider: "fcm", app_language: null },
      { id: "2", platform: "ios", device_id: "d2", push_token: "t2", push_provider: "apns", app_language: "ko" },
      { id: "3", platform: "ios", device_id: "d2", push_token: "t3", push_provider: "voip_apns", app_language: "bogus" },
    ]);
    expect(targets.map((t) => [t.id, t.app_language])).toEqual([
      ["1", "en"],
      ["2", "ko"],
      ["3", "en"],
    ]);
  });
});
