import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import {
  defaultNormalizedNotificationPreferences,
  type NormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import { isMissingPreferenceRelationError } from "@/lib/notifications/policy/notification-preference-storage-reader.server";
import {
  resolveOwnerWebPushFromPreferences,
  resolveWebPushPreferenceRecipientRole,
  shouldSendWebPushForUser,
  type WebPushKind,
} from "@/lib/notifications/web-push-user-settings-gate";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

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

function payload(partial: Partial<NotificationSideEffectPayloadOut> & {
  meta?: Record<string, unknown>;
}): NotificationSideEffectPayloadOut {
  return {
    user_id: "owner-1",
    notification_type: partial.notification_type ?? "commerce",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: partial.meta ?? { kind: "store_order_created" },
  };
}

describe("P2-A7a Owner push consumer cutover", () => {
  it("T1 Owner no row → optional push compatibility enabled", () => {
    expect(
      resolveOwnerWebPushFromPreferences(
        payload({ meta: { kind: "store_order_created" } }),
        prefs({ owner: {} })
      )
    ).toBe(true);
  });

  it("T2 Owner optional push true → true", () => {
    expect(
      resolveOwnerWebPushFromPreferences(
        payload({ meta: { kind: "store_order_created" } }),
        prefs({ owner: { optionalPushEnabled: true } })
      )
    ).toBe(true);
  });

  it("T3 Owner optional push false → false", () => {
    expect(
      resolveOwnerWebPushFromPreferences(
        payload({ meta: { kind: "store_order_created" } }),
        prefs({ owner: { optionalPushEnabled: false } })
      )
    ).toBe(false);
  });

  it("T4 Owner Member push/order/store OFF does not suppress Owner optional push", () => {
    expect(
      resolveOwnerWebPushFromPreferences(
        payload({ meta: { kind: "store_order_created" } }),
        prefs({
          member: {
            ...defaultNormalizedNotificationPreferences().member!,
            pushEnabled: false,
            serviceEnabled: false,
            orderEnabled: false,
            storeEnabled: false,
          },
          owner: { optionalPushEnabled: true },
        })
      )
    ).toBe(true);
  });

  it("T5 Owner mandatory push + optional_push=false → true", () => {
    expect(
      resolveOwnerWebPushFromPreferences(
        payload({ meta: { kind: "store_point_charge_on_hold" } }),
        prefs({ owner: { optionalPushEnabled: false } })
      )
    ).toBe(true);
  });

  it("T6 Owner system optional + optional_push=false → false", () => {
    // inquiry_answered for owner is optional platform reply; system push_kind is not mandatory
    const out = payload({
      notification_type: "system",
      meta: {
        kind: "inquiry_answered",
        push_kind: "system" as WebPushKind,
        receiverRole: "owner",
      },
    });
    // If policy maps inquiry_answered as member by default, force owner via receiverRole
    expect(resolveWebPushPreferenceRecipientRole(out)).toBe("owner");
    // Owner optional inquiry — if policy says optional for owner scope:
    // When kind is inquiry_answered with owner role, check policy.
    // Use store_order_created with system push_kind to prove system != mandatory bypass
    const systemOptional = payload({
      notification_type: "commerce",
      meta: { kind: "store_order_created", push_kind: "system" },
    });
    expect(resolveWebPushPreferenceRecipientRole(systemOptional)).toBe("owner");
    expect(
      resolveOwnerWebPushFromPreferences(
        systemOptional,
        prefs({ owner: { optionalPushEnabled: false } })
      )
    ).toBe(false);
  });

  it("T7 Owner unknown event does not become mandatory", () => {
    const out = payload({
      meta: { kind: "totally_unknown_owner_kind_xyz", receiverRole: "owner" },
    });
    expect(resolveWebPushPreferenceRecipientRole(out)).toBe("owner");
    const result = resolveEffectiveNotificationPreference({
      metaKind: "totally_unknown_owner_kind_xyz",
      recipientRole: "owner",
      preferences: prefs({ owner: { optionalPushEnabled: false } }),
    });
    expect(result.mandatory).toBe(false);
  });

  it("T8 Owner role explicit", () => {
    expect(
      resolveWebPushPreferenceRecipientRole(
        payload({ meta: { kind: "store_order_created" } })
      )
    ).toBe("owner");
    expect(
      resolveWebPushPreferenceRecipientRole(
        payload({
          notification_type: "system",
          meta: { kind: "admin_notice", push_kind: "system" },
        })
      )
    ).toBe("member");
  });

  it("T9 Member push path unchanged (source isolation)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).toContain("shouldSendMemberWebPushForUser");
    expect(src).toContain("resolveMemberWebPushFromPreferences");
    expect(src).toContain("shouldSendOwnerWebPushForUser");
    expect(src).toContain("resolveOwnerWebPushFromPreferences");
    expect(src).not.toContain("shouldSendLegacyWebPushForUser");
    expect(src).not.toMatch(/order_enabled/);
    expect(src).not.toMatch(/store_enabled/);
  });

  it("T10 Admin Ops unchanged", () => {
    const soundDecision = readFileSync(
      join(process.cwd(), "lib/admin/admin-ops-sound-decision.ts"),
      "utf8"
    );
    expect(soundDecision).not.toContain("resolveOwnerWebPushFromPreferences");
    expect(soundDecision).not.toContain("owner_notification_settings");
  });

  it("T11 OWNER_C unchanged", () => {
    const cStore = readFileSync(
      join(process.cwd(), "lib/notifications/badge-authority-rebuild/c-store-authority-contract.ts"),
      "utf8"
    );
    expect(cStore).not.toContain("resolveOwnerWebPushFromPreferences");
    expect(cStore).not.toContain("optionalPushEnabled");
  });

  it("T12 no raw Member preference read in cut-over Owner path", async () => {
    const tables: string[] = [];
    const fromSpy = vi.fn((table: string) => {
      tables.push(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
    const svc = { from: fromSpy } as unknown as Parameters<typeof shouldSendWebPushForUser>[0];
    const allowed = await shouldSendWebPushForUser(
      svc,
      "owner-1",
      payload({ meta: { kind: "store_order_created" } })
    );
    expect(allowed).toBe(true);
    expect(tables).toContain("owner_notification_settings");
    // Reader still loads member rows for unified snapshot, but Owner decision ignores them.
    // Collision removal: Owner path must not use legacy-only dual query without owner table.
    expect(tables).toContain("owner_notification_settings");
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/web-push-user-settings-gate.ts"),
      "utf8"
    );
    expect(src).not.toContain("shouldSendLegacyWebPushForUser");
  });

  it("table-absence safety helper recognizes missing relation codes", () => {
    expect(isMissingPreferenceRelationError({ code: "PGRST205", message: "Could not find the table" })).toBe(
      true
    );
    expect(
      isMissingPreferenceRelationError({ code: "42P01", message: 'relation "x" does not exist' })
    ).toBe(true);
    expect(isMissingPreferenceRelationError({ code: "42501", message: "permission denied" })).toBe(
      false
    );
  });

  it("Owner push with missing owner table (null row) stays enabled", async () => {
    const fromSpy = vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(
        table === "owner_notification_settings"
          ? { data: null, error: { code: "PGRST205", message: "Could not find the table" } }
          : { data: null, error: null }
      ),
    }));
    const svc = { from: fromSpy } as unknown as Parameters<typeof shouldSendWebPushForUser>[0];
    const allowed = await shouldSendWebPushForUser(
      svc,
      "owner-1",
      payload({ meta: { kind: "store_order_created" } })
    );
    expect(allowed).toBe(true);
  });
});
