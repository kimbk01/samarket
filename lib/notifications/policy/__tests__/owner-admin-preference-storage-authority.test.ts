import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  resolveAdminOpsSnapshot,
  resolveOwnerSnapshot,
  type OwnerNotificationSettingsStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

const NOW = new Date("2026-08-29T04:00:00+08:00");
const TZ = "Asia/Manila";
const MIGRATION =
  "supabase/migrations/20261130140000_owner_admin_notification_preference_authority.sql";

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

function normalize(input: Parameters<typeof normalizeNotificationPreferenceStorage>[0]) {
  return normalizeNotificationPreferenceStorage({ ...input, now: input.now ?? NOW, timezone: TZ });
}

describe("P2-A6 owner/admin preference storage authority", () => {
  it("T1 Owner no row → compatibility fallback preserved", () => {
    const snap = resolveOwnerSnapshot(null, NOW, TZ);
    expect(snap.optionalPushEnabled).toBeUndefined();
    expect(snap.optionalSoundEnabled).toBeUndefined();
    const resolved = resolveEffectiveNotificationPreference({
      metaKind: "store_order_created",
      recipientRole: "owner",
      preferences: prefs({ owner: snap }),
    });
    expect(resolved.sendPush).toBe(true);
    expect(resolved.playSound).toBe(true);
  });

  it("T2 Owner optional push true → normalized true", () => {
    const row: OwnerNotificationSettingsStorageRow = { optional_push_enabled: true };
    expect(resolveOwnerSnapshot(row, NOW, TZ).optionalPushEnabled).toBe(true);
  });

  it("T3 Owner optional push false → normalized false", () => {
    const row: OwnerNotificationSettingsStorageRow = { optional_push_enabled: false };
    expect(resolveOwnerSnapshot(row, NOW, TZ).optionalPushEnabled).toBe(false);
  });

  it("T4 Owner optional sound true → normalized true", () => {
    const row: OwnerNotificationSettingsStorageRow = { optional_sound_enabled: true };
    expect(resolveOwnerSnapshot(row, NOW, TZ).optionalSoundEnabled).toBe(true);
  });

  it("T5 Owner optional sound false → normalized false", () => {
    const row: OwnerNotificationSettingsStorageRow = { optional_sound_enabled: false };
    expect(resolveOwnerSnapshot(row, NOW, TZ).optionalSoundEnabled).toBe(false);
  });

  it("T6 Owner Member push/order/store values do not leak into Owner snapshot", () => {
    const result = normalize({
      notificationSettingsRow: {
        order_enabled: false,
        store_enabled: false,
        sound_enabled: false,
      },
      legacyUserSettingsRow: { push_enabled: false },
      ownerSettingsRow: null,
      now: NOW,
    });
    expect(result.member?.orderEnabled).toBe(false);
    expect(result.member?.storeEnabled).toBe(false);
    expect(result.member?.pushEnabled).toBe(false);
    expect(result.owner?.optionalPushEnabled).toBeUndefined();
    expect(result.owner?.optionalSoundEnabled).toBeUndefined();
  });

  it("T7 Owner mandatory policy remains mandatory regardless optional storage", () => {
    const result = resolveEffectiveNotificationPreference({
      metaKind: "store_point_charge_on_hold",
      recipientRole: "owner",
      preferences: prefs({
        owner: { optionalPushEnabled: false, optionalSoundEnabled: false },
      }),
    });
    expect(result.mandatory).toBe(true);
    expect(result.sendPush).toBe(true);
    expect(result.playSound).toBe(true);
  });

  it("T8 Owner optional policy consumes optional fields at resolver", () => {
    const off = resolveEffectiveNotificationPreference({
      metaKind: "store_order_created",
      recipientRole: "owner",
      preferences: prefs({
        owner: { optionalPushEnabled: false, optionalSoundEnabled: false },
      }),
    });
    expect(off.mandatory).toBe(false);
    expect(off.sendPush).toBe(false);
    expect(off.playSound).toBe(false);

    const on = resolveEffectiveNotificationPreference({
      metaKind: "store_order_created",
      recipientRole: "owner",
      preferences: prefs({
        owner: { optionalPushEnabled: true, optionalSoundEnabled: true },
      }),
    });
    expect(on.sendPush).toBe(true);
    expect(on.playSound).toBe(true);
  });

  it("T9 Admin no row → current compatibility sound behavior preserved", () => {
    const admin = resolveAdminOpsSnapshot(null);
    expect(admin.soundEnabled).toBeUndefined();
    const result = resolveEffectiveNotificationPreference({
      recipientRole: "admin_ops",
      preferences: prefs({ adminOps: admin }),
    });
    // P2-A3 T15 current truth: absent → playSound true (compat default enabled)
    expect(result.playSound).toBe(true);
    expect(result.reason).toBe("admin_ops_default_enabled");
  });

  it("T10 Admin sound true → normalized true", () => {
    expect(resolveAdminOpsSnapshot({ sound_enabled: true }).soundEnabled).toBe(true);
  });

  it("T11 Admin sound false → normalized false", () => {
    expect(resolveAdminOpsSnapshot({ sound_enabled: false }).soundEnabled).toBe(false);
    const result = resolveEffectiveNotificationPreference({
      recipientRole: "admin_ops",
      preferences: prefs({ adminOps: { soundEnabled: false } }),
    });
    expect(result.playSound).toBe(false);
  });

  it("T12 admin_notification_settings asset config does not become user preference", () => {
    const mig = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(mig).toContain("admin_notification_preferences");
    expect(mig).toContain("admin_notification_settings (asset");
    expect(mig).not.toMatch(/ALTER TABLE public\.admin_notification_settings[\s\S]*sound_enabled/);
    const normalizer = readFileSync(
      join(process.cwd(), "lib/notifications/policy/notification-preference-storage-normalizer.ts"),
      "utf8"
    );
    expect(normalizer).not.toMatch(/from\([\"']admin_notification_settings[\"']\)/);
    expect(normalizer).toContain("Never read `admin_notification_settings`");
  });

  it("T13 Admin Q unrelated to preference", () => {
    const queue = readFileSync(join(process.cwd(), "lib/admin/admin-action-queue.ts"), "utf8");
    expect(queue).not.toContain("admin_notification_preferences");
    expect(queue).not.toContain("owner_notification_settings");
    const soundDecision = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-decision.ts"),
      "utf8"
    );
    expect(soundDecision).not.toContain("admin_notification_preferences");
    expect(soundDecision).not.toContain("readAdminNotificationPreference");
  });

  it("T14 Member normalized snapshot unchanged for same member rows", () => {
    const memberRows = {
      notificationSettingsRow: {
        service_enabled: true,
        order_enabled: true,
        sound_enabled: true,
        marketing_enabled: false,
      },
      legacyUserSettingsRow: {
        push_enabled: true,
        chat_push_enabled: true,
        marketing_push_enabled: false,
      },
    };
    const withoutOwnerAdmin = normalize({ ...memberRows, now: NOW });
    const withAbsentOwnerAdmin = normalize({
      ...memberRows,
      ownerSettingsRow: null,
      adminOpsPreferenceRow: null,
      now: NOW,
    });
    expect(withAbsentOwnerAdmin.member).toEqual(withoutOwnerAdmin.member);
  });

  it("T17 Unknown policy remains non-mandatory", () => {
    const result = resolveEffectiveNotificationPreference({
      eventType: "not_a_real_event",
      metaKind: "nonexistent_kind",
      recipientRole: "member",
      preferences: prefs(),
    });
    expect(result.mandatory).toBe(false);
  });

  it("T18 migration/schema naming collision absent", () => {
    const mig = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.owner_notification_settings");
    expect(mig).toContain("CREATE TABLE IF NOT EXISTS public.admin_notification_preferences");
    expect(mig).toContain("is_platform_admin(auth.uid())");
    expect(mig).toMatch(/PRIMARY KEY/);
    const allMigs = readFileSync(
      join(process.cwd(), "supabase/migrations/20260611140000_notification_domains_v1.sql"),
      "utf8"
    );
    expect(allMigs).toContain("admin_notification_settings");
    expect(allMigs).not.toContain("admin_notification_preferences");
  });

  it("T19 RLS own-row Owner", () => {
    const mig = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(mig).toContain("owner_notification_settings_select_own");
    expect(mig).toContain("auth.uid() = user_id");
    expect(mig).toMatch(
      /owner_notification_settings_update_own[\s\S]*USING \(auth\.uid\(\) = user_id\)/
    );
  });

  it("T20 RLS admin-own-row authority", () => {
    const mig = readFileSync(join(process.cwd(), MIGRATION), "utf8");
    expect(mig).toContain("admin_notification_preferences_select_own");
    expect(mig).toContain("is_platform_admin(auth.uid())");
    expect(mig).toMatch(
      /admin_notification_preferences_insert_own[\s\S]*is_platform_admin\(auth\.uid\(\)\)/
    );
  });

  it("T21 no runtime consumer imports new reader/writer unexpectedly", () => {
    const paths = [
      "lib/notifications/web-push-user-settings-gate.ts",
      "lib/notifications/notification-sound-gate.ts",
      "lib/admin/admin-ops-sound-decision.ts",
      "components/admin/store-points/AdminStorePointPendingProvider.tsx",
    ];
    for (const path of paths) {
      const src = readFileSync(join(process.cwd(), path), "utf8");
      expect(src).not.toContain("owner-notification-preference-storage");
      expect(src).not.toContain("admin-notification-preference-storage");
      expect(src).not.toContain("owner_notification_settings");
      expect(src).not.toContain("admin_notification_preferences");
    }
  });

  it("T22 Gift/Nav files untouched by P2-A6 source imports", () => {
    const writerOwner = readFileSync(
      join(process.cwd(), "lib/notifications/policy/owner-notification-preference-storage.server.ts"),
      "utf8"
    );
    const writerAdmin = readFileSync(
      join(process.cwd(), "lib/notifications/policy/admin-notification-preference-storage.server.ts"),
      "utf8"
    );
    expect(writerOwner).not.toMatch(/gift/i);
    expect(writerAdmin).not.toMatch(/gift/i);
  });

  it("null columns on existing Owner row remain unset (compat)", () => {
    const snap = resolveOwnerSnapshot(
      {
        optional_push_enabled: null,
        optional_sound_enabled: null,
        quiet_hours_enabled: false,
      },
      NOW,
      TZ
    );
    expect(snap.optionalPushEnabled).toBeUndefined();
    expect(snap.optionalSoundEnabled).toBeUndefined();
  });
});
