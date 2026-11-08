/**
 * U1 — 클라이언트 배치 → DB 시간 단위 집계 행. ID·자유 라벨은 저장하지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  buildMonitoringRollupRows,
  MONITORING_ROLLUP_MAX_ROWS,
  normalizeMonitoringRollupPlatform,
} from "../monitoring-rollup";

describe("buildMonitoringRollupRows", () => {
  it("같은 종류·결과는 1행으로 합치고 값 개수·합·최댓값을 센다", () => {
    const rows = buildMonitoringRollupRows([
      { category: "chat.room_load", metric: "bootstrap_fetch", value: 100, labels: { roomIdSuffix: "abcd1234" } },
      { category: "chat.room_load", metric: "bootstrap_fetch", value: 300 },
      { category: "chat.room_load", metric: "bootstrap_fetch" },
    ]);
    expect(rows).toEqual([
      {
        category: "chat.room_load",
        metric: "bootstrap_fetch",
        outcome: "",
        event_count: 3,
        value_count: 2,
        value_sum: 400,
        value_max: 300,
        dropped_count: 0,
      },
    ]);
  });

  it("outcome 은 ok/error 만 키로 남기고 나머지 라벨(방·세션 ID 끝자리 등)은 행에 없다", () => {
    const rows = buildMonitoringRollupRows([
      { category: "realtime.subscription", metric: "channel_subscribe", value: 1, labels: { outcome: "ok", scope: "x" } },
      { category: "realtime.subscription", metric: "channel_subscribe", value: 1, labels: { outcome: "error" } },
      { category: "realtime.subscription", metric: "channel_subscribe", value: 1, labels: { outcome: "weird" } },
    ]);
    expect(rows.map((r) => r.outcome).sort()).toEqual(["", "error", "ok"]);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(
        ["category", "dropped_count", "event_count", "metric", "outcome", "value_count", "value_max", "value_sum"].sort(),
      );
    }
  });

  it("버린 수를 종류별로 더하고, 형식이 틀린 키·0 이하 개수는 버린다", () => {
    const rows = buildMonitoringRollupRows(
      [],
      [
        { category: "chat.room_load", metric: "bootstrap_fetch", count: 5 },
        { category: "chat.room_load", metric: "bootstrap_fetch", count: 2.9 },
        { category: "Bad Category!", metric: "x", count: 3 },
        { category: "chat", metric: "y", count: -1 },
      ],
    );
    expect(rows).toEqual([
      expect.objectContaining({ category: "chat.room_load", metric: "bootstrap_fetch", dropped_count: 7, event_count: 0 }),
    ]);
  });

  it("숫자가 아닌 값·무한대는 값 통계에서 뺀다", () => {
    const [row] = buildMonitoringRollupRows([
      { category: "c", metric: "m", value: Number.POSITIVE_INFINITY },
      { category: "c", metric: "m", value: "12" },
      { category: "c", metric: "m", value: 7 },
    ]);
    expect(row).toMatchObject({ event_count: 3, value_count: 1, value_sum: 7, value_max: 7 });
  });

  it("행은 최대 128개", () => {
    const events = Array.from({ length: 300 }, (_, i) => ({ category: "c", metric: `m${i}`, value: 1 }));
    expect(buildMonitoringRollupRows(events)).toHaveLength(MONITORING_ROLLUP_MAX_ROWS);
  });
});

describe("normalizeMonitoringRollupPlatform", () => {
  it("web/ios/android 외에는 unknown", () => {
    expect(normalizeMonitoringRollupPlatform("ios")).toBe("ios");
    expect(normalizeMonitoringRollupPlatform("windows")).toBe("unknown");
    expect(normalizeMonitoringRollupPlatform(undefined)).toBe("unknown");
  });
});
