/**
 * CD-1 — preference consent fail-closed T1–T7 (gate + reader).
 * Does not mock shouldSendWebPushForUser.
 */
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
  resolveMemberWebPushFromPreferences,
  shouldSendWebPushForUser,
} from "@/lib/notifications/web-push-user-settings-gate";
import {
  isNotificationPreferenceReadFailedError,
  NOTIFICATION_PREFERENCE_READ_FAILED_PREFIX,
  readNormalizedNotificationPreferenceSnapshot,
} from "@/lib/notifications/policy/notification-preference-storage-reader.server";

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

function timeoutDbSvc(failTable = "user_notification_settings") {
  const fromSpy = vi.fn((table: string) => {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error:
          table === failTable
            ? { code: "57014", message: "canceling statement due to statement timeout" }
            : null,
      }),
    };
  });
  return { from: fromSpy } as never;
}

describe("CD-1 preference consent fail-closed (T1–T7)", () => {
  it("T1 — optional event + prefs OK + user ON → SEND", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({
          pushEnabled: true,
          serviceEnabled: true,
          chatPushEnabled: true,
          tradeChatEnabled: true,
        })
      )
    ).toBe(true);
  });

  it("T2 — optional event + prefs OK + user OFF → DO NOT SEND", () => {
    expect(
      resolveMemberWebPushFromPreferences(
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } }),
        memberPrefs({ pushEnabled: false })
      )
    ).toBe(false);
  });

  it("T3 — optional event + READ OK + NO ROW → existing defaults", async () => {
    const fromSpy = vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const svc = { from: fromSpy } as never;
    const allowed = await shouldSendWebPushForUser(
      svc,
      "user-1",
      payload({ notification_type: "chat", meta: { kind: "trade_chat" } })
    );
    expect(allowed).toBe(true);
  });

  it("T4 — optional event + PREFERENCE_READ_FAILED → DO NOT SEND", async () => {
    await expect(
      shouldSendWebPushForUser(
        timeoutDbSvc(),
        "user-1",
        payload({ notification_type: "chat", meta: { kind: "trade_chat" } })
      )
    ).resolves.toBe(false);
  });

  it("T4b — reader distinguishes READ_FAILED from NO_ROW", async () => {
    await expect(
      readNormalizedNotificationPreferenceSnapshot("user-1", {}, timeoutDbSvc())
    ).rejects.toSatisfy((err: unknown) => isNotificationPreferenceReadFailedError(err));
    expect(NOTIFICATION_PREFERENCE_READ_FAILED_PREFIX).toBe("notification_preference_read_failed:");
  });

  it("T5 — settings resolver unexpected reject → outer catch fail-closed (source)", () => {
    const dispatch = readFileSync(
      join(process.cwd(), "lib/push/dispatch/dispatch-push-for-user.ts"),
      "utf8"
    );
    const campaign = readFileSync(
      join(process.cwd(), "lib/admin/notification-campaigns/campaign-eligibility.ts"),
      "utf8"
    );
    expect(dispatch).toContain(".catch(\n      () => false\n    )");
    expect(dispatch).not.toContain(".catch(() => true)");
    expect(campaign).toContain(".catch(() => false)");
    expect(campaign).not.toContain(".catch(() => true)");
  });

  it("T6 — mandatory event + PREFERENCE_READ_FAILED → MANDATORY PRESERVED", async () => {
    await expect(
      shouldSendWebPushForUser(
        timeoutDbSvc(),
        "user-1",
        payload({
          notification_type: "commerce",
          meta: { kind: "gift_transfer_offered" },
        })
      )
    ).resolves.toBe(true);
  });

  it("T7 — Call skip_settings_gate contract preserved (source)", () => {
    const dispatch = readFileSync(
      join(process.cwd(), "lib/push/dispatch/dispatch-push-for-user.ts"),
      "utf8"
    );
    const incoming = readFileSync(
      join(process.cwd(), "lib/push/send-community-messenger-incoming-call-push.ts"),
      "utf8"
    );
    expect(dispatch).toContain("skip_settings_gate");
    expect(incoming).toContain("skip_settings_gate: true");
  });

  it("inbox path does not call preference gate (structural)", () => {
    const dispatcher = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/notification-event-dispatcher.ts"),
      "utf8"
    );
    expect(dispatcher).toContain("createNotificationEvent");
    expect(dispatcher).not.toContain("shouldSendWebPushForUser");
  });
});
