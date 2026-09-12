import { describe, expect, it } from "vitest";
import {
  CALL_ACTIVE_PRESENCE_FRESH_MS,
  CALL_PRESENCE_SHADOW_LEASE_TTL_MS,
  canEndActiveCallForPresenceStale,
  evaluateActiveCallPresence,
  evaluateActiveCallPresenceDetail,
  shadowPresenceLeaseUntilIso,
} from "@/lib/call/call-active-presence";
import { CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS } from "@/lib/call/call-server-heartbeat";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

function isoAgo(now: number, ms: number): string {
  return new Date(now - ms).toISOString();
}

function isoAhead(now: number, ms: number): string {
  return new Date(now + ms).toISOString();
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
  it("T8 stale-active reconcile writer uses reconcile_stale_active; ringing uses missed", () => {
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain('status === "ringing" ? "reconcile_stale_ringing" : "reconcile_stale_active"');
    expect(service).toContain('status === "ringing" ? "missed" : "end"');
    expect(service).toContain("canEndActiveCallForPresenceStale");
  });

  // T9
  it("T9 heartbeat cleanup writer uses heartbeat_timeout via Presence both-stale", () => {
    const hb = readFileSync(join(ROOT, "lib/call/call-server-heartbeat.ts"), "utf8");
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    expect(hb).toContain('CALL_SERVER_HEARTBEAT_ENDED_REASON = "heartbeat_timeout"');
    expect(cleanup).toContain("CALL_SERVER_HEARTBEAT_ENDED_REASON");
    expect(cleanup).toContain("canEndActiveCallForPresenceStale");
    expect(cleanup).toContain("updateCommunityMessengerCallSession");
  });
});

describe("presence shadow lease SSOT (CUT1)", () => {
  const now = Date.now();
  const answered = isoAgo(now, CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS + 60_000);
  const freshHb = {
    caller_last_heartbeat_at: isoAgo(now, 5_000),
    callee_last_heartbeat_at: isoAgo(now, 5_000),
  };
  const bothHbStale = {
    caller_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
    callee_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 40_000),
  };

  it("T1 both leases valid → lease shadow LIVE; Production still legacy_hb", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAhead(now, 60_000),
      callee_presence_lease_until: isoAhead(now, 60_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("LIVE");
    expect(detail.leaseTerminationEligible).toBe(false);
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(detail.leaseEvaluation).toBe("shadow");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("T2 caller lease expired + callee valid → lease LIVE; one-side survive", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAgo(now, 1_000),
      callee_presence_lease_until: isoAhead(now, 60_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("LIVE");
    expect(detail.leaseTerminationEligible).toBe(false);
    expect(detail.callerLease).toBe("EXPIRED");
    expect(detail.calleeLease).toBe("VALID");
    expect(detail.productionAuthority).toBe("legacy_hb");
  });

  it("T3 caller valid + callee lease expired → lease LIVE", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAhead(now, 60_000),
      callee_presence_lease_until: isoAgo(now, 1_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("LIVE");
    expect(detail.leaseTerminationEligible).toBe(false);
  });

  it("T4 both leases expired → leaseTerminationEligible true (shadow)", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAgo(now, 1_000),
      callee_presence_lease_until: isoAgo(now, 2_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("STALE");
    expect(detail.leaseTerminationEligible).toBe(true);
    expect(detail.productionAuthority).toBe("legacy_hb");
    // fresh HB → Production must NOT end
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("T5 terminal session → lease UNKNOWN; not eligible", () => {
    const row = {
      status: "ended",
      answered_at: answered,
      ended_at: isoAgo(now, 1_000),
      ...freshHb,
      caller_presence_lease_until: isoAhead(now, 60_000),
      callee_presence_lease_until: isoAhead(now, 60_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("UNKNOWN");
    expect(detail.leaseTerminationEligible).toBe(false);
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("T6 leases absent → lease UNKNOWN; Production still legacy", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...bothHbStale,
      caller_presence_lease_until: null,
      callee_presence_lease_until: null,
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("UNKNOWN");
    expect(detail.leaseTerminationEligible).toBe(false);
    expect(detail.callerLease).toBe("LEASE_UNKNOWN");
    expect(detail.calleeLease).toBe("LEASE_UNKNOWN");
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(true);
  });

  it("T7 one lease column only → not capability; Production legacy; one-side HB stale survives", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      caller_last_heartbeat_at: isoAgo(now, CALL_ACTIVE_PRESENCE_FRESH_MS + 30_000),
      callee_last_heartbeat_at: isoAgo(now, 5_000),
      caller_presence_lease_until: isoAhead(now, 60_000),
      callee_presence_lease_until: null,
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("UNKNOWN");
    expect(detail.leaseTerminationEligible).toBe(false);
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);
  });

  it("T8 explicit terminal authority unchanged (source)", () => {
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    expect(cleanup).toContain("updateCommunityMessengerCallSession");
    expect(cleanup).toContain("CALL_SERVER_HEARTBEAT_ENDED_REASON");
    expect(cleanup).toContain("canEndActiveCallForPresenceStale");
  });

  it("T9 shadowPresenceLeaseUntilIso is provisional TTL ahead of now", () => {
    expect(CALL_PRESENCE_SHADOW_LEASE_TTL_MS).toBe(300_000);
    const until = shadowPresenceLeaseUntilIso(now);
    expect(Date.parse(until)).toBe(now + CALL_PRESENCE_SHADOW_LEASE_TTL_MS);
    const src = readFileSync(join(ROOT, "lib/call/call-active-presence.ts"), "utf8");
    expect(src).toContain("PROVISIONAL");
    expect(src).toContain("SHADOW");
    expect(src).toContain("NOT_PRODUCTION_TERMINATION_AUTHORITY");
    expect(src).toContain("CALL_PRESENCE_SHADOW_LEASE_TTL_MS");
  });

  it("T10 delayed renew after terminal rejected (heartbeat not_live source)", () => {
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    expect(cleanup).toContain('if (row.status !== "active") return { ok: false, error: "not_live" }');
    expect(cleanup).toContain("caller_presence_lease_until");
    expect(cleanup).toContain("callee_presence_lease_until");
  });

  it("T11 legacy clients + accept seed both leases non-null → Production authority remains legacy_hb", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      // Accept seeds both leases for ALL clients including legacy
      caller_presence_lease_until: shadowPresenceLeaseUntilIso(now),
      callee_presence_lease_until: shadowPresenceLeaseUntilIso(now),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.callerLease).toBe("VALID");
    expect(detail.calleeLease).toBe("VALID");
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(detail.leaseEvaluation).toBe("shadow");
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);

    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("updatePayload.caller_presence_lease_until = shadowLeaseUntil");
    expect(service).toContain("updatePayload.callee_presence_lease_until = shadowLeaseUntil");
    expect(service).toContain("NOT client lease-capable proof");
  });

  it("T12 both provisional leases valid → lease shadow LIVE → Production still legacy_hb", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...bothHbStale,
      caller_presence_lease_until: isoAhead(now, 120_000),
      callee_presence_lease_until: isoAhead(now, 120_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leasePresence).toBe("LIVE");
    expect(detail.productionAuthority).toBe("legacy_hb");
    // Production ends via legacy HB both-stale even while lease shadow is LIVE
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(true);
  });

  it("T13 both provisional leases expired → leaseTerminationEligible → cleanup MUST NOT end via lease", () => {
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAgo(now, 5_000),
      callee_presence_lease_until: isoAgo(now, 5_000),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.leaseTerminationEligible).toBe(true);
    expect(canEndActiveCallForPresenceStale(row, now)).toBe(false);

    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    // End gate must remain legacy canEnd — never leaseTerminationEligible
    expect(cleanup).toMatch(/if \(!canEndActiveCallForPresenceStale\(presenceRow, nowMs\)\)/);
    expect(cleanup).toContain("leaseTerminationEligible MUST NOT drive end");
    expect(service).toContain("return canEndActiveCallForPresenceStale(presenceRow, nowMs)");
    expect(service).toContain("leaseTerminationEligible MUST NOT drive end");
    // No Production branch: if (detail.leaseTerminationEligible) end...
    expect(cleanup).not.toMatch(/if\s*\(\s*(?:detail\.)?leaseTerminationEligible\s*\)/);
    expect(service).not.toMatch(/if\s*\(\s*(?:detail\.)?leaseTerminationEligible\s*\)/);
  });

  it("T14 WebView HB renews lease → does NOT mark authoritative-lease-capable", () => {
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    expect(cleanup).toContain("NOT lease-capability proof");
    expect(cleanup).toContain("shadowPresenceLeaseUntilIso");
    expect(cleanup).toContain("WebView HB MUST omit");
    const row = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: shadowPresenceLeaseUntilIso(now),
      callee_presence_lease_until: shadowPresenceLeaseUntilIso(now),
    };
    const detail = evaluateActiveCallPresenceDetail(row, now);
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(detail.leaseEvaluation).toBe("shadow");
    // Detail API has no capability=true field derived from renew
    expect(detail).not.toHaveProperty("leaseCapable");
    expect(detail).not.toHaveProperty("authoritativeLeaseCapable");
  });

  it("T15 lease fields non-null → capability must NOT be inferred from non-null alone", () => {
    const src = readFileSync(join(ROOT, "lib/call/call-active-presence.ts"), "utf8");
    expect(src).toContain("NON_NULL lease columns MUST NEVER imply lease-capable");
    expect(src).toContain('productionAuthority: "legacy_hb"');
    expect(src).not.toMatch(/authorityUsed\s*=\s*["']lease["']/);
    expect(src).not.toMatch(/productionAuthority:\s*["']lease["']/);

    const bothNonNull = {
      status: "active",
      answered_at: answered,
      ended_at: null,
      ...freshHb,
      caller_presence_lease_until: isoAhead(now, 1),
      callee_presence_lease_until: isoAhead(now, 1),
    };
    const detail = evaluateActiveCallPresenceDetail(bothNonNull, now);
    expect(detail.productionAuthority).toBe("legacy_hb");
    expect(detail.leaseEvaluation).toBe("shadow");
  });

  it("Production cleanup contract: end only via canEndActiveCallForPresenceStale (source)", () => {
    const cleanup = readFileSync(join(ROOT, "lib/community-messenger/call-session-heartbeat.ts"), "utf8");
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(cleanup).toContain("canEndActiveCallForPresenceStale");
    expect(cleanup).toContain("evaluateActiveCallPresenceDetail");
    expect(cleanup).toContain("[cm-call-presence-shadow]");
    // Shadow TTL must not appear as cleanup end threshold
    expect(cleanup).not.toContain("CALL_PRESENCE_SHADOW_LEASE_TTL_MS");
    expect(service).toContain("canEndActiveCallForPresenceStale");
    expect(service).toContain("evaluateActiveCallPresenceDetail");
  });
});
