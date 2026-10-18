/**
 * SRV-02 / SRV-03 — real path: notification_events row → buildPushPayload → preference gate
 * (event type + recipient role) → registry domain. Proposed SSOT table (v2 approval).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/runtime", () => ({ getSiteOrigin: () => "https://app.example" }));

import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";
import { buildPushPayload } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import {
  resolveWebPushPreferenceEventType,
  resolveWebPushPreferenceRecipientRole,
} from "@/lib/notifications/web-push-user-settings-gate";
import { getNotificationPreferencePolicy } from "@/lib/notifications/policy/notification-preference-policy-registry";

function row(type: NotificationEventRow["type"], display: Record<string, unknown> | null = null): NotificationEventRow {
  return {
    id: "ev-1",
    user_id: "u-1",
    type,
    category: "system" as NotificationEventRow["category"],
    room_id: "room-1",
    call_session_id: null,
    actor_user_id: null,
    message_id: null,
    title: "t",
    body: "b",
    display_payload: display,
    unread: true,
    read_at: null,
    delivered_at: null,
    opened_at: null,
    muted_snapshot: false,
    push_suppressed_reason: null,
    sound_suppressed_reason: null,
    dedupe_key: "k",
    created_at: "2026-10-18T00:00:00.000Z",
  };
}

function gate(r: NotificationEventRow) {
  const out = buildPushPayload(r, 0);
  const eventType = resolveWebPushPreferenceEventType(out);
  const role = resolveWebPushPreferenceRecipientRole(out);
  const meta = out.meta as Record<string, unknown>;
  const policy = getNotificationPreferencePolicy({
    eventType,
    metaKind: typeof meta.kind === "string" ? meta.kind : null,
    recipientRole: role,
  });
  return { eventType, role, domain: policy.preferenceDomain, cls: policy.policyClass };
}

describe("SRV-02 push preference category (payload → gate)", () => {
  it.each([
    // [event row, expected domain, expected role]
    ["chat_message", null, "community_chat", "member"],
    ["group_message", null, "community_chat", "member"],
    ["trade_message", null, "trade_chat", "member"],
    ["trade_status", { legacyMeta: { kind: "price_offer_created" } }, "trade_events", "member"],
    ["order_status", { legacyMeta: { kind: "store_order_owner_status" } }, "order", "member"],
    ["community_activity", { legacyMeta: { kind: "community_comment" } }, "community_social", "member"],
    ["community_activity", { legacyMeta: { kind: "community_like" } }, "community_social", "member"],
    ["admin_notice", null, "notice", "member"],
    ["support_admin_replied", null, "notice", "member"],
    ["admin_marketing_banner", null, "marketing", "member"],
  ] as const)("%s %j → %s / %s", (type, display, domain, role) => {
    const g = gate(row(type, display as Record<string, unknown> | null));
    expect(g.eventType).toBe(type);
    expect(g.domain).toBe(domain);
    expect(g.role).toBe(role);
  });

  it("store_order_message to the buyer is judged by member order chat, not owner settings", () => {
    const g = gate(row("store_order_message", { receiverRole: "user", legacyMeta: { kind: "store_order_message", receiverRole: "user" } }));
    expect(g.role).toBe("member");
    expect(g.domain).toBe("order_chat");
  });

  it("store_order_message to the store owner stays on owner order ops", () => {
    const g = gate(row("store_order_message", { receiverRole: "owner", legacyMeta: { kind: "store_order_message", receiverRole: "owner" } }));
    expect(g.role).toBe("owner");
    expect(g.domain).toBe("owner_order_ops");
  });

  it("missed call keeps the call domain", () => {
    expect(gate(row("missed_call")).domain).toBe("call");
  });
});

describe("SRV-03 owner business notices are never marketing", () => {
  it.each(["delivery_ad_business_cash_charge_completed", "delivery_ad_business_cash_charge_rejected"])(
    "%s → owner financial mandatory",
    (kind) => {
      const g = gate(row("admin_notice", { legacyMeta: { kind } }));
      expect(g.role).toBe("owner");
      expect(g.domain).toBe("owner_financial");
      expect(g.cls).toBe("mandatory");
    }
  );

  it.each([
    "delivery_ad_changes_requested",
    "delivery_ad_approved",
    "delivery_ad_rejected",
    "delivery_ad_paused_admin",
    "delivery_ad_resumed",
    "delivery_ad_terminated",
    "delivery_ad_ended",
    "delivery_ad_admin_message",
  ])("%s → owner order ops optional", (kind) => {
    const g = gate(row("admin_notice", { legacyMeta: { kind } }));
    expect(g.role).toBe("owner");
    expect(g.domain).toBe("owner_order_ops");
    expect(g.cls).toBe("optional_operational");
  });
});
