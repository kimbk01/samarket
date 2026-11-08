// @vitest-environment jsdom
/**
 * D2 — 실시간 연결 끊김 이유 진단 (docs/audit/realtime-connection-drop-diagnostics-design-2026-11-09.md)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  closeCodeBucket,
  isAllowedRealtimeConnectionMetric,
  tokenBucket,
  visibilityBucket,
} from "../realtime-connection-rollup-key";
import {
  __resetRealtimeConnectionMonitorForTests,
  installRealtimeConnectionMonitor,
} from "../realtime-connection-monitor";
import { buildMonitoringRollupRows } from "../monitoring-rollup";

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: Record<string, unknown>) => `${b64u({ alg: "HS256" })}.${b64u(payload)}.sig`;
const NOW = Date.parse("2026-11-09T01:00:00Z");

describe("분류", () => {
  it("화면", () => {
    expect(visibilityBucket("hidden")).toBe("hidden");
    expect(visibilityBucket("visible")).toBe("visible");
    expect(visibilityBucket(undefined)).toBe("visible");
  });

  it("토큰: 유효·만료·anon·없음·해석 불가 — 토큰 값은 결과에 없다", () => {
    expect(tokenBucket(jwt({ role: "authenticated", exp: NOW / 1000 + 60 }), NOW)).toBe("token_ok");
    expect(tokenBucket(jwt({ role: "authenticated", exp: NOW / 1000 - 1 }), NOW)).toBe("token_expired");
    expect(tokenBucket(jwt({ role: "anon", exp: NOW / 1000 + 9e8 }), NOW)).toBe("no_token");
    expect(tokenBucket(null, NOW)).toBe("no_token");
    expect(tokenBucket("not-a-jwt", NOW)).toBe("no_token");
  });

  it("닫힘 코드", () => {
    expect(closeCodeBucket(1000)).toBe("c1000");
    expect(closeCodeBucket(1001)).toBe("c1001");
    expect(closeCodeBucket(1006)).toBe("c1006");
    expect(closeCodeBucket(4001)).toBe("c4xxx");
    expect(closeCodeBucket(1011)).toBe("other");
    expect(closeCodeBucket(undefined)).toBe("other");
  });
});

describe("허용 표(서버 재검증)", () => {
  it("허용 조합만 통과", () => {
    expect(isAllowedRealtimeConnectionMetric("heartbeat_timeout.hidden.token_expired")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("socket_close.c1006.visible.token_ok")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("socket_reopen.visible")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("heartbeat_slow.hidden")).toBe(true);
    expect(isAllowedRealtimeConnectionMetric("socket_close.c9999.visible.token_ok")).toBe(false);
    expect(isAllowedRealtimeConnectionMetric("socket_close.c1006.visible")).toBe(false);
    expect(isAllowedRealtimeConnectionMetric("anything.else")).toBe(false);
  });

  it("집계: 허용 밖 realtime.connection 은 버리고, 허용 metric 은 저장", () => {
    const rows = buildMonitoringRollupRows(
      [
        { category: "realtime.connection", metric: "socket_close.c1006.hidden.token_ok", value: 1 },
        { category: "realtime.connection", metric: "evil_1", value: 1 },
        { category: "realtime.connection", metric: "socket_reopen.visible", value: 2300 },
      ],
      [
        { category: "realtime.connection", metric: "heartbeat_timeout.hidden.token_expired", count: 40 },
        { category: "realtime.connection", metric: "evil_2", count: 9 },
      ],
    );
    expect(rows.map((r) => [r.metric, r.event_count, r.dropped_count, r.value_max])).toEqual([
      ["socket_close.c1006.hidden.token_ok", 1, 0, 1],
      ["socket_reopen.visible", 1, 0, 2300],
      ["heartbeat_timeout.hidden.token_expired", 0, 40, null],
    ]);
  });
});

type HeartbeatCb = (status: string, latency?: number) => void;
function fakeRealtime(token: unknown) {
  let hb: HeartbeatCb = () => {};
  return {
    accessTokenValue: token,
    stateChangeCallbacks: { open: [] as Array<() => void>, close: [] as Array<(e: unknown) => void>, error: [] as Array<(e: unknown) => void>, message: [] },
    onHeartbeat(cb: HeartbeatCb) {
      hb = cb;
    },
    heartbeat(status: string, latency?: number) {
      hb(status, latency);
    },
  };
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
}

describe("연결 감시", () => {
  beforeEach(() => {
    __resetRealtimeConnectionMonitorForTests();
    setVisibility("visible");
  });

  it("이상만 기록: 시간 초과·느린 응답·닫힘·오류·다시 열림. 정상 심장박동은 기록 안 함", () => {
    let now = NOW;
    const rt = fakeRealtime(jwt({ role: "authenticated", exp: NOW / 1000 + 600 }));
    const rec: Array<{ metric: string; value?: number }> = [];
    expect(installRealtimeConnectionMonitor(rt, (e) => rec.push({ metric: e.metric, value: e.value }), () => now)).toBe(true);

    rt.heartbeat("sent");
    rt.heartbeat("ok", 120);
    expect(rec).toEqual([]);

    rt.heartbeat("ok", 7_000);
    setVisibility("hidden");
    rt.heartbeat("timeout");
    rt.stateChangeCallbacks.close.forEach((cb) => cb({ code: 1000 }));
    now += 2_400;
    rt.stateChangeCallbacks.error.forEach((cb) => cb(new Error("x")));
    setVisibility("visible");
    rt.stateChangeCallbacks.open.forEach((cb) => cb());
    rt.stateChangeCallbacks.open.forEach((cb) => cb()); // 닫힘 없이 열림은 기록 안 함

    expect(rec).toEqual([
      { metric: "heartbeat_slow.visible", value: 7000 },
      { metric: "heartbeat_timeout.hidden.token_ok", value: undefined },
      { metric: "socket_close.c1000.hidden.token_ok", value: undefined },
      { metric: "socket_error.hidden.token_ok", value: undefined },
      { metric: "socket_reopen.visible", value: 2400 },
    ]);
    for (const r of rec) expect(isAllowedRealtimeConnectionMetric(r.metric)).toBe(true);
  });

  it("숨김 중 토큰 만료 상태를 구분한다", () => {
    const rt = fakeRealtime(jwt({ role: "authenticated", exp: NOW / 1000 - 30 }));
    const rec: string[] = [];
    installRealtimeConnectionMonitor(rt, (e) => rec.push(e.metric), () => NOW);
    setVisibility("hidden");
    rt.stateChangeCallbacks.close.forEach((cb) => cb({ code: 1006 }));
    expect(rec).toEqual(["socket_close.c1006.hidden.token_expired"]);
  });

  it("기록 함수가 예외를 던져도 콜백은 정상 반환(연결 처리에 번지지 않음)", () => {
    const rt = fakeRealtime(null);
    installRealtimeConnectionMonitor(rt, () => {
      throw new Error("boom");
    });
    expect(() => rt.heartbeat("timeout")).not.toThrow();
    expect(() => rt.stateChangeCallbacks.close.forEach((cb) => cb({ code: 1006 }))).not.toThrow();
    expect(() => rt.stateChangeCallbacks.error.forEach((cb) => cb(null))).not.toThrow();
    expect(() => rt.stateChangeCallbacks.open.forEach((cb) => cb())).not.toThrow();
  });

  it("같은 클라이언트에는 1회만 설치, 형식이 다르면 설치하지 않음", () => {
    const rt = fakeRealtime(null);
    expect(installRealtimeConnectionMonitor(rt, () => {})).toBe(true);
    expect(installRealtimeConnectionMonitor(rt, () => {})).toBe(false);
    expect(rt.stateChangeCallbacks.close).toHaveLength(1);
    __resetRealtimeConnectionMonitorForTests();
    expect(installRealtimeConnectionMonitor({}, () => {})).toBe(false);
    expect(installRealtimeConnectionMonitor(null, () => {})).toBe(false);
  });
});

describe("onHeartbeat 단일 사용처", () => {
  it("저장소 전체에서 realtime.onHeartbeat 를 설정하는 곳은 D2 감시 모듈 1곳뿐(덮어쓰기 방지)", () => {
    const root = path.resolve(__dirname, "../../../..");
    const dirs = ["app", "components", "contexts", "hooks", "lib", "services", "repositories", "types"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const n of entries) {
        if (n === "node_modules" || n === "__tests__" || n.startsWith(".")) continue;
        const p = path.join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) && /\.onHeartbeat\(/.test(readFileSync(p, "utf8"))) {
          hits.push(path.relative(root, p));
        }
      }
    };
    for (const d of dirs) walk(path.join(root, d));
    expect(hits).toEqual(["lib/community-messenger/monitoring/realtime-connection-monitor.ts"]);
  });
});
