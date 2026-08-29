import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";
import {
  resolveOwnerSoundFromPreferences,
  resolveSoundPreferenceRecipientRole,
} from "@/lib/notifications/notification-sound-owner-preference-gate";

const QUIET_NIGHT = new Date("2026-08-28T15:00:00.000Z");

function prefs(
  partial: Partial<NormalizedNotificationPreferenceSnapshot> = {}
): NormalizedNotificationPreferenceSnapshot {
  const base = defaultNormalizedNotificationPreferences();
  return {
    ...base,
    ...partial,
    member: partial.member ?? base.member,
    owner: partial.owner ?? base.owner,
    adminOps: partial.adminOps ?? base.adminOps,
  };
}

function row(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    user_id: "owner-1",
    notification_type: "commerce",
    type: "commerce",
    meta: { kind: "store_order_created" },
    ...partial,
  };
}

describe("P2-A7b Owner sound consumer cutover", () => {
  it("T1 Owner no row → sound compatibility enabled", () => {
    expect(
      resolveOwnerSoundFromPreferences(row(), prefs({ owner: {} }))
    ).toBe(true);
  });

  it("T2 Owner optional_sound=true → playSound=true when policy allows", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({ owner: { optionalSoundEnabled: true } })
      )
    ).toBe(true);
  });

  it("T3 Owner optional_sound=false → playSound=false", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({ owner: { optionalSoundEnabled: false } })
      )
    ).toBe(false);
  });

  it("T4 Owner Member sound_enabled=false does not suppress Owner sound", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({
          member: {
            ...defaultNormalizedNotificationPreferences().member!,
            soundEnabled: false,
          },
          owner: { optionalSoundEnabled: true },
        })
      )
    ).toBe(true);
  });

  it("T5 Owner Member order/store OFF do not suppress Owner sound", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({
          member: {
            ...defaultNormalizedNotificationPreferences().member!,
            orderEnabled: false,
            storeEnabled: false,
            soundEnabled: false,
          },
          owner: { optionalSoundEnabled: true },
        })
      )
    ).toBe(true);
  });

  it("T6 Owner mandatory event + optional_sound=false → playSound=false", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row({ meta: { kind: "store_point_charge_on_hold" } }),
        prefs({ owner: { optionalSoundEnabled: false } })
      )
    ).toBe(false);
    const resolved = resolveEffectiveNotificationPreference({
      metaKind: "store_point_charge_on_hold",
      recipientRole: "owner",
      preferences: prefs({ owner: { optionalSoundEnabled: false } }),
    });
    expect(resolved.mandatory).toBe(true);
    expect(resolved.sendPush).toBe(true);
    expect(resolved.playSound).toBe(false);
  });

  it("T7 Owner quiet active → playSound=false", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({
          owner: {
            optionalSoundEnabled: true,
            quiet: { enabled: true, activeNow: true },
          },
        }),
        QUIET_NIGHT
      )
    ).toBe(false);
  });

  it("T8 Owner quiet inactive → normal policy result", () => {
    expect(
      resolveOwnerSoundFromPreferences(
        row(),
        prefs({
          owner: {
            optionalSoundEnabled: true,
            quiet: { enabled: true, activeNow: false },
          },
        })
      )
    ).toBe(true);
  });

  it("T9 unknown Owner event does not become mandatory", () => {
    const resolved = resolveEffectiveNotificationPreference({
      eventType: "not_a_real_owner_event",
      metaKind: "nonexistent_owner_kind_xyz",
      recipientRole: "owner",
      preferences: prefs({ owner: { optionalSoundEnabled: true } }),
    });
    expect(resolved.mandatory).toBe(false);
  });

  it("T10 Owner role explicit", () => {
    expect(
      resolveSoundPreferenceRecipientRole(
        row({ meta: { kind: "store_order_created" } })
      )
    ).toBe("owner");
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-owner-preference-gate.ts"),
      "utf8"
    );
    expect(src).toContain('recipientRole: "owner"');
  });

  it("T11 Owner push unchanged", () => {
    const push = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(push).toContain("resolveOwnerWebPushFromPreferences");
    expect(push).toContain("shouldSendOwnerWebPushForUser");
    expect(push).not.toContain("shouldSendLegacyWebPushForUser");
    expect(push).not.toContain("resolveOwnerSoundFromPreferences");
  });

  it("T12 Member sound unchanged", () => {
    const member = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-member-preference-gate.ts"),
      "utf8"
    );
    expect(member).toContain("resolveMemberSoundFromPreferences");
    expect(member).toContain('recipientRole: "member"');
    expect(member).not.toContain("resolveOwnerSoundFromPreferences");
  });

  it("T13 Member push unchanged", () => {
    const push = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(push).toContain("shouldSendMemberWebPushForUser");
    expect(push).toContain("resolveMemberWebPushFromPreferences");
  });

  it("T14 Admin Ops unchanged", () => {
    const admin = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-decision.ts"),
      "utf8"
    );
    expect(admin).not.toContain("resolveOwnerSoundFromPreferences");
    expect(admin).not.toContain("owner_notification_settings");
  });

  it("T15 OWNER_C unchanged", () => {
    const cStore = readFileSync(
      join(process.cwd(), "lib/notifications/badge-authority-rebuild/c-store-authority-contract.ts"),
      "utf8"
    );
    expect(cStore).not.toContain("resolveOwnerSoundFromPreferences");
    expect(cStore).not.toContain("optionalSoundEnabled");
  });

  it("T16 missing owner table → safe no-row compatibility", () => {
    expect(isMissingPreferenceRelationError({ code: "PGRST205", message: "Could not find the table" })).toBe(
      true
    );
    expect(
      isMissingPreferenceRelationError({ code: "42P01", message: 'relation "x" does not exist' })
    ).toBe(true);
    expect(
      resolveOwnerSoundFromPreferences(row(), prefs({ owner: {} }))
    ).toBe(true);
    const clientFetch = readFileSync(
      join(process.cwd(), "lib/notifications/fetch-owner-notification-settings-client.ts"),
      "utf8"
    );
    expect(clientFetch).toContain("isMissingPreferenceRelationError");
    expect(clientFetch).toContain("owner_notification_settings");
  });

  it("sound gate routes Owner via owner preference resolver", () => {
    const gate = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-gate.ts"),
      "utf8"
    );
    expect(gate).toContain("resolveOwnerSoundFromPreferences");
    expect(gate).toContain("explainOwnerSoundPreferenceFromRow");
    expect(gate).toContain('recipientRole === "owner"');
  });

  it("no raw Member preference authority in Owner sound adapter", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-owner-preference-gate.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/sound_enabled/);
    expect(src).not.toMatch(/order_enabled/);
    expect(src).not.toMatch(/store_enabled/);
    expect(src).not.toContain("user_notification_settings");
  });
});
