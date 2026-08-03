/**
 * Gate 3 Step 4 — Authority A set contract (must PASS).
 * Bell digit event ids ≡ unread list ≡ mark-all targets.
 */
import { describe, expect, it } from "vitest";
import {
  gate2ASetsEqual,
  snapshotAuthorityASets,
  sortedUnique,
} from "@/lib/notifications/badge-authority-rebuild/authority-a-set-heads";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import {
  isMemberNotificationAUnread,
  type MemberNotificationAEventRow,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

function row(partial: Record<string, unknown>): MemberNotificationAEventRow {
  return {
    id: "e1",
    unread: true,
    read_at: null,
    display_payload: {},
    ...partial,
  } as MemberNotificationAEventRow;
}

function baseFixture(): MemberNotificationAEventRow[] {
  return [
    row({
      id: "evt-a",
      type: "trade_status",
      category: "trade_status",
      dedupe_key: "trade_status:p1:v1",
      display_payload: { legacyMeta: { product_id: "prod-1" } },
    }),
    row({
      id: "evt-b",
      type: "trade_status",
      category: "trade_status",
      dedupe_key: "trade_status:p1:v2",
      display_payload: { legacyMeta: { product_id: "prod-1" } },
    }),
    row({
      id: "evt-c",
      type: "admin_notice",
      category: "admin_notice",
      dedupe_key: "admin:n1",
    }),
  ];
}

describe("Gate3 Step4 Notification Authority A contract", () => {
  it("digit event IDs equals unread list event IDs equals mark-all targets", () => {
    const snap = snapshotAuthorityASets(baseFixture(), "member-1");
    expect(gate2ASetsEqual(snap)).toBe(true);
    expect(sortedUnique(snap.digitEventIds)).toEqual(
      sortedUnique(snap.unreadListEventIds)
    );
    expect(sortedUnique(snap.digitEventIds)).toEqual(sortedUnique(snap.markAllEventIds));
    expect(snap.digitCount).toBe(snap.digitEventIds.length);
  });

  it("same product different dedupe → distinct event ids (not attention-key collapse)", () => {
    const snap = snapshotAuthorityASets(baseFixture(), "member-1");
    expect(snap.digitCount).toBe(3);
    expect(sortedUnique(snap.digitEventIds)).toEqual(["evt-a", "evt-b", "evt-c"]);
    // attention keys may still collapse — ADAPTER only
    expect(snap.digitAttentionKeys.length).toBeLessThanOrEqual(snap.digitCount);
  });

  it("duplicate dedupe key counted once", () => {
    const rows = [
      row({
        id: "d1",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "same-key",
      }),
      row({
        id: "d2",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "same-key",
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.unreadCount).toBe(1);
    expect(auth.eventIds).toEqual(["d1"]);
    expect(gate2ASetsEqual(snapshotAuthorityASets(rows, "m1"))).toBe(true);
  });

  it("read event excluded from A", () => {
    const rows = [
      row({ id: "u1", type: "admin_notice", category: "admin_notice", dedupe_key: "a" }),
      row({
        id: "r1",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "b",
        unread: false,
        read_at: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["u1"]);
  });

  it("deleted/dismissed event excluded from A", () => {
    const rows = [
      row({
        id: "x1",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "x",
        display_payload: { inbox_dismissed_at: "2026-01-01T00:00:00.000Z" },
      }),
    ];
    expect(isMemberNotificationAUnread(rows[0]!)).toBe(false);
    expect(resolveMemberNotificationAuthorityFromRows(rows, "m1").unreadCount).toBe(0);
  });

  it("push-only marketing excluded; persistent admin included", () => {
    const rows = [
      row({
        id: "mk",
        type: "admin_marketing_banner",
        category: "admin_marketing_banner",
        dedupe_key: "m",
      }),
      row({ id: "n1", type: "admin_notice", category: "admin_notice", dedupe_key: "n" }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["n1"]);
  });

  it("trade peer message excluded; trade status included", () => {
    const rows = [
      row({
        id: "tm",
        type: "trade_message",
        category: "chat",
        room_id: "tr1",
        dedupe_key: "tm1",
      }),
      row({
        id: "ts",
        type: "trade_status",
        category: "trade_status",
        dedupe_key: "ts1",
        display_payload: { legacyMeta: { product_id: "p9" } },
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["ts"]);
  });

  it("order peer message excluded; buyer order status included", () => {
    const rows = [
      row({
        id: "om",
        type: "store_order_message",
        category: "chat",
        room_id: "so1",
        dedupe_key: "om1",
      }),
      row({
        id: "os",
        type: "order_status",
        category: "order_status",
        dedupe_key: "buyer:o1",
        display_payload: {
          legacyMeta: { kind: "store_order_owner_status", order_id: "o1" },
        },
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["os"]);
  });

  it("store-scoped owner_intake excluded", () => {
    const rows = [
      row({
        id: "oi",
        type: "order_status",
        category: "order_status",
        dedupe_key: "commerce:owner:new_order:ox",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        },
      }),
    ];
    expect(resolveMemberNotificationAuthorityFromRows(rows, "m1").unreadCount).toBe(0);
  });

  it("orphan missed included; room-bound missed excluded", () => {
    const rows = [
      row({
        id: "orphan",
        type: "missed_call",
        category: "missed_call",
        dedupe_key: "missed:orphan",
      }),
      row({
        id: "bound",
        type: "missed_call",
        category: "missed_call",
        room_id: "r1",
        dedupe_key: "missed:bound",
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    expect(auth.eventIds).toEqual(["orphan"]);
  });

  it("authorityVersion and computedAt present", () => {
    const auth = resolveMemberNotificationAuthorityFromRows(baseFixture(), "m1");
    expect(auth.authorityVersion.length).toBeGreaterThan(10);
    expect(auth.computedAt).toMatch(/^\d{4}-/);
    expect(auth.memberKey).toBe("user:m1");
  });

  it("different member event excluded when user_id present", () => {
    const rows = [
      row({
        id: "mine",
        user_id: "m1",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "a",
      }),
      row({
        id: "theirs",
        user_id: "m2",
        type: "admin_notice",
        category: "admin_notice",
        dedupe_key: "b",
      }),
    ];
    expect(resolveMemberNotificationAuthorityFromRows(rows, "m1").eventIds).toEqual(["mine"]);
  });

  it("mark-all target IDs are exactly canonical A IDs (no B/C leakage)", () => {
    const rows = [
      ...baseFixture(),
      row({
        id: "chat-b",
        type: "chat_message",
        category: "chat",
        room_id: "r1",
        dedupe_key: "chat1",
      }),
      row({
        id: "owner-c",
        type: "order_status",
        category: "order_status",
        dedupe_key: "commerce:owner:new_order:ox",
        display_payload: {
          legacyMeta: { kind: "store_order_created", order_id: "ox", store_id: "s1" },
        },
      }),
    ];
    const auth = resolveMemberNotificationAuthorityFromRows(rows, "m1");
    const snap = snapshotAuthorityASets(rows, "m1");
    expect(sortedUnique(snap.markAllEventIds)).toEqual(sortedUnique(auth.eventIds));
    expect(snap.markAllEventIds).not.toContain("chat-b");
    expect(snap.markAllEventIds).not.toContain("owner-c");
    expect(sortedUnique(snap.digitEventIds)).toEqual(["evt-a", "evt-b", "evt-c"]);
  });
});
