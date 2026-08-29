import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedMemberPreferenceSnapshot,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type LegacyUserSettingsPushRow,
  type NotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";
import {
  deriveWebPushKind,
  resolveMemberWebPushFromPreferences,
  resolveWebPushPreferenceRecipientRole,
  shouldSendWebPushForUser,
} from "@/lib/notifications/web-push-user-settings-gate";

const TZ = "Asia/Manila";
const QUIET_NIGHT = new Date("2026-08-28T15:00:00.000Z");

function payload(
  partial: Partial<NotificationSideEffectPayloadOut> & {
    meta?: Record<string, unknown> | null;
  } = {}
): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "chat",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: {},
    ...partial,
  };
}

function memberPrefs(
  overrides?: Partial<NormalizedMemberPreferenceSnapshot>
): NormalizedNotificationPreferenceSnapshot {
  return {
    ...defaultNormalizedNotificationPreferences(),
    member: {
      ...defaultNormalizedNotificationPreferences().member!,
      ...overrides,
    },
  };
}

function allPushOffMember(): NormalizedMemberPreferenceSnapshot {
  return {
    pushEnabled: false,
    serviceEnabled: false,
    chatPushEnabled: false,
    soundEnabled: false,
    vibrationEnabled: false,
    tradeChatEnabled: false,
    communityChatEnabled: false,
    orderEnabled: false,
    storeEnabled: false,
    tradeEventsEnabled: false,
    communitySocialEnabled: false,
    noticeEnabled: false,
    marketingEnabled: false,
    marketingPushEnabled: false,
    quiet: { enabled: true, activeNow: true },
  };
}

describe("resolveMemberWebPushFromPreferences (P2-A5a)", () => {
  it("T1 — member optional + push master OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({ pushEnabled: false })
      )
    ).toBe(false);
  });

  it("T2 — member optional + service OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({ serviceEnabled: false })
      )
    ).toBe(false);
  });

  it("T3 — chat + chatPush OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({ chatPushEnabled: false })
      )
    ).toBe(false);
  });

  it("T4 — chat domain OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "community_chat" } }),
        memberPrefs({ communityChatEnabled: false })
      )
    ).toBe(false);
  });

  it("T5 — optional + DND active → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({ quiet: { enabled: true, activeNow: true } })
      )
    ).toBe(false);
  });

  it("T6 — member financial + all toggles OFF → true", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "system", meta: { kind: "user_point_charge_approved" } }),
        memberPrefs(allPushOffMember())
      )
    ).toBe(true);
  });

  it("T7 — member financial + DND → true", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "system", meta: { kind: "user_point_charge_rejected" } }),
        memberPrefs(allPushOffMember()),
        QUIET_NIGHT
      )
    ).toBe(true);
  });

  it("T8 — payment-critical → true", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "commerce", meta: { kind: "store_order_payment_failed" } }),
        memberPrefs(allPushOffMember())
      )
    ).toBe(true);
  });

  it("T9 — fulfillment + order OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "commerce", meta: { kind: "store_order_owner_status" } }),
        memberPrefs({ orderEnabled: false })
      )
    ).toBe(false);
  });

  it("T10 — gift_transfer_offered + all OFF → true", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "system", meta: { kind: "gift_transfer_offered" } }),
        memberPrefs(allPushOffMember())
      )
    ).toBe(true);
  });

  it("T11 — gift accepted + push OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "community", meta: { kind: "gift_transfer_accepted" } }),
        memberPrefs({ pushEnabled: false })
      )
    ).toBe(false);
  });

  it("T12 — notice + pushKind=system + master OFF → false (no system blanket bypass)", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({
          notification_type: "system",
          meta: { kind: "admin_notice", push_kind: "system" },
        }),
        memberPrefs({ pushEnabled: false, serviceEnabled: false })
      )
    ).toBe(false);
    expect(deriveWebPushKind(payload({ meta: { push_kind: "system" } }))).toBe("system");
  });

  it("T13 — marketing strict opt-out → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "marketing", meta: { push_kind: "marketing" } }),
        memberPrefs({ marketingEnabled: false, marketingPushEnabled: false })
      )
    ).toBe(false);
  });

  it("T14 — marketing opt-in + DND → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "marketing", meta: { push_kind: "marketing" } }),
        memberPrefs({
          marketingEnabled: true,
          marketingPushEnabled: true,
          quiet: { enabled: true, activeNow: true },
        })
      )
    ).toBe(false);
  });

  it("T15 — unknown + master OFF → false", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "system", meta: { kind: "totally_unknown_writer_kind" } }),
        memberPrefs({ pushEnabled: false })
      )
    ).toBe(false);
  });

  it("T16 — no-row defaults preserve optional enabled behavior", () => {
    const prefs = normalizeNotificationPreferenceStorage({
      notificationSettingsRow: null,
      legacyUserSettingsRow: null,
      now: QUIET_NIGHT,
      timezone: TZ,
    });
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        prefs
      )
    ).toBe(true);
    expect(prefs.member?.marketingEnabled).toBe(false);
  });

  it("T17 — legacy-row-only preserves current behavior", () => {
    const legacy: LegacyUserSettingsPushRow = { push_enabled: false, marketing_push_enabled: true };
    const prefs = normalizeNotificationPreferenceStorage({
      notificationSettingsRow: null,
      legacyUserSettingsRow: legacy,
      now: QUIET_NIGHT,
      timezone: TZ,
    });
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        prefs
      )
    ).toBe(false);
  });

  it("T18 — notification-row-only preserves current behavior", () => {
    const ns: NotificationSettingsStorageRow = {
      service_enabled: false,
      marketing_enabled: true,
    };
    const prefs = normalizeNotificationPreferenceStorage({
      notificationSettingsRow: ns,
      legacyUserSettingsRow: null,
      now: QUIET_NIGHT,
      timezone: TZ,
    });
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        prefs
      )
    ).toBe(false);
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "marketing", meta: { push_kind: "marketing" } }),
        prefs
      )
    ).toBe(false);
  });
});

describe("shouldSendWebPushForUser boundary (P2-A5a)", () => {
  it("T19 — dispatch transport module unchanged", () => {
    const src = readFileSync(join(process.cwd(), "lib/push/dispatch/dispatch-push-for-user.ts"), "utf8");
    expect(src).toContain("dispatchPushForUser");
    expect(src).toContain("sendWebPushToTarget");
    expect(src).toContain("sendFcmToTarget");
    expect(src).toContain("shouldSendWebPushForUser");
  });

  it("T20 — sound modules untouched", () => {
    const soundGate = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-gate.ts"),
      "utf8"
    );
    expect(soundGate).not.toContain("resolveEffectiveNotificationPreference");
    expect(soundGate).not.toContain("readNormalizedNotificationPreferenceSnapshot");
  });

  it("owner notifications use P2-A6/P2-A3 Owner path", async () => {
    const tables: string[] = [];
    const fromSpy = vi.fn((table: string) => {
      tables.push(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data:
            table === "owner_notification_settings"
              ? { optional_push_enabled: false }
              : table === "user_notification_settings"
                ? { service_enabled: false, order_enabled: true }
                : { push_enabled: false },
          error: null,
        }),
      };
    });
    const svc = { from: fromSpy } as unknown as Parameters<typeof shouldSendWebPushForUser>[0];

    const ownerPayload = payload({
      notification_type: "commerce",
      meta: { kind: "store_order_created", store_id: "s1", order_id: "o1" },
    });
    expect(resolveWebPushPreferenceRecipientRole(ownerPayload)).toBe("owner");

    const allowed = await shouldSendWebPushForUser(svc, "owner-1", ownerPayload);
    expect(allowed).toBe(false);
    expect(tables).toContain("owner_notification_settings");
  });

  it("member web push gate consumes P2-A3 resolver", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).toContain("resolveEffectiveNotificationPreference");
    expect(src).toContain("readNormalizedNotificationPreferenceSnapshot");
    expect(src).toContain("shouldSendMemberWebPushForUser");
    expect(src).toContain("shouldSendOwnerWebPushForUser");
    expect(src).not.toContain("shouldSendLegacyWebPushForUser");
  });
});
