/**
 * D4 매시 이상 감시 — 운영 실측(11-19~11-26)으로 기준값을 재현 시험한다.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/structural-analysis-and-design-2026-11-26.md §5 D4
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  HOT_RESOURCE_ROUTES,
  anomalyDedupeKey,
  evaluateHotResources,
  evaluateRealtimeRetryStorms,
  previousHourWindow,
} from "@/lib/perf/hourly-anomaly-watch";
import { loadHotResourceRows, runHourlyAnomalyWatch } from "@/lib/perf/hourly-anomaly-watch.server";

const rt = (platform: string, retries: number, ok: number) => [
  { platform, metric: "channel_subscribe.notifications.timed_out.retry", event_count: Math.ceil(retries / 2) },
  { platform, metric: "channel_subscribe.room_bundle.closed.retry", event_count: Math.floor(retries / 2) },
  { platform, metric: "channel_subscribe.friend_requests.subscribed.initial", event_count: ok },
];

describe("실시간 재시도 폭주 — 운영 실측 재현", () => {
  it("11-26 10시 iOS 재시도 681·성공 0 → 경보", () => {
    expect(evaluateRealtimeRetryStorms(rt("ios", 681, 0))).toEqual([
      { kind: "realtime_retry_storm", platform: "ios", retries: 681, subscribed: 0 },
    ]);
  });
  it("11-23 06시 iOS 594·성공 48 → 경보", () => {
    expect(evaluateRealtimeRetryStorms(rt("ios", 594, 48))).toHaveLength(1);
  });
  it("평상시 최대(11-23 07 iOS 128 · 11-22 16 Android 101/25 · 11-20 13 iOS 73/112) → 경보 없음", () => {
    expect(evaluateRealtimeRetryStorms([...rt("ios", 128, 0), ...rt("android", 101, 25)])).toEqual([]);
    expect(evaluateRealtimeRetryStorms(rt("ios", 73, 112))).toEqual([]);
  });
  it("재시도가 많아도 성공이 충분하면(비율 3배 미만) 경보 없음", () => {
    expect(evaluateRealtimeRetryStorms(rt("android", 240, 100))).toEqual([]);
  });
});

describe("한 방 몰림", () => {
  it("11-26 방 1개 시간당 약 330 → 경보, 평상시 하루 1위 방(하루 396 = 시간당 수십) → 없음", () => {
    const r = evaluateHotResources([
      { path: "/api/community-messenger/rooms/0bbd2940/messages", requests: 326 },
      { path: "/api/community-messenger/rooms/aaaa/messages", requests: 60 },
    ]);
    expect(r).toEqual([{ kind: "hot_resource", path: "/api/community-messenger/rooms/0bbd2940/messages", requests: 326 }]);
  });
  it("통화 세션 조회는 감시 대상이 아니다(통화 규정 — 폴링 유지 결정)", () => {
    expect(HOT_RESOURCE_ROUTES.some((r) => r.includes("calls"))).toBe(false);
  });
});

describe("창·중복 알림", () => {
  it("직전 완결 1시간", () => {
    const w = previousHourWindow(Date.parse("2026-11-26T02:07:00Z"));
    expect(new Date(w.start).toISOString()).toBe("2026-11-26T01:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-11-26T02:00:00.000Z");
  });
  it("같은 대상은 PHT 날짜별 1건", () => {
    const a = { kind: "realtime_retry_storm" as const, platform: "ios", retries: 600, subscribed: 0 };
    expect(anomalyDedupeKey(a, Date.parse("2026-11-26T01:07:00Z"))).toBe(
      anomalyDedupeKey(a, Date.parse("2026-11-26T04:07:00Z")),
    );
    expect(anomalyDedupeKey(a, Date.parse("2026-11-26T01:07:00Z"))).toBe("hourly_anomaly:rt_retry:ios:2026-11-26");
  });
});

describe("Vercel 한 방 조회", () => {
  it("토큰 없음 → no_token(조회 안 함)", async () => {
    const f = vi.fn();
    const r = await loadHotResourceRows({ start: 0, end: 1 }, { env: {} as NodeJS.ProcessEnv, fetchImpl: f as never });
    expect(r).toEqual({ check: "no_token", rows: [] });
    expect(f).not.toHaveBeenCalled();
  });
  it("토큰 있음 → request_path 별 합", async () => {
    let sent: Record<string, unknown> = {};
    const f = (async (_u: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          result: {
            data: [
              { request_path: "/api/community-messenger/rooms/x/messages", vercel_request_count_sum: 200 },
              { request_path: "/api/community-messenger/rooms/x/messages", vercel_request_count_sum: 30 },
            ],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await loadHotResourceRows(
      { start: Date.parse("2026-11-26T01:00:00Z"), end: Date.parse("2026-11-26T02:00:00Z") },
      { env: { VERCEL_OBSERVABILITY_TOKEN: "t" } as unknown as NodeJS.ProcessEnv, fetchImpl: f },
    );
    expect(r).toEqual({ check: "ok", rows: [{ path: "/api/community-messenger/rooms/x/messages", requests: 230 }] });
    expect(sent.groupBy).toEqual(["request_path"]);
    expect(String(sent.filter)).toContain("route eq '/api/community-messenger/rooms/[roomId]/messages'");
  });
  it("조회 실패 → failed (감시 전체는 계속)", async () => {
    const f = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const r = await loadHotResourceRows({ start: 0, end: 1 }, {
      env: { VERCEL_OBSERVABILITY_TOKEN: "t" } as unknown as NodeJS.ProcessEnv,
      fetchImpl: f,
    });
    expect(r.check).toBe("failed");
  });
});

describe("runHourlyAnomalyWatch", () => {
  function fakeSb(rows: unknown[]) {
    const calls: Array<[string, unknown[]]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) {
      chain[m] = (...a: unknown[]) => {
        calls.push([m, a]);
        return chain;
      };
    }
    chain.limit = () => Promise.resolve({ data: rows, error: null });
    return { sb: { from: (t: string) => (calls.push(["from", [t]]), chain) } as never, calls };
  }
  it("이상 없음 → 읽기 1번, 알림 0", async () => {
    const { sb, calls } = fakeSb(rt("ios", 50, 40));
    const notify = vi.fn();
    const r = await runHourlyAnomalyWatch(sb, Date.parse("2026-11-26T02:07:00Z"), {
      loadHot: async () => ({ check: "no_token", rows: [] }),
      notify: notify as never,
    });
    expect(r.anomalies).toEqual([]);
    expect(r.hotResourceCheck).toBe("no_token");
    expect(notify).not.toHaveBeenCalled();
    expect(calls.filter(([m]) => m === "from")).toEqual([["from", ["cm_monitoring_rollup_hourly"]]]);
    expect(calls).toContainEqual(["eq", ["bucket_hour", "2026-11-26T01:00:00.000Z"]]);
  });
  it("11-26 재현 → 알림 2건(실시간 폭주 + 한 방 몰림), 각자 다른 dedupe", async () => {
    const { sb } = fakeSb(rt("ios", 681, 0));
    const notify = vi.fn(async () => ({ ok: true }));
    const r = await runHourlyAnomalyWatch(sb, Date.parse("2026-11-26T03:07:00Z"), {
      loadHot: async () => ({ check: "ok", rows: [{ path: "/api/community-messenger/rooms/0bbd/messages", requests: 326 }] }),
      notify: notify as never,
    });
    expect(r.notified).toBe(2);
    const keys = notify.mock.calls.map((c) => (c as unknown as [unknown, { dedupeKey: string }])[1].dedupeKey);
    expect(new Set(keys).size).toBe(2);
  });
});

describe("예약 계약", () => {
  it("vercel.json 매시 7분", () => {
    const crons = (JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    }).crons;
    expect(crons).toContainEqual({ path: "/api/cron/hourly-anomaly-watch", schedule: "7 * * * *" });
  });
});
