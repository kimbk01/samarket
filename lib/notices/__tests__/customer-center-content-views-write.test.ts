import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customerCenterContentIdFromNotificationPayload,
  recordCustomerCenterContentViewsForNotificationIds,
} from "@/lib/notices/customer-center-content-views-write";

/** 재감사 2026-11-02 M2 — 알림 읽음 → 고객센터 글 읽음 (글 → 알림 방향의 짝). */
function fakeSb(tables: Record<string, Array<Record<string, unknown>>>) {
  const upserts: Array<{ table: string; rows: unknown[]; opts: unknown }> = [];
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      upsert: async (rows: unknown[], opts: unknown) => {
        upserts.push({ table, rows, opts });
        return { error: null };
      },
      then: (res: (v: { data: unknown[]; error: null }) => unknown) =>
        res({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))), error: null }),
    };
    return q;
  };
  return { sb: { from } as never, upserts };
}

describe("customer center views from notification read", () => {
  it("reads the content key the campaign stores (content_id · appNoticeId)", () => {
    expect(customerCenterContentIdFromNotificationPayload({ content_id: "n1" })).toBe("n1");
    expect(customerCenterContentIdFromNotificationPayload({ appNoticeId: "n2" })).toBe("n2");
    expect(customerCenterContentIdFromNotificationPayload({ routeUrl: "/x" })).toBeNull();
    expect(customerCenterContentIdFromNotificationPayload(null)).toBeNull();
  });

  it("writes one view per live content the read notifications point to (own rows only, no deleted content)", async () => {
    const { sb, upserts } = fakeSb({
      notification_events: [
        { id: "e1", user_id: "u1", display_payload: { content_id: "n1" } },
        { id: "e2", user_id: "u1", display_payload: { appNoticeId: "n1" } },
        { id: "e3", user_id: "u1", display_payload: { content_id: "gone" } },
        { id: "e4", user_id: "u1", display_payload: { routeUrl: "/community/posts/p1" } },
        { id: "e5", user_id: "other", display_payload: { content_id: "n2" } },
      ],
      app_notices: [{ id: "n1" }, { id: "n2" }],
    });
    const n = await recordCustomerCenterContentViewsForNotificationIds(sb, "u1", ["e1", "e2", "e3", "e4", "e5"]);
    expect(n).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("customer_center_content_views");
    expect((upserts[0].rows as Array<{ content_id: string; user_id: string }>).map((r) => [r.content_id, r.user_id])).toEqual([
      ["n1", "u1"],
    ]);
    expect(upserts[0].opts).toEqual({ onConflict: "content_id,user_id,view_day", ignoreDuplicates: true });
  });

  it("every notification read path records the content view (single read function + tab mark-all)", () => {
    const bridge = readFileSync(join(process.cwd(), "lib/notifications/inbox-read-bridge.ts"), "utf8");
    expect(bridge.match(/recordCustomerCenterContentViewsForNotificationIds\(/g)?.length).toBe(2);
  });
});
