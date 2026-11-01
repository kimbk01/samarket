import { describe, expect, it } from "vitest";
import { loadOwnerUnreadByStore } from "@/lib/notifications/owner-unread-by-store";

/** 재감사 2026-11-02 S3 — 사장님 매장 종 「다른 매장 안 읽음」: 내 매장마다 · 오너 알림만 · 지운 알림 제외. */
function fakeSb(tables: Record<string, Array<Record<string, unknown>>>) {
  const from = (table: string) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let range: [number, number] | null = null;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      order: () => q,
      range: (a: number, b: number) => ((range = [a, b]), q),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return res({ data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null });
      },
    };
    return q;
  };
  return { from } as never;
}

const ev = (id: string, store: string | null, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  unread: true,
  read_at: null,
  display_payload: { legacyMeta: { kind, ...(store ? { store_id: store } : {}) }, ...extra },
});

describe("loadOwnerUnreadByStore", () => {
  it("counts unread owner notifications per owned store", async () => {
    const sb = fakeSb({
      stores: [
        { id: "s1", store_name: "가게1", owner_user_id: "u1" },
        { id: "s2", store_name: "가게2", owner_user_id: "u1" },
        { id: "sx", store_name: "남의 가게", owner_user_id: "u2" },
      ],
      notification_events: [
        ev("e1", "s1", "store_order_created"),
        ev("e2", "s1", "store_order_buyer_cancelled"),
        ev("e3", "s2", "admin_store_decision"),
        ev("e4", "s2", "store_order_owner_status"), // 구매자 종류 — 제외
        ev("e5", "s2", "store_order_created", { deleted_at: "2026-11-01T00:00:00Z" }), // 지움 — 제외
        ev("e6", "sx", "store_order_created"), // 내 매장 아님 — 제외
        { ...ev("e7", "s1", "store_order_created"), unread: false }, // 읽음 — 제외
        {
          id: "e8",
          user_id: "u1",
          unread: true,
          read_at: null,
          display_payload: { kind: "store_platform_inquiry_replied", store_id: "s2" }, // 최상위 kind·store_id
        },
      ],
    });
    expect(await loadOwnerUnreadByStore(sb, "u1")).toEqual([
      { store_id: "s1", store_name: "가게1", unread: 2 },
      { store_id: "s2", store_name: "가게2", unread: 2 },
    ]);
  });

  it("no stores → empty", async () => {
    expect(await loadOwnerUnreadByStore(fakeSb({ stores: [], notification_events: [] }), "u1")).toEqual([]);
  });
});
