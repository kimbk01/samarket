/**
 * Gate 3 — Live unknown 245 product disposition contract.
 */
import { describe, expect, it } from "vitest";
import {
  assertBackfillIdempotent,
  assertEveryRowHasDisposition,
  dryRunLegacyNotificationsBackfill,
  planLegacyNotificationsBackfill,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import { resolveMemberAppIconAuthority } from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { resolveStoreOwnerAuthority } from "@/lib/notifications/badge-authority-rebuild/store-owner-c-authority";

function row(
  partial: Partial<LegacyNotificationsBackfillRow> & Pick<LegacyNotificationsBackfillRow, "id">
): LegacyNotificationsBackfillRow {
  return {
    user_id: "member-1",
    notification_type: "admin_notice",
    is_read: false,
    created_at: "2026-01-01T00:00:00.000Z",
    title: "t",
    body: "b",
    link_url: "/x",
    meta: {},
    ...partial,
  };
}

describe("Gate3 Live Unknown Disposition", () => {
  it("community like/comment → A; not B/C", () => {
    const plan = planLegacyNotificationsBackfill([
      row({
        id: "c1",
        notification_type: "report",
        meta: { kind: "community_like", post_id: "p1" },
      }),
      row({
        id: "c2",
        notification_type: "report",
        meta: { kind: "community_comment", comment_id: "cm1" },
      }),
    ]);
    expect(plan.every((p) => p.disposition === "backfill_a")).toBe(true);
    expect(plan[0]?.proposed?.type).toBe("community_reaction");
    expect(plan[1]?.proposed?.type).toBe("community_comment");
    expect(plan.every((p) => p.proposed?.category === "community_activity")).toBe(true);
  });

  it("trade_completed/reserved → A trade_status_changed", () => {
    const plan = planLegacyNotificationsBackfill([
      row({
        id: "t1",
        notification_type: "status",
        meta: { kind: "trade_completed", item_id: "i1" },
      }),
      row({
        id: "t2",
        notification_type: "status",
        meta: { kind: "trade_reserved", item_id: "i2" },
      }),
    ]);
    expect(plan[0]?.disposition).toBe("backfill_a");
    expect(plan[0]?.proposed?.type).toBe("trade_status_changed");
    expect(plan[0]?.proposed?.meta?.trade_status).toBe("trade_completed");
    expect(plan[1]?.proposed?.meta?.trade_status).toBe("trade_reserved");
  });

  it("trade_offer structured → A; unstructured → quarantine; chat duplicate → exclude", () => {
    const structured = planLegacyNotificationsBackfill([
      row({
        id: "o1",
        notification_type: "status",
        meta: { kind: "trade_offer", offer_id: "off-1", listing_id: "L1" },
      }),
    ])[0];
    expect(structured?.disposition).toBe("backfill_a");
    expect(structured?.proposed?.type).toMatch(/^trade_offer_/);

    const unstructured = planLegacyNotificationsBackfill([
      row({
        id: "o2",
        notification_type: "status",
        meta: { kind: "trade_offer" },
        title: "",
        body: "",
        link_url: "",
        ref_id: "",
      }),
    ])[0];
    expect(unstructured?.disposition).toBe("quarantine_excluded");
    expect(unstructured?.reason).toBe("quarantined_trade_offer_unstructured");

    const chatDup = planLegacyNotificationsBackfill([
      row({
        id: "o3",
        notification_type: "chat",
        push_kind: "chat",
        meta: { kind: "trade_offer", offer_id: "off-2" },
      }),
    ])[0];
    expect(chatDup?.disposition).toBe("exclude_chat");
  });

  it("same offer identity collapses to one A", () => {
    const plan = planLegacyNotificationsBackfill([
      row({
        id: "o1",
        notification_type: "status",
        meta: { kind: "trade_offer", offer_id: "same" },
      }),
      row({
        id: "o2",
        notification_type: "status",
        meta: { kind: "trade_offer", offer_id: "same" },
      }),
    ]);
    expect(plan.filter((p) => p.disposition === "backfill_a")).toHaveLength(1);
    expect(plan.filter((p) => p.disposition === "already_canonical")).toHaveLength(1);
  });

  it("review with valid identity → A; without → quarantine", () => {
    const ok = planLegacyNotificationsBackfill([
      row({
        id: "r1",
        notification_type: "review",
        meta: { review_id: "rv1" },
      }),
    ])[0];
    expect(ok?.disposition).toBe("backfill_a");

    const bad = planLegacyNotificationsBackfill([
      row({
        id: "r2",
        notification_type: "review",
        meta: {},
        title: "",
        body: "",
        link_url: "",
        ref_id: "",
      }),
    ])[0];
    expect(bad?.disposition).toBe("quarantine_excluded");
    expect(bad?.reason).toBe("quarantined_review_identity_incomplete");
  });

  it("status empty without source proof → quarantine; report/other → quarantine", () => {
    const statusEmpty = planLegacyNotificationsBackfill([
      row({ id: "s1", notification_type: "status", meta: {} }),
    ])[0];
    expect(statusEmpty?.disposition).toBe("quarantine_excluded");
    expect(statusEmpty?.reason).toBe("quarantined_status_empty");

    const reportOther = planLegacyNotificationsBackfill([
      row({ id: "rp1", notification_type: "report", meta: { kind: "empty" } }),
    ])[0];
    // kind "empty" is not community_* → quarantine report
    expect(reportOther?.disposition).toBe("quarantine_excluded");
  });

  it("quarantine rows do not affect A/B/C/App Icon", () => {
    const dry = dryRunLegacyNotificationsBackfill([
      row({ id: "s1", notification_type: "status", meta: {} }),
      row({ id: "rp1", notification_type: "report", meta: { kind: "misc" } }),
    ]);
    expect(dry.eligibleForA).toBe(0);
    expect(dry.eligibleForB).toBe(0);
    expect(dry.eligibleForC).toBe(0);
    expect(dry.quarantinedExcluded).toBe(2);

    const a = resolveMemberNotificationAuthorityFromRows([], "member-1");
    const b = resolveMemberConversationAuthority("member-1", []);
    const icon = resolveMemberAppIconAuthority({
      notificationA: a,
      conversationB: b,
      revision: 1,
    });
    expect(icon.appIconTotal).toBe(0);
    const c = resolveStoreOwnerAuthority({
      storeId: "store-1",
      operational: {
        pendingOrderActions: 0,
        refundActions: 0,
        cancelActions: 0,
        openInquiryActions: 0,
      },
    });
    expect(c?.cOperational ?? 0).toBe(0);
  });

  it("fixture rows each get one disposition; second dry-run idempotent", () => {
    const rows = [
      row({ id: "1", notification_type: "admin_notice" }),
      row({
        id: "2",
        notification_type: "report",
        meta: { kind: "community_like" },
      }),
      row({ id: "3", notification_type: "status", meta: {} }),
      row({
        id: "4",
        notification_type: "status",
        meta: { kind: "trade_completed" },
      }),
      row({ id: "5", notification_type: "chat", push_kind: "chat" }),
    ];
    expect(assertEveryRowHasDisposition(rows)).toEqual({ ok: true, count: 5 });
    expect(assertBackfillIdempotent(rows)).toEqual({ ok: true, secondInserts: 0 });
    const dry = dryRunLegacyNotificationsBackfill(rows);
    expect(dry.unknownClassification).toBe(0);
    expect(dry.quarantinedExcluded).toBe(1);
  });
});
