/**
 * J8 explainability — fill eligible inbox rows AFTER chat/owner exclude.
 * Page window must not precede Member Bell A eligibility.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyInboxEligibilityFilters,
  fillEligibleInboxRowsUntilLimit,
  filterMappedInboxEventRows,
  INBOX_ELIGIBLE_FILL_SCAN_MAX,
  type InboxNotificationRow,
} from "@/lib/notifications/inbox-events-merge";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(
  partial: Partial<InboxNotificationRow> &
    Pick<InboxNotificationRow, "id" | "notification_type" | "created_at">
): InboxNotificationRow {
  return {
    title: partial.title ?? partial.id,
    body: null,
    link_url: "/notifications",
    is_read: false,
    dedupe_key: partial.dedupe_key ?? `dk:${partial.id}`,
    push_kind: partial.push_kind ?? null,
    meta: partial.meta ?? {},
    ...partial,
  };
}

function chatHeavyThenA(aCount: number, chatCount: number): InboxNotificationRow[] {
  const out: InboxNotificationRow[] = [];
  for (let i = 0; i < chatCount; i++) {
    out.push(
      row({
        id: `chat-${i}`,
        notification_type: "chat",
        push_kind: "chat",
        created_at: `2026-08-12T12:${String(59 - (i % 60)).padStart(2, "0")}:00.000Z`,
        dedupe_key: `chat:${i}`,
      })
    );
  }
  for (let i = 0; i < aCount; i++) {
    out.push(
      row({
        id: `a-${i}`,
        notification_type: "admin_notice",
        push_kind: "system",
        created_at: `2026-08-11T10:${String(59 - (i % 60)).padStart(2, "0")}:00.000Z`,
        dedupe_key: `a:${i}`,
        bell_presentation_type: "admin_notice",
      })
    );
  }
  return out;
}

describe("j8-unread-fill-after-exclude", () => {
  it("fills A rows after chat-heavy recent window (not raw N cut)", () => {
    // Simulate: first batch 70 chat + 0 A; second batch 10 A.
    const batch1 = chatHeavyThenA(0, 70);
    const batch2 = chatHeavyThenA(10, 0);
    const filled = fillEligibleInboxRowsUntilLimit(
      [batch1, batch2],
      { fetchUpper: 20, excludeChatMessageList: true, excludeOwnerList: true },
      20
    );
    expect(filled).toHaveLength(10);
    expect(filled.every((r) => r.notification_type === "admin_notice")).toBe(true);
    expect(filled.map((r) => r.id)).toEqual([
      "a-0",
      "a-1",
      "a-2",
      "a-3",
      "a-4",
      "a-5",
      "a-6",
      "a-7",
      "a-8",
      "a-9",
    ]);
  });
});

describe("j8-unread-total-visible-identity", () => {
  it("eligible unread visible count can match A when filled across batches", () => {
    const aUnread = 13;
    const batches = [
      chatHeavyThenA(0, 80),
      chatHeavyThenA(0, 80),
      chatHeavyThenA(aUnread, 0),
    ];
    const filled = fillEligibleInboxRowsUntilLimit(
      batches,
      { fetchUpper: aUnread, excludeChatMessageList: true, excludeOwnerList: true },
      aUnread
    );
    expect(filled).toHaveLength(aUnread);
    expect(filled.every((r) => r.is_read !== true)).toBe(true);
  });
});

describe("j8-chat-heavy-recent-window", () => {
  it("limit=20 with 70 chat + 10 A still shows 10 A", () => {
    const raw = chatHeavyThenA(10, 70);
    // Old bug: filter after single window of 20 would yield 0.
    const naiveWindow = filterMappedInboxEventRows(raw.slice(0, 20), {
      fetchUpper: 20,
      excludeChatMessageList: true,
      excludeOwnerList: true,
    });
    expect(naiveWindow).toHaveLength(0);

    const filled = fillEligibleInboxRowsUntilLimit(
      [raw.slice(0, 80)],
      { fetchUpper: 20, excludeChatMessageList: true, excludeOwnerList: true },
      20
    );
    expect(filled).toHaveLength(10);
  });
});

describe("j8-owner-heavy-recent-window", () => {
  it("owner commerce heavy recent does not wipe A rows after exclude", () => {
    const ownerHeavy: InboxNotificationRow[] = [];
    for (let i = 0; i < 40; i++) {
      ownerHeavy.push(
        row({
          id: `own-${i}`,
          notification_type: "commerce",
          push_kind: "delivery",
          created_at: `2026-08-12T11:00:${String(59 - (i % 60)).padStart(2, "0")}.000Z`,
          dedupe_key: `own:${i}`,
          meta: { kind: "store_order_created", store_id: "store-a", order_id: `o-${i}` },
        })
      );
    }
    const aRows = chatHeavyThenA(8, 0);
    const filled = fillEligibleInboxRowsUntilLimit(
      [ownerHeavy, aRows],
      { fetchUpper: 20, excludeChatMessageList: true, excludeOwnerList: true },
      20
    );
    expect(filled).toHaveLength(8);
    expect(filled.every((r) => r.id.startsWith("a-"))).toBe(true);
  });
});

describe("j8-dedupe-fill", () => {
  it("dedupe first-win across fill batches", () => {
    const first = [
      row({
        id: "a-new",
        notification_type: "admin_notice",
        created_at: "2026-08-12T12:00:00.000Z",
        dedupe_key: "same",
        push_kind: "system",
      }),
    ];
    const second = [
      row({
        id: "a-old",
        notification_type: "admin_notice",
        created_at: "2026-08-11T12:00:00.000Z",
        dedupe_key: "same",
        push_kind: "system",
      }),
      row({
        id: "a-2",
        notification_type: "admin_notice",
        created_at: "2026-08-10T12:00:00.000Z",
        dedupe_key: "other",
        push_kind: "system",
      }),
    ];
    const filled = fillEligibleInboxRowsUntilLimit(
      [first, second],
      { fetchUpper: 10, excludeChatMessageList: true, excludeOwnerList: true },
      10
    );
    expect(filled.map((r) => r.id)).toEqual(["a-new", "a-2"]);
  });
});

describe("j8-pagination-next-page", () => {
  it("page1=20 page2=15 when A unread=35", () => {
    const all = chatHeavyThenA(35, 0);
    const pageSize = 20;
    const page1 = fillEligibleInboxRowsUntilLimit(
      [all],
      { fetchUpper: pageSize + 1, excludeChatMessageList: true, excludeOwnerList: true },
      pageSize + 1
    );
    expect(page1).toHaveLength(21); // has_more probe
    const visible1 = page1.slice(0, pageSize);
    expect(visible1).toHaveLength(20);

    const remaining = all.filter((r) => !visible1.some((v) => v.id === r.id));
    const page2 = fillEligibleInboxRowsUntilLimit(
      [remaining],
      { fetchUpper: pageSize, excludeChatMessageList: true, excludeOwnerList: true },
      pageSize
    );
    expect(page2).toHaveLength(15);
    expect(visible1.length + page2.length).toBe(35);
  });
});

describe("j8-loader-fill-contract-static", () => {
  it("fetchNotificationEventsForInbox uses eligible fill scan (not single raw limit cut)", () => {
    const src = read("lib/notifications/inbox-events-merge.ts");
    expect(src).toContain("fillEligibleInboxRowsUntilLimit");
    expect(src).toContain("INBOX_ELIGIBLE_FILL_SCAN_MAX");
    expect(src).toContain("applyInboxEligibilityFilters");
    expect(src).toMatch(/while\s*\(\s*filled\.length\s*<\s*target/);
    expect(src).toContain(".range(offset, offset + batchSize - 1)");
    expect(INBOX_ELIGIBLE_FILL_SCAN_MAX).toBe(2000);
    // Must not regress to single .limit(fetchUpper) as the only fetch.
    expect(src).not.toMatch(
      /from\("notification_events"\)[\s\S]{0,280}\.limit\(\s*Math\.max\(\s*opts\.fetchUpper/
    );
  });

  it("applyInboxEligibilityFilters does not page-window before exclude", () => {
    const rows = chatHeavyThenA(5, 10);
    const eligible = applyInboxEligibilityFilters(rows, {
      fetchUpper: 3,
      excludeChatMessageList: true,
      excludeOwnerList: true,
    });
    // No truncate inside apply — all 5 A rows survive exclude.
    expect(eligible).toHaveLength(5);
  });
});
