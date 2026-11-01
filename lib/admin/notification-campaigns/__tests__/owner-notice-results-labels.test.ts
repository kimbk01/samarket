import { describe, expect, it } from "vitest";
import { loadOwnerNoticeResults } from "@/lib/admin/notification-campaigns/owner-notice-results";

/** 매장 알림 결과 — 종류마다 다른 이름(같은 이름 두 줄 금지) · 운영 알림은 매장 id 가 있을 때만. */
function fakeSb(tables: Record<string, Array<Record<string, unknown>>>) {
  const from = (table: string) => {
    const q = {
      select: () => q,
      gte: () => q,
      or: () => q,
      in: () => q,
      order: () => q,
      range: () => q,
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => res({ data: tables[table] ?? [], error: null }),
    };
    return q;
  };
  return { from } as never;
}

const ev = (id: string, kind: string, store: string | null, unread = true) => ({
  id,
  user_id: "o1",
  type: "order_status",
  unread,
  read_at: null,
  created_at: "2026-11-01T00:00:00Z",
  display_payload: { legacyMeta: { kind, ...(store ? { store_id: store } : {}) } },
});

describe("loadOwnerNoticeResults", () => {
  it("30초·60초 리마인더는 다른 이름 · 매장 id 없는 운영 알림은 제외 · 기기별 푸시 결과", async () => {
    const r = await loadOwnerNoticeResults(
      fakeSb({
        notification_events: [
          ev("e1", "store_order_accept_reminder_30s", "s1"),
          ev("e2", "store_order_accept_reminder_60s", "s1", false),
          ev("e3", "admin_store_decision", null),
        ],
        notification_deliveries: [
          { notification_event_id: "e1", status: "sent" },
          { notification_event_id: "e2", status: "failed" },
        ],
      }),
      { days: 30 }
    );
    const labels = r.rows.map((x) => x.label_ko);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((l) => l.endsWith("(30초)"))).toBe(true);
    expect(labels.some((l) => l.endsWith("(60초)"))).toBe(true);
    expect(r.rows.find((x) => x.kind === "admin_store_decision")).toBeUndefined();
    expect(r.rows.find((x) => x.kind === "store_order_accept_reminder_30s")).toMatchObject({ total: 1, unread: 1, push_sent: 1 });
    expect(r.rows.find((x) => x.kind === "store_order_accept_reminder_60s")).toMatchObject({ total: 1, read: 1, push_failed: 1 });
  });
});
