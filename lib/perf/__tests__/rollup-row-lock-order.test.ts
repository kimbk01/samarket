import { describe, expect, it, vi } from "vitest";
import { sortRollupRowsForLockOrder } from "@/lib/perf/rollup-row-lock-order";
import { sendSupabaseCallRollup, type SupabaseCallRollupRow } from "@/lib/perf/supabase-call-counter";
import { buildMonitoringRollupRows } from "@/lib/community-messenger/monitoring/monitoring-rollup";

function row(category: string, metric: string, outcome = ""): SupabaseCallRollupRow {
  // outcome 은 시험용으로 아무 문자열이나 넣어 정렬 규칙을 본다

  return { category, metric, outcome: outcome as SupabaseCallRollupRow["outcome"], event_count: 1, value_count: 0, value_sum: 0, value_max: null, dropped_count: 0 };
}

const key = (r: { category: string; metric: string; outcome?: string | null }) => `${r.category}|${r.metric}|${r.outcome ?? ""}`;

describe("F1 rollup lock order — cm_monitoring_rollup_add 교착 방지", () => {
  it("입력 순서와 상관없이 같은 키 순서를 만든다", () => {
    const a = [row("server.supabase_target", "rest.profiles"), row("server.supabase_route", "api.x"), row("server.supabase_route", "api.a")];
    const b = [a[2], a[0], a[1]];
    expect(sortRollupRowsForLockOrder(a).map(key)).toEqual(sortRollupRowsForLockOrder(b).map(key));
    expect(sortRollupRowsForLockOrder(a).map(key)).toEqual([
      "server.supabase_route|api.a|",
      "server.supabase_route|api.x|",
      "server.supabase_target|rest.profiles|",
    ]);
  });

  it("DB 가 하는 소문자·outcome 정리 기준으로 비교하고 입력은 바꾸지 않는다", () => {
    const input = [row("b", "m", "weird"), row("A", "m", "ok")];
    const out = sortRollupRowsForLockOrder(input);
    expect(out.map((r) => r.category)).toEqual(["A", "b"]);
    expect(input.map((r) => r.category)).toEqual(["b", "A"]);
  });

  it("계수기 전송은 정렬 뒤 128행씩 나눠 보낸다(묶음끼리도 키 순서)", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => row("server.supabase_route", `api.r${String(129 - i).padStart(3, "0")}`));
    const bodies: Array<Array<{ metric: string }>> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      bodies.push((JSON.parse(String(init?.body)) as { p_rows: Array<{ metric: string }> }).p_rows);
      return new Response("1", { status: 200 });
    }) as unknown as typeof fetch;
    await sendSupabaseCallRollup(rows, { supabaseOrigin: "https://x.supabase.co", serviceKey: "k", fetchImpl });
    expect(bodies.map((b) => b.length)).toEqual([128, 2]);
    const all = bodies.flat().map((r) => r.metric);
    expect(all).toEqual([...all].sort());
    expect(all[0]).toBe("api.r000");
  });

  it("클라이언트 감시 집계 행도 키 순서로 나온다", () => {
    const rows = buildMonitoringRollupRows([
      { category: "zeta", metric: "m" },
      { category: "alpha", metric: "z" },
      { category: "alpha", metric: "a" },
    ] as never);
    expect(rows.map((r) => `${r.category}|${r.metric}`)).toEqual(["alpha|a", "alpha|z", "zeta|m"]);
  });
});
