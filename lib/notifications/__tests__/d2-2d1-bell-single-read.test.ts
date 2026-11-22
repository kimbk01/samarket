import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countNotificationEventsBadgeFromRows } from "@/lib/notifications/core/notification-event-repository";
import {
  deriveBellBadgeFactsFromRows,
  stableBellFactsKey,
} from "@/lib/notifications/derive-bell-badge-facts-from-rows";
import { aggregateOrphanMissedCallFacts } from "@/lib/notifications/load-orphan-missed-call-facts";
import type { BellExplainEventRow } from "@/lib/notifications/bell-explain-matrix";

const ROOM = "11111111-1111-4111-8111-111111111111";

const rows: BellExplainEventRow[] = [
  { id: "e1", category: "missed_call", room_id: null, dedupe_key: "missed_call:c1", display_payload: { call_id: "c1" } },
  { id: "e2", category: "missed_call", room_id: ROOM, dedupe_key: "missed_call:c2", display_payload: {} },
  { id: "e3", category: "missed_call", room_id: null, dedupe_key: null, display_payload: { mute_badge: true } },
  { id: "e4", category: "chat", room_id: ROOM, display_payload: null },
  { id: "e5", category: "chat_message", room_id: ROOM, display_payload: {} },
  { id: "e6", category: "store", display_payload: {} },
  { id: "e7", category: "notice_published", display_payload: {} },
  { id: "e8", category: "inquiry_answered", display_payload: { expires_at: "2000-01-01T00:00:00Z" } },
  { id: "e9", category: "trade_status", display_payload: { deleted: "true" } },
  { id: "e10", category: "community_activity", display_payload: {}, muted_snapshot: true },
];

describe("D2 2-d-1 — bell rows read once", () => {
  it("rows under limit → same facts as the separate missed / category loaders", () => {
    const d = deriveBellBadgeFactsFromRows(rows, 2000);
    expect(d).not.toBeNull();
    const separateMissed = aggregateOrphanMissedCallFacts(rows.filter((r) => r.category === "missed_call"));
    const separateCounts = countNotificationEventsBadgeFromRows(rows);
    expect(stableBellFactsKey(d!)).toBe(stableBellFactsKey({ missed: separateMissed, categoryCounts: separateCounts }));
    expect(d!.missed.orphan).toBe(1);
    expect(d!.missed.byRoom).toEqual({ [ROOM]: 1 });
    expect(d!.categoryCounts.chatMessage).toBe(2);
    expect(d!.categoryCounts.orderStatus).toBe(1);
    expect(d!.categoryCounts.adminNotice).toBe(1);
    expect(d!.categoryCounts.tradeStatus).toBe(0);
    expect(d!.categoryCounts.communityActivity).toBe(1);
    expect(d!.categoryCounts.missedCall).toBe(2);
  });

  it("rows at the limit (may be truncated) → null so caller reads separately", () => {
    expect(deriveBellBadgeFactsFromRows(rows, rows.length)).toBeNull();
    expect(deriveBellBadgeFactsFromRows(rows, rows.length + 1)).not.toBeNull();
  });

  it("builder reads the bell rows first and keeps the separate path (shadow retired 2026-11-22)", () => {
    const src = readFileSync("lib/notifications/pipeline/build-domain-badge-authority-http.ts", "utf8");
    expect(src).toContain("deriveBellBadgeFactsFromRows(rows, MEMBER_NOTIFICATION_A_LOAD_LIMIT)");
    expect(src).not.toContain('console.info("[bell-single-read-shadow]"');
    expect(src).not.toContain("keepAliveAfterResponse(");
    expect(src).toContain("loadOrphanMissedCallFacts(sb, uid)");
    expect(src).toContain("countNotificationEventsBadge(sb, uid)");
  });
});
