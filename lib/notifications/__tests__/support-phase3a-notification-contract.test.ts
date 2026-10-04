/**
 * Support Phase 3A — notification accuracy contract (docs/support-center/support-ui-notification-ssot-spec.md §3A).
 * A1 admin toast/sound source · A2 bell visibility (server = client) · A4 push preference toggle.
 * A3 read sync and A5 recipients are behaviour-tested in lib/support/__tests__/support-audit-phase1-regression.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyBadgeAuthority,
  MEMBER_NOTIFICATION_A_KINDS,
} from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import {
  filterMemberNotificationAInboxRows,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-projection";
import { mapNotificationEventToInboxRow } from "@/lib/notifications/inbox-events-merge";
import { classifyMemberNotificationDomain } from "@/lib/notifications/member-notification-domain";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";
import { resolveWebPushPreferenceEventType } from "@/lib/notifications/web-push-user-settings-gate";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** Production (type, category) pairs written by notifySupportEvent (DB verified 2026-10-05). */
const SUPPORT_EVENTS: ReadonlyArray<[string, string]> = [
  ["support_admin_replied", "inquiry_answered"],
  ["support_case_resolved", "admin_notice"],
  ["support_case_reopened", "admin_notice"],
  ["support_customer_replied", "admin_notice"],
  ["support_case_created", "admin_notice"],
  ["support_case_assigned", "admin_notice"],
];

function supportEvent(type: string, category: string, id = `e-${type}`) {
  return {
    id,
    type,
    category,
    title: "문의 SC-100001",
    body: "본문",
    display_payload: {
      routeUrl: "/support/cases/c1",
      supportCaseId: "c1",
      publicCaseNo: "SC-100001",
      previewKind: "support_case",
      audience: "MEMBER",
    },
    read_at: null,
    created_at: "2026-10-05T00:00:00.000Z",
    dedupe_key: `${type}:m1`,
    room_id: null,
  } as never;
}

describe("Phase 3A A2 — support notifications: server digit = client list", () => {
  it("every support type is A on the server (DB category) AND on the client (inbox DTO)", () => {
    for (const [type, category] of SUPPORT_EVENTS) {
      const server = classifyBadgeAuthority({
        type,
        category,
        kind: type,
        metaKind: null,
        attentionKey: `${type}:m1`,
        storeId: null,
        userId: "viewer",
      } as never);
      expect(server.classification, `${type} server`).toBe("A_MEMBER_NOTIFICATION");

      const inbox = mapNotificationEventToInboxRow(supportEvent(type, category));
      expect(inbox.bell_presentation_type, `${type} presentation`).toBe("admin_notice");
      const kept = filterMemberNotificationAInboxRows([{ ...inbox, unread: true } as never]);
      expect(kept, `${type} client list`).toHaveLength(1);
    }
  });

  it("support rows live under 「전체」 only, like legacy inquiry_answered (no notice/system tab)", () => {
    for (const [type, category] of SUPPORT_EVENTS) {
      const inbox = mapNotificationEventToInboxRow(supportEvent(type, category));
      expect(
        classifyMemberNotificationDomain({
          push_kind: inbox.push_kind,
          notification_type: inbox.notification_type,
          type: inbox.notification_type,
          event_type: inbox.event_type,
          bell_presentation_type: inbox.bell_presentation_type,
        })
      ).toBeNull();
    }
    expect(
      classifyMemberNotificationDomain({ event_type: "inquiry_answered", bell_presentation_type: "admin_notice" })
    ).toBeNull();
  });

  it("A-kind list only gains the six support types (no other kind added)", () => {
    const support = MEMBER_NOTIFICATION_A_KINDS.filter((k) => k.startsWith("support_"));
    expect([...support].sort()).toEqual(SUPPORT_EVENTS.map(([t]) => t).sort());
  });
});

describe("Phase 3A A4 — support push is gated by the 공지(notice) toggle", () => {
  it("dispatcher stamps meta.event_type for support_* only", () => {
    const src = read("lib/notifications/pipeline/notify-push-dispatcher.ts");
    expect(src).toContain('...(row.type.startsWith("support_") ? { event_type: row.type } : {})');
  });

  it("resolves canonical support row → notice (never safe_fallback/order)", () => {
    for (const [type] of SUPPORT_EVENTS) {
      const out = {
        notification_type: "notification",
        meta: { event_type: type, kind: type },
      } as never;
      const eventType = resolveWebPushPreferenceEventType(out);
      expect(eventType).toBe(type);
      const policy = getNotificationPreferencePolicy({ eventType, metaKind: type, recipientRole: "member" });
      expect(policy.resolutionSource, type).toBe("canonical_event");
      expect(policy.preferenceDomain, type).toBe("notice");
    }
  });
});

describe("Phase 3A A1 — admin awareness source", () => {
  it("provider toasts/sounds from support_messages; support_cases events refresh counts only", () => {
    const provider = read("components/admin/store-points/AdminStorePointPendingProvider.tsx");
    const casesInsert = provider.slice(
      provider.indexOf('{ event: "INSERT", schema: "public", table: "support_cases" }'),
      provider.indexOf('{ event: "UPDATE", schema: "public", table: "support_cases" }')
    );
    expect(casesInsert).toContain("scheduleRefresh()");
    expect(casesInsert).not.toContain("markSupport");
    expect(provider).toContain('sourceTable: "support_messages"');
    // Toast must not use the admin detail GET (it marks the case read).
    const alert = provider.slice(
      provider.indexOf("const markSupportMessageAlert"),
      provider.indexOf("const seedPendingChargeRowsSilent")
    );
    expect(alert).not.toContain("/api/admin/support/cases");
    expect(alert).toContain("supportAudienceLabel");
    expect(provider).toContain("admin_support_toast_open");
    expect(provider).toContain('data-testid="admin-awareness-toast-close"');
  });
});
