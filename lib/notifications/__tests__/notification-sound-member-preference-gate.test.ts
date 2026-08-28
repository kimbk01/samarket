import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedMemberPreferenceSnapshot,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  resolveMemberSoundFromPreferences,
  resolveSoundPreferenceRecipientRole,
  soundRowToSideEffectPayload,
} from "@/lib/notifications/notification-sound-member-preference-gate";

const QUIET_NIGHT = new Date("2026-08-28T15:00:00.000Z");

function row(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: "user-1",
    notification_type: "chat",
    type: "chat",
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

function allSoundOffMember(): NormalizedMemberPreferenceSnapshot {
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

describe("resolveMemberSoundFromPreferences (P2-A5b)", () => {
  it("T1 — optional + sound master OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "trade_chat" } }),
        memberPrefs({ soundEnabled: false })
      )
    ).toBe(false);
  });

  it("T2 — optional + sound ON + domain enabled → true", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "trade_chat" } }),
        memberPrefs({ soundEnabled: true, tradeChatEnabled: true })
      )
    ).toBe(true);
  });

  it("T3 — optional + DND active → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "trade_chat" } }),
        memberPrefs({ soundEnabled: true, quiet: { enabled: true, activeNow: true } })
      )
    ).toBe(false);
  });

  it("T4 — member financial + sound ON → true", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "user_point_charge_approved" } }),
        memberPrefs({ soundEnabled: true })
      )
    ).toBe(true);
  });

  it("T5 — member financial + sound OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "user_point_charge_approved" } }),
        memberPrefs(allSoundOffMember())
      )
    ).toBe(false);
  });

  it("T6 — member financial + DND → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "user_point_charge_rejected" } }),
        memberPrefs({ soundEnabled: true, quiet: { enabled: true, activeNow: true } }),
        QUIET_NIGHT
      )
    ).toBe(false);
  });

  it("T7 — payment-critical + sound ON → true", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "commerce", meta: { kind: "store_order_payment_failed" } }),
        memberPrefs({ soundEnabled: true })
      )
    ).toBe(true);
  });

  it("T8 — payment-critical + sound OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "commerce", meta: { kind: "store_order_payment_failed" } }),
        memberPrefs({ soundEnabled: false })
      )
    ).toBe(false);
  });

  it("T9 — payment-critical + DND → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "commerce", meta: { kind: "store_order_refund_approved" } }),
        memberPrefs({ soundEnabled: true, quiet: { enabled: true, activeNow: true } })
      )
    ).toBe(false);
  });

  it("T10 — fulfillment + order OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "commerce", meta: { kind: "store_order_owner_status" } }),
        memberPrefs({ soundEnabled: true, orderEnabled: false })
      )
    ).toBe(false);
  });

  it("T11 — fulfillment + order ON + sound ON → true", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "commerce", meta: { kind: "store_order_owner_status" } }),
        memberPrefs({ soundEnabled: true, orderEnabled: true })
      )
    ).toBe(true);
  });

  it("T12 — gift_transfer_offered + sound ON → true", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "gift_transfer_offered" } }),
        memberPrefs({ soundEnabled: true })
      )
    ).toBe(true);
  });

  it("T13 — gift_transfer_offered + sound OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "gift_transfer_offered" } }),
        memberPrefs({ soundEnabled: false })
      )
    ).toBe(false);
  });

  it("T14 — gift_transfer_offered + DND → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "gift_transfer_offered" } }),
        memberPrefs({ soundEnabled: true, quiet: { enabled: true, activeNow: true } })
      )
    ).toBe(false);
  });

  it("T15 — gift accepted/rejected/cancelled remain optional", () => {
    for (const kind of ["gift_transfer_accepted", "gift_transfer_rejected", "gift_transfer_cancelled"]) {
      expect(
        resolveMemberSoundFromPreferences(
          row({ notification_type: "community", meta: { kind } }),
          memberPrefs({ soundEnabled: false })
        )
      ).toBe(false);
    }
  });

  it("T16 — trade chat domain OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "trade_chat" } }),
        memberPrefs({ soundEnabled: true, tradeChatEnabled: false })
      )
    ).toBe(false);
  });

  it("T17 — community chat domain OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "community_chat" } }),
        memberPrefs({ soundEnabled: true, communityChatEnabled: false })
      )
    ).toBe(false);
  });

  it("T18 — chatPushEnabled OFF alone does NOT disable sound", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ meta: { kind: "trade_chat" } }),
        memberPrefs({ soundEnabled: true, chatPushEnabled: false, tradeChatEnabled: true })
      )
    ).toBe(true);
  });

  it("T19 — marketing opt-out → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "marketing", meta: { push_kind: "marketing" } }),
        memberPrefs({ soundEnabled: true, marketingEnabled: false })
      )
    ).toBe(false);
  });

  it("T20 — marketing + DND → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "marketing", meta: { push_kind: "marketing" } }),
        memberPrefs({
          soundEnabled: true,
          marketingEnabled: true,
          marketingPushEnabled: true,
          quiet: { enabled: true, activeNow: true },
        })
      )
    ).toBe(false);
  });

  it("T21 — notice domain OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "admin_notice", push_kind: "notice" } }),
        memberPrefs({ soundEnabled: true, noticeEnabled: false })
      )
    ).toBe(false);
  });

  it("T22 — unknown + sound OFF → false", () => {
    expect(
      resolveMemberSoundFromPreferences(
        row({ notification_type: "system", meta: { kind: "unknown_writer_kind_xyz" } }),
        memberPrefs({ soundEnabled: false })
      )
    ).toBe(false);
  });
});

describe("P2-A5b boundaries", () => {
  it("T23 — owner stays legacy role", () => {
    expect(
      resolveSoundPreferenceRecipientRole(
        row({ notification_type: "commerce", meta: { kind: "store_order_created" } })
      )
    ).toBe("owner");
  });

  it("T24 — admin ops sound gate module unchanged", () => {
    const src = readFileSync(join(process.cwd(), "lib/admin/admin-ops-sound-decision.ts"), "utf8");
    expect(src).not.toContain("resolveEffectiveNotificationPreference");
  });

  it("T25 — push consumer unchanged", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"), "utf8");
    expect(src).toContain("resolveMemberWebPushFromPreferences");
    expect(src).toContain("shouldSendMemberWebPushForUser");
  });

  it("T26 — member notification A eligibility unchanged", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/badge-authority-rebuild/member-notification-a-eligibility.ts"),
      "utf8"
    );
    expect(src).not.toContain("resolveMemberSoundFromPreferences");
  });

  it("T27 — vibration not wired in sound consumer", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-member-preference-gate.ts"),
      "utf8"
    );
    expect(src).not.toContain("vibrate");
    expect(soundRowToSideEffectPayload(row()).user_id).toBe("user-1");
  });

  it("notification-sound-gate uses member resolver path", () => {
    const src = readFileSync(join(process.cwd(), "lib/notifications/notification-sound-gate.ts"), "utf8");
    expect(src).toContain("explainPreferenceSoundFromGate");
    expect(src).toContain("resolveMemberSoundFromPreferences");
  });
});
