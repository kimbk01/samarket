/** M3 — 최근 본 상품 기록·정리·목록 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listTradeRecentViews, recordTradeRecentView } from "@/lib/mypage/trade-recent-views.server";

type Op = { op: string; args: unknown[] };

function mockSb(handlers: { overflow?: string[]; viewsError?: boolean }) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    let mode = "";
    const chain = (name: string) => (...args: unknown[]) => {
      ops.push({ op: `${table}.${name}`, args });
      return q;
    };
    q.upsert = (...args: unknown[]) => {
      ops.push({ op: `${table}.upsert`, args });
      return Promise.resolve({ error: null });
    };
    q.delete = (...args: unknown[]) => {
      mode = "delete";
      ops.push({ op: `${table}.delete`, args });
      return q;
    };
    q.select = (...args: unknown[]) => {
      mode = "select";
      ops.push({ op: `${table}.select`, args });
      return q;
    };
    for (const n of ["eq", "lt", "in", "order"]) q[n] = chain(n);
    q.range = (...args: unknown[]) => {
      ops.push({ op: `${table}.range`, args });
      return Promise.resolve({ data: (handlers.overflow ?? []).map((post_id) => ({ post_id })), error: null });
    };
    q.limit = (...args: unknown[]) => {
      ops.push({ op: `${table}.limit`, args });
      return Promise.resolve(handlers.viewsError ? { data: null, error: { message: "x" } } : { data: [], error: null });
    };
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: mode ? null : null });
    return q;
  };
  return { sb: { from } as never, ops };
}

describe("trade recent views", () => {
  it("기록: upsert 후 90일 지난 행·100개 초과분 삭제", async () => {
    const { sb, ops } = mockSb({ overflow: ["p-old"] });
    await recordTradeRecentView(sb, "u1", "p1");
    const names = ops.map((o) => o.op);
    expect(names[0]).toBe("trade_post_recent_views.upsert");
    expect(names).toContain("trade_post_recent_views.lt");
    expect(ops.find((o) => o.op === "trade_post_recent_views.range")?.args).toEqual([100, 299]);
    expect(ops.filter((o) => o.op === "trade_post_recent_views.in").at(-1)?.args).toEqual(["post_id", ["p-old"]]);
  });

  it("목록 조회 실패는 빈 목록이 아니라 오류", async () => {
    const { sb } = mockSb({ viewsError: true });
    expect(await listTradeRecentViews(sb, "u1")).toEqual({ ok: false });
  });
});
