import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldPlayAdminOpsSound, shouldRefreshAdminOpsQueue } from "@/lib/admin/admin-ops-sound-decision";
import {
  allowAdminOpsSoundAfterPreference,
  preferencesFromAdminOpsStorageRow,
  resolveAdminOpsSoundFromPreferences,
} from "@/lib/admin/admin-ops-sound-preference-gate";
import {
  resolveAdminTradeReportHref,
  resolveAdminStoreApplicationHref,
} from "@/lib/admin/admin-ops-deeplink";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-relation-errors";
import { defaultNormalizedNotificationPreferences } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { isAdminSoundEligible } from "@/lib/notifications/admin-notification-sound-policy";

function prefs(soundEnabled?: boolean) {
  if (soundEnabled === undefined) {
    return preferencesFromAdminOpsStorageRow(null);
  }
  return preferencesFromAdminOpsStorageRow({ sound_enabled: soundEnabled });
}

describe("P2-A8 Admin Ops sound preference cutover", () => {
  it("T1 Admin eligible + no pref row → compat playSound=true", () => {
    expect(resolveAdminOpsSoundFromPreferences(prefs())).toBe(true);
    expect(
      allowAdminOpsSoundAfterPreference(
        shouldPlayAdminOpsSound({
          eventType: "INSERT",
          sourceTable: "reports",
          newRow: { id: "r1", status: "pending" },
        }),
        prefs()
      )
    ).toBe(true);
  });

  it("T2 Admin eligible + sound_enabled=true → playSound=true", () => {
    expect(
      allowAdminOpsSoundAfterPreference(
        shouldPlayAdminOpsSound({
          eventType: "INSERT",
          sourceTable: "stores",
          newRow: { id: "s1", approval_status: "pending" },
        }),
        prefs(true)
      )
    ).toBe(true);
  });

  it("T3 Admin eligible + sound_enabled=false → playSound=false", () => {
    expect(
      allowAdminOpsSoundAfterPreference(
        shouldPlayAdminOpsSound({
          eventType: "INSERT",
          sourceTable: "reports",
          newRow: { id: "r1", status: "pending" },
        }),
        prefs(false)
      )
    ).toBe(false);
  });

  it("T4 Non-sound-qualified + sound_enabled=true → playSound=false", () => {
    expect(
      allowAdminOpsSoundAfterPreference(
        shouldPlayAdminOpsSound({
          eventType: "INSERT",
          sourceTable: "stores",
          newRow: { id: "s1", approval_status: "revision_requested" },
        }),
        prefs(true)
      )
    ).toBe(false);
  });

  it("T5 ordinary actionable UPDATE remains NO_SOUND", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "reports",
        oldRow: { id: "r1", status: "pending" },
        newRow: { id: "r1", status: "reviewing" },
      })
    ).toBe(false);
    expect(
      allowAdminOpsSoundAfterPreference(false, prefs(true))
    ).toBe(false);
  });

  it("T6 terminal event remains NO_SOUND", () => {
    expect(
      shouldPlayAdminOpsSound({
        eventType: "UPDATE",
        sourceTable: "reports",
        oldRow: { id: "r1", status: "reviewing" },
        newRow: { id: "r1", status: "resolved" },
      })
    ).toBe(false);
  });

  it("T7 terminal→actionable genuine new Admin action preserves sound semantics", () => {
    const semantic = shouldPlayAdminOpsSound({
      eventType: "UPDATE",
      sourceTable: "reports",
      oldRow: { id: "r1", status: "resolved" },
      newRow: { id: "r1", status: "pending" },
    });
    expect(semantic).toBe(true);
    expect(allowAdminOpsSoundAfterPreference(semantic, prefs(true))).toBe(true);
    expect(allowAdminOpsSoundAfterPreference(semantic, prefs(false))).toBe(false);
  });

  it("T8 Admin Q unaffected by sound preference false", () => {
    expect(
      shouldRefreshAdminOpsQueue({
        eventType: "INSERT",
        sourceTable: "reports",
        newRow: { id: "r1", status: "pending" },
      })
    ).toBe(true);
    expect(
      shouldRefreshAdminOpsQueue({
        eventType: "UPDATE",
        sourceTable: "reports",
        oldRow: { id: "r1", status: "pending" },
        newRow: { id: "r1", status: "reviewing" },
      })
    ).toBe(true);
    const provider = readFileSync(
      join(process.cwd(), "components/admin/store-points/AdminStorePointPendingProvider.tsx"),
      "utf8"
    );
    expect(provider).toContain("scheduleRefresh()");
    expect(provider).toMatch(/ingestAdminOpsSoundIfPrefAllowed[\s\S]*markStorePointChargeAlert|markStorePointChargeAlert[\s\S]*ingestAdminOpsSoundIfPrefAllowed/);
    expect(provider).not.toMatch(/allowAdminOpsSoundAfterPreference[\s\S]{0,80}setAdminBellCount/);
    expect(provider).not.toMatch(/resolveAdminOpsSoundFromPreferences[\s\S]{0,80}setAdminBellCount/);
  });

  it("T9 deeplink unaffected", () => {
    expect(resolveAdminTradeReportHref("r1")).toContain("/admin/");
    expect(resolveAdminStoreApplicationHref("s1")).toBe("/admin/business/s1");
    const deeplink = readFileSync(join(process.cwd(), "lib/admin/admin-ops-deeplink.ts"), "utf8");
    expect(deeplink).not.toContain("admin_notification_preferences");
    expect(deeplink).not.toContain("resolveAdminOpsSoundFromPreferences");
  });

  it("T10 asset config remains separate", () => {
    const policy = readFileSync(
      join(process.cwd(), "lib/notifications/admin-notification-sound-policy.ts"),
      "utf8"
    );
    expect(policy).not.toContain("admin_notification_preferences");
    expect(isAdminSoundEligible("stores")).toBe(true);
    const gate = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-preference-gate.ts"),
      "utf8"
    );
    expect(gate).not.toContain("admin_notification_settings");
  });

  it("T11 admin_notification_settings is not used as per-admin mute", () => {
    const provider = readFileSync(
      join(process.cwd(), "components/admin/store-points/AdminStorePointPendingProvider.tsx"),
      "utf8"
    );
    const gate = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-preference-gate.ts"),
      "utf8"
    );
    const client = readFileSync(
      join(process.cwd(), "lib/notifications/fetch-admin-notification-preferences-client.ts"),
      "utf8"
    );
    expect(provider).not.toContain("admin_notification_settings");
    expect(gate).not.toContain("admin_notification_settings");
    expect(client).toContain("admin_notification_preferences");
    expect(client).not.toContain("admin_notification_settings");
  });

  it("T12 explicit recipientRole=admin_ops", () => {
    const gate = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-preference-gate.ts"),
      "utf8"
    );
    expect(gate).toContain('recipientRole: "admin_ops"');
  });

  it("T13 missing admin pref table → safe compat enabled", () => {
    expect(isMissingPreferenceRelationError({ code: "PGRST205", message: "Could not find the table" })).toBe(
      true
    );
    expect(resolveAdminOpsSoundFromPreferences(prefs())).toBe(true);
    const client = readFileSync(
      join(process.cwd(), "lib/notifications/fetch-admin-notification-preferences-client.ts"),
      "utf8"
    );
    expect(client).toContain("isMissingPreferenceRelationError");
    expect(client).toContain("admin_notification_preferences");
  });

  it("T14 Member push unchanged", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).toContain("shouldSendMemberWebPushForUser");
    expect(src).not.toContain("resolveAdminOpsSoundFromPreferences");
    expect(src).not.toContain("admin_notification_preferences");
  });

  it("T15 Member sound unchanged", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-member-preference-gate.ts"),
      "utf8"
    );
    expect(src).toContain("resolveMemberSoundFromPreferences");
    expect(src).not.toContain("resolveAdminOpsSoundFromPreferences");
  });

  it("T16 Owner push unchanged", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).toContain("resolveOwnerWebPushFromPreferences");
    expect(src).not.toContain("allowAdminOpsSoundAfterPreference");
  });

  it("T17 Owner sound unchanged", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/notification-sound-owner-preference-gate.ts"),
      "utf8"
    );
    expect(src).toContain("resolveOwnerSoundFromPreferences");
    expect(src).not.toContain("resolveAdminOpsSoundFromPreferences");
    expect(src).not.toContain("admin_notification_preferences");
  });

  it("T18 no duplicate playback owner introduced", () => {
    const provider = readFileSync(
      join(process.cwd(), "components/admin/store-points/AdminStorePointPendingProvider.tsx"),
      "utf8"
    );
    expect(provider).toContain("ingestAdminOpsSoundIfPrefAllowed");
    expect(provider).toContain("allowAdminOpsSoundAfterPreference");
    // Still single ingest path — no second sound engine
    expect(provider).not.toContain("playEventNotificationSound");
    expect(provider.match(/ingestAdminRowSound\(/g)?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("default snapshot adminOps remains undefined-compat", () => {
    expect(
      resolveAdminOpsSoundFromPreferences(defaultNormalizedNotificationPreferences())
    ).toBe(true);
  });
});
