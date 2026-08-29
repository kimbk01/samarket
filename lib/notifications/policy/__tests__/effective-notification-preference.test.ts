import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedMemberPreferenceSnapshot,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";

function allOffMember(overrides?: Partial<NormalizedMemberPreferenceSnapshot>): NormalizedMemberPreferenceSnapshot {
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
    quiet: { enabled: false, activeNow: false },
    ...overrides,
  };
}

function prefs(
  partial: Partial<NormalizedNotificationPreferenceSnapshot> = {}
): NormalizedNotificationPreferenceSnapshot {
  return {
    ...defaultNormalizedNotificationPreferences(),
    ...partial,
    member: partial.member ?? defaultNormalizedNotificationPreferences().member,
    owner: partial.owner ?? defaultNormalizedNotificationPreferences().owner,
    adminOps: partial.adminOps ?? defaultNormalizedNotificationPreferences().adminOps,
  };
}

describe("resolveEffectiveNotificationPreference (P2-A3)", () => {
  it("T1 — member financial + all member toggles OFF → push/inApp/badge true, sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "user_point_charge_approved",
      recipientRole: "member",
      preferences: prefs({ member: allOffMember() }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
    expect(result.showInApp).toBe(true);
    expect(result.showBadge).toBe(true);
    expect(result.playSound).toBe(false);
    expect(result.reason).toBe("mandatory_push_override");
  });

  it("T2 — member financial + DND active → push true, sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "user_point_charge_rejected",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({
          soundEnabled: true,
          quiet: { enabled: true, activeNow: true },
        }),
      }),
    });
    expect(result.sendPush).toBe(true);
    expect(result.playSound).toBe(false);
    expect(result.quietSuppressed).toBe(true);
  });

  it("T3 — owner financial + member order/store OFF → push true, member toggles irrelevant", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_point_charge_approved",
      recipientRole: "owner",
      preferences: prefs({ member: allOffMember() }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
    expect(result.preferenceDomain).toBe("owner_financial");
  });

  it("T4 — owner optional + owner pref absent → enabled compatibility fallback", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_order_created",
      recipientRole: "owner",
      preferences: prefs({ owner: {} }),
    });
    expect(result.sendPush).toBe(true);
    expect(result.playSound).toBe(true);
    expect(result.reason).toBe("owner_optional_default_enabled");
  });

  it("T5 — owner optional + owner pref OFF → push/sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_order_created",
      recipientRole: "owner",
      preferences: prefs({
        owner: { optionalPushEnabled: false, optionalSoundEnabled: false },
      }),
    });
    expect(result.sendPush).toBe(false);
    expect(result.playSound).toBe(false);
    expect(result.reason).toBe("owner_optional_disabled");
  });

  it("T5b — owner mandatory + optional_sound OFF → push true, playSound false", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_point_charge_on_hold",
      recipientRole: "owner",
      preferences: prefs({
        owner: { optionalPushEnabled: false, optionalSoundEnabled: false },
      }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
    expect(result.playSound).toBe(false);
  });

  it("T6 — payment-critical order → mandatory", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_order_payment_failed",
      recipientRole: "member",
      preferences: prefs({ member: allOffMember() }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
  });

  it("T7 — fulfillment order → optional + domain preference respected", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_order_owner_status",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({ orderEnabled: false, pushEnabled: true, serviceEnabled: true }),
      }),
    });
    expect(result.mandatory).toBe(false);
    expect(result.sendPush).toBe(false);
    expect(result.showInApp).toBe(true);
    expect(result.showBadge).toBe(true);
  });

  it("T8 — gift_transfer_offered → mandatory", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "gift_transfer_offered",
      recipientRole: "member",
      preferences: prefs({ member: allOffMember() }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
  });

  it("T9 — gift accepted/rejected/cancelled → optional", () => {
    for (const metaKind of [
      "gift_transfer_accepted",
      "gift_transfer_rejected",
      "gift_transfer_cancelled",
    ] as const) {
      const result = resolveEffectiveNotificationPreference({
        metaKind,
        recipientRole: "member",
        preferences: prefs({
          member: allOffMember({
            pushEnabled: true,
            serviceEnabled: true,
            communitySocialEnabled: false,
          }),
        }),
      });
      expect(result.mandatory).toBe(false);
      expect(result.sendPush).toBe(false);
    }
  });

  it("T10 — notice + pushKind=system + master OFF → push false (not mandatory)", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "notice_published",
      recipientRole: "member",
      pushKind: "system",
      preferences: prefs({ member: allOffMember() }),
    });
    expect(result.mandatory).toBe(false);
    expect(result.sendPush).toBe(false);
  });

  it("T11 — marketing opt-out → push false", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "admin_marketing_banner",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({
          pushEnabled: true,
          serviceEnabled: true,
          marketingEnabled: true,
          marketingPushEnabled: false,
        }),
      }),
    });
    expect(result.sendPush).toBe(false);
    expect(result.reason).toBe("marketing_opt_out");
  });

  it("T12 — marketing opt-in + DND → push/sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "admin_marketing_banner",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({
          pushEnabled: true,
          serviceEnabled: true,
          marketingEnabled: true,
          marketingPushEnabled: true,
          soundEnabled: true,
          quiet: { enabled: true, activeNow: true },
        }),
      }),
    });
    expect(result.sendPush).toBe(false);
    expect(result.playSound).toBe(false);
  });

  it("T13 — optional domain OFF → inApp/badge preserve, push/sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "trade_status",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({
          pushEnabled: true,
          serviceEnabled: true,
          tradeEventsEnabled: false,
          soundEnabled: true,
        }),
      }),
    });
    expect(result.showInApp).toBe(true);
    expect(result.showBadge).toBe(true);
    expect(result.sendPush).toBe(false);
    expect(result.playSound).toBe(false);
  });

  it("T14 — DND never suppresses inApp/badge", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_order_owner_status",
      recipientRole: "member",
      preferences: prefs({
        member: allOffMember({
          pushEnabled: true,
          serviceEnabled: true,
          quiet: { enabled: true, activeNow: true },
        }),
      }),
    });
    expect(result.showInApp).toBe(true);
    expect(result.showBadge).toBe(true);
  });

  it("T15 — admin ops pref absent → compatibility sound enabled", () => {
    const result = resolveEffectiveNotificationPreference({
      recipientRole: "admin_ops",
      preferences: prefs({ adminOps: {} }),
    });
    expect(result.playSound).toBe(true);
    expect(result.reason).toBe("admin_ops_default_enabled");
  });

  it("T16 — admin ops sound=false → sound false", () => {
    const result = resolveEffectiveNotificationPreference({
      recipientRole: "admin_ops",
      preferences: prefs({ adminOps: { soundEnabled: false } }),
    });
    expect(result.playSound).toBe(false);
    expect(result.reason).toBe("admin_ops_sound_disabled");
  });

  it("T17 — unknown event → mandatory false", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "not_a_real_event",
      metaKind: "nonexistent_kind",
      recipientRole: "member",
      preferences: prefs(),
    });
    expect(result.mandatory).toBe(false);
    expect(result.reason).toBe("safe_fallback");
  });

  it("T18 — resolver is pure sync function without async IO", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "chat_message",
      recipientRole: "member",
      preferences: prefs(),
    });
    expect(typeof result.sendPush).toBe("boolean");
    expect(resolveEffectiveNotificationPreference.constructor.name).not.toBe("AsyncFunction");
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/policy/effective-notification-preference.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\bawait\b/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
  });

  it("runtime sound consumer remains unchanged — no resolver import", () => {
    const paths = [
      "lib/notifications/notification-sound-gate.ts",
      "lib/notifications/badge-authority-rebuild/member-notification-a-eligibility.ts",
      "lib/admin/admin-ops-sound-decision.ts",
    ];
    for (const path of paths) {
      const src = readFileSync(join(process.cwd(), path), "utf8");
      expect(src).not.toContain("resolveEffectiveNotificationPreference");
      expect(src).not.toContain("effective-notification-preference");
    }
  });
});
