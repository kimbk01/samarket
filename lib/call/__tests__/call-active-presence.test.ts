import { describe, expect, it } from "vitest";
import {
  CALL_ACTIVE_PRESENCE_FRESH_MS,
  canEndActiveCallForPresenceStale,
  evaluateActiveCallPresence,
} from "@/lib/call/call-active-presence";
import { CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS } from "@/lib/call/call-server-heartbeat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

function isoAgo(now: number, ms: number): string {
  return new Date(now - ms).toISOString();
}

describe("evaluateActiveCallPresence SSOT", () => {
  const now = Date.now();
  const answered = isoAgo(now, CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS + 60_000);

  // T1
  it("T1 both fresh → LIVE; reconcile/heartbeat end NO", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, 5_000),
      callee_last_heartbeat_at: isoAgo(now, 5_000),
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("LIVE");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  // T2 — 09-01 pattern
  it("T2 caller stale + callee fresh → LIVE; end NO", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
      callee_last_heartbeat_at: isoAgo(now, 5_000),
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("LIVE");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  // T3
  it("T3 caller fresh + callee stale → LIVE; end NO", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, 5_000),
      callee_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("LIVE");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  // T4
  it("T4 both stale → STALE; cleanup allowed", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
      callee_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 40_000),
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("STALE");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(true);
  });

  // T5
  it("T5 both null → UNKNOWN; not dead", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: null,
      callee_last_heartbeat_at: null,
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("UNKNOWN");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("T5 one null + other stale → UNKNOWN", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
      callee_last_heartbeat_at: null,
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("UNKNOWN");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  // T10 — 09-01 regression: early caller freeze + continuous callee + >10m
  it("T10 09-01 regression: caller early freeze + callee fresh + elapsed >10m → LIVE", () => {
    const answeredAt = isoAgo(now, 11 * 60_000);
    const row = {
      status: "active",
      answered_at: answeredAt,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, 10 * 60_000),
      callee_last_heartbeat_at: isoAgo(now, 2_000),
    };
    expect(evaluateActiveCallPresence(row, now)).toBe("LIVE");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });
});

describe("connected poll / reason contracts (T6–T9 source)", () => {
  // T6
  it("T6 callV4 poll URL has no reconcile=1", () => {
    const api = readFileSync(join(ROOT, "lib/community-messenger/call-v4/call-v4-api.ts"), "utf8");
    const fn = api.slice(api.indexOf("export async function callV4FetchSessionForCallerPoll"));
    const body = fn.slice(0, fn.indexOf("export async function callV4CreateSession"));
    expect(body).not.toContain("reconcile=1");
  });

  it("T6 callV3 poll URL has no reconcile=1", () => {
    const api = readFileSync(join(ROOT, "lib/community-messenger/call-v3/call-v3-api.ts"), "utf8");
    expect(api).not.toMatch(/FetchSessionForCallerPoll[\s\S]*reconcile=1/);
    expect(api).not.toContain("reconcile=1");
  });

  // T7 — connected poll path cannot request reconcile mutation (route still gates on ?reconcile=1)
  it("T7 session GET mutates only when reconcile=1; connected poll omits it", () => {
    const route = readFileSync(
      join(ROOT, "app/api/community-messenger/calls/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    expect(route).toContain('searchParams.get("reconcile") === "1"');
    expect(route).toContain("reconcileUserLiveCallSessions");
    const pollV4 = readFileSync(join(ROOT, "lib/community-messenger/call-v4/call-v4-api.ts"), "utf8");
    const pollFn = pollV4.slice(pollV4.indexOf("export async function callV4FetchSessionForCallerPoll"));
    expect(pollFn.slice(0, pollFn.indexOf("export async function callV4CreateSession"))).not.toContain(
      "reconcile=1",
    );
  });

  // T8
  it("T8 stale-active reconcile writer uses reconcile_stale_active", () => {
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain('status === "ringing" ? "reconcile_stale_ringing" : "reconcile_stale_active"');
    expect(service).toContain("canEndActiveCallForPresenceStale");
  });

  // T9
  it("T9 heartbeat cleanup writer uses heartbeat_timeout", () => {
    const hb = readFileSync(join(ROOT, "lib/call/call-server-heartbeat.ts"), "utf8");
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    expect(hb).toContain('CALL_SERVER_HEARTBEAT_ENDED_REASON = "heartbeat_timeout"');
    expect(cleanup).toContain("CALL_SERVER_HEARTBEAT_ENDED_REASON");
    expect(cleanup).toContain("canEndActiveCallForPresenceStale");
  });
});
