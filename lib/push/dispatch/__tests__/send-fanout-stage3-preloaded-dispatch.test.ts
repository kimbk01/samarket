/**
 * 2026-11-21 보내기 3단계 — 미리 읽은 값으로 보낼 때 조회를 하지 않고, 보내는 내용(페이로드·옵션)은 같다.
 * 통화 푸시는 미리 읽은 값을 받아도 쓰지 않는다(지금과 같은 조회).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const sendFcmToTarget = vi.fn();
const evaluateNotificationDeliverySafety = vi.fn(async () => ({ allow: true }));
const shouldSendWebPushForUser = vi.fn();
const resolveFromPreloaded = vi.fn();
const fromCalls: string[] = [];
const decision = { sendPush: true, playSound: false, vibrate: true };

vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
  insertNotificationDelivery: vi.fn(async () => undefined),
  insertNotificationDeliveryDetailed: vi.fn(async () => ({ kind: "inserted", id: "del-1" })),
  reclaimNotificationDeliveryForRetry: vi.fn(async () => ({ kind: "already_sent" })),
  isPermanentPushFailureResponse: () => false,
}));
vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: (...a: unknown[]) => shouldSendWebPushForUser(...a),
  resolveWebPushDeliveryFromPreloadedPreferences: (...a: unknown[]) => resolveFromPreloaded(...a),
}));
vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));
vi.mock("@/lib/push/dispatch/apns-sender", () => ({ sendApnsToTarget: vi.fn(), sendVoipApnsToTarget: vi.fn() }));
vi.mock("@/lib/push/dispatch/web-push-sender", () => ({ isWebPushConfigured: () => false, sendWebPushToTarget: vi.fn() }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "is", "update", "insert", "order"]) chain[m] = () => chain;
      chain.maybeSingle = async () =>
        table === "notification_events"
          ? { data: { id: "ev-1", user_id: "user-1", type: "chat_message", created_at: new Date().toISOString() }, error: null }
          : { data: null, error: null };
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return chain;
    }),
  }),
}));
vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push/dispatch/push-sound-ssot-enrichment", () => ({
  enrichPushPayloadWithSoundSsotMeta: (o: NotificationSideEffectPayloadOut) => o,
}));
vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: (...a: unknown[]) => evaluateNotificationDeliverySafety(...(a as [])),
}));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({ deactivateFailedPushTarget: vi.fn() }));

const target = {
  id: "dev-1",
  source: "user_devices",
  push_provider: "fcm",
  push_token: "token-abcdefg",
  device_id: "device-1",
  platform: "android",
};

function payload(partial: Partial<NotificationSideEffectPayloadOut> = {}): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "chat",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: "2026-11-21T00:00:00.000Z",
    meta: { kind: "community_chat" },
    ...partial,
  };
}

const preloaded = {
  eventRow: { id: "ev-1", user_id: "user-1", type: "chat_message", created_at: new Date().toISOString() } as never,
  safety: { allow: true } as const,
  preferences: { snapshot: {} as never },
  targets: [target] as never,
};

beforeEach(() => {
  process.env.PUSH_DISPATCH_ENABLED = "1";
  fromCalls.length = 0;
  sendFcmToTarget.mockReset();
  sendFcmToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
  loadActivePushTargets.mockReset();
  loadActivePushTargets.mockResolvedValue([target]);
  evaluateNotificationDeliverySafety.mockClear();
  shouldSendWebPushForUser.mockReset();
  shouldSendWebPushForUser.mockImplementation(
    async (_s: unknown, _u: unknown, _o: unknown, options?: { onDecision?: (d: typeof decision) => void }) => {
      options?.onDecision?.(decision);
      return decision.sendPush;
    }
  );
  resolveFromPreloaded.mockReset();
  resolveFromPreloaded.mockReturnValue(decision);
});

describe("보내기 3단계 — 미리 읽은 값", () => {
  it("채팅: 알림 행·안전 확인·설정·대상을 다시 읽지 않는다", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), { notification_event_id: "ev-1", preloaded_chat_facts: preloaded });
    expect(fromCalls).not.toContain("notification_events");
    expect(evaluateNotificationDeliverySafety).not.toHaveBeenCalled();
    expect(shouldSendWebPushForUser).not.toHaveBeenCalled();
    expect(loadActivePushTargets).not.toHaveBeenCalled();
    expect(resolveFromPreloaded).toHaveBeenCalledTimes(1);
  });

  it("보내는 내용(대상·페이로드·옵션)은 기존 경로와 같다", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), { notification_event_id: "ev-1", badge_count: 3 });
    const legacy = sendFcmToTarget.mock.calls[0];
    sendFcmToTarget.mockClear();
    await dispatchPushForUser(payload(), { notification_event_id: "ev-1", badge_count: 3, preloaded_chat_facts: preloaded });
    const batched = sendFcmToTarget.mock.calls[0];
    expect(legacy).toBeDefined();
    expect(batched).toBeDefined();
    expect((legacy?.[1] as { title?: string }).title).toBe("t");
    expect(batched?.[0]).toEqual(legacy?.[0]);
    expect(batched?.[1]).toEqual(legacy?.[1]);
    const strip = (o: unknown) => {
      const { preloaded_chat_facts: _p, ...rest } = (o ?? {}) as Record<string, unknown>;
      return rest;
    };
    expect(strip(batched?.[2])).toEqual(strip(legacy?.[2]));
  });

  it("행 없음(null) → 기존과 같이 notification_event_not_found 로 건너뜀", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {
      notification_event_id: "ev-1",
      preloaded_chat_facts: { ...preloaded, eventRow: null },
    });
    expect(r.skipped_reason).toBe("notification_event_not_found");
    expect(sendFcmToTarget).not.toHaveBeenCalled();
  });

  it("안전 확인 거절 → 같은 사유로 건너뜀", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {
      notification_event_id: "ev-1",
      preloaded_chat_facts: { ...preloaded, safety: { allow: false, reason: "group_banned" } },
    });
    expect(r.skipped_reason).toBe("group_banned");
  });

  it("설정 판정 오류 → 보내지 않음(CD-1 fail-closed)", async () => {
    resolveFromPreloaded.mockImplementation(() => {
      throw new Error("boom");
    });
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), { notification_event_id: "ev-1", preloaded_chat_facts: preloaded });
    expect(sendFcmToTarget).not.toHaveBeenCalled();
  });

  it("통화 푸시는 미리 읽은 값을 받아도 쓰지 않는다(부재중 → 기존 설정·대상 조회)", async () => {
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(
      payload({ notification_type: "community_messenger_missed_call", meta: { session_id: "s-1" } }),
      { call_push_kind: "missed_call", notification_event_id: "ev-1", preloaded_chat_facts: preloaded }
    );
    expect(resolveFromPreloaded).not.toHaveBeenCalled();
    expect(shouldSendWebPushForUser).toHaveBeenCalledTimes(1);
    expect(loadActivePushTargets).toHaveBeenCalledTimes(1);
  });
});
