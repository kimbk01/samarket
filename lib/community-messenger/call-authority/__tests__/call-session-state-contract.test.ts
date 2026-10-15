import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CALL_ACCEPT_RING_DEADLINE_GRACE_MS,
  evaluateAcceptRingDeadlineGate,
  evaluateMissedTransitionGate,
} from "@/lib/community-messenger/call-authority/call-missed-deadline-authority";
import { resolveHeartbeatTimeoutEndedAtIso } from "@/lib/community-messenger/call-authority/call-heartbeat-timeout-ended-at-authority";
import { evaluateMediaConnectedEvidence } from "@/lib/community-messenger/call-authority/call-connected-authority";
import { isCallStubUniqueViolationError } from "@/lib/community-messenger/call-authority/call-chat-projection-authority";
import { isTerminalCasLossIdempotent } from "@/lib/community-messenger/server/call-session-transitions";

const root = process.cwd();
const NOW = Date.parse("2026-10-15T10:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("end/cancel CAS loss → idempotent when already terminal", () => {
  it.each(["ended", "cancelled", "rejected", "missed"])("end loser sees %s → idempotent", (s) => {
    expect(isTerminalCasLossIdempotent("end", s)).toBe(true);
    expect(isTerminalCasLossIdempotent("cancel", s)).toBe(true);
  });

  it("non-terminal fresh status stays a failure", () => {
    expect(isTerminalCasLossIdempotent("end", "active")).toBe(false);
    expect(isTerminalCasLossIdempotent("cancel", "ringing")).toBe(false);
  });

  it("other actions keep their own re-read rules", () => {
    expect(isTerminalCasLossIdempotent("accept", "ended")).toBe(false);
    expect(isTerminalCasLossIdempotent("reject", "cancelled")).toBe(false);
  });

  it("service CAS loser branch returns idempotent success (route prefetch shape)", () => {
    const service = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("isTerminalCasLossIdempotent(input.action, freshStatus)");
    expect(service).toContain("return { ok: true, session: mapped, idempotent: true };");
  });
});

describe("accept after ring deadline", () => {
  const timeoutSec = 30;

  it("before deadline → ok", () => {
    expect(
      evaluateAcceptRingDeadlineGate({ status: "ringing", startedAt: iso(-10_000), ringTimeoutSeconds: timeoutSec, nowMs: NOW }),
    ).toEqual({ ok: true });
  });

  it("past deadline but within grace → ok (push latency)", () => {
    expect(
      evaluateAcceptRingDeadlineGate({
        status: "ringing",
        startedAt: iso(-(30_000 + CALL_ACCEPT_RING_DEADLINE_GRACE_MS - 1)),
        ringTimeoutSeconds: timeoutSec,
        nowMs: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("past deadline + grace → ring_deadline_reached, and missed gate agrees (same authority)", () => {
    const startedAt = iso(-(30_000 + CALL_ACCEPT_RING_DEADLINE_GRACE_MS));
    expect(
      evaluateAcceptRingDeadlineGate({ status: "ringing", startedAt, ringTimeoutSeconds: timeoutSec, nowMs: NOW }),
    ).toEqual({ ok: false, error: "ring_deadline_reached" });
    expect(
      evaluateMissedTransitionGate({ status: "ringing", startedAt, ringTimeoutSeconds: timeoutSec, nowMs: NOW }),
    ).toEqual({ ok: true });
  });

  it("active (accept retry) is not judged by the ring deadline", () => {
    expect(
      evaluateAcceptRingDeadlineGate({ status: "active", startedAt: iso(-600_000), ringTimeoutSeconds: timeoutSec, nowMs: NOW }),
    ).toEqual({ ok: true });
  });

  it("invalid started_at never rejects", () => {
    expect(
      evaluateAcceptRingDeadlineGate({ status: "ringing", startedAt: null, ringTimeoutSeconds: timeoutSec, nowMs: NOW }),
    ).toEqual({ ok: true });
  });

  it("route maps ring_deadline_reached → 409", () => {
    const route = readFileSync(
      join(root, "app/api/community-messenger/calls/sessions/[sessionId]/route.ts"),
      "utf8",
    );
    expect(route).toContain("CALL_ACCEPT_RING_DEADLINE_REACHED_ERROR ? 409 : 400");
  });
});

describe("heartbeat_timeout ended_at derivation", () => {
  it("uses max(caller, callee) last heartbeat instead of now", () => {
    expect(
      resolveHeartbeatTimeoutEndedAtIso({
        callerLastHeartbeatAt: iso(-200_000),
        calleeLastHeartbeatAt: iso(-95_000),
        answeredAt: iso(-600_000),
        connectedAt: iso(-590_000),
        nowMs: NOW,
      }),
    ).toBe(iso(-95_000));
  });

  it("bounded below by connected_at (fallback answered_at)", () => {
    expect(
      resolveHeartbeatTimeoutEndedAtIso({
        callerLastHeartbeatAt: iso(-700_000),
        calleeLastHeartbeatAt: null,
        answeredAt: iso(-600_000),
        connectedAt: iso(-590_000),
        nowMs: NOW,
      }),
    ).toBe(iso(-590_000));
    expect(
      resolveHeartbeatTimeoutEndedAtIso({
        callerLastHeartbeatAt: iso(-700_000),
        calleeLastHeartbeatAt: null,
        answeredAt: iso(-600_000),
        nowMs: NOW,
      }),
    ).toBe(iso(-600_000));
  });

  it("bounded above by now; no heartbeat → now", () => {
    expect(
      resolveHeartbeatTimeoutEndedAtIso({
        callerLastHeartbeatAt: iso(5_000),
        calleeLastHeartbeatAt: iso(-1_000),
        answeredAt: iso(-60_000),
        nowMs: NOW,
      }),
    ).toBe(iso(0));
    expect(
      resolveHeartbeatTimeoutEndedAtIso({
        callerLastHeartbeatAt: null,
        calleeLastHeartbeatAt: "garbage",
        answeredAt: iso(-60_000),
        nowMs: NOW,
      }),
    ).toBe(iso(0));
  });

  it("service applies it only for clientEndedReason=heartbeat_timeout", () => {
    const service = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("fr === CALL_SERVER_HEARTBEAT_ENDED_REASON && isDbSession");
    expect(service).toContain("caller_last_heartbeat_at, callee_last_heartbeat_at");
  });
});

describe("media_connected evidence gate", () => {
  const base = {
    actorUserId: "callee",
    initiatorUserId: "caller",
    recipientUserId: "callee",
    evidence: "remote_user_joined",
  };

  it("active + connected_at null → stamp (either party)", () => {
    expect(evaluateMediaConnectedEvidence({ ...base, status: "active", connectedAt: null })).toEqual({
      ok: true,
      kind: "stamp",
    });
    expect(
      evaluateMediaConnectedEvidence({ ...base, actorUserId: "caller", status: "active", connectedAt: null }),
    ).toEqual({ ok: true, kind: "stamp" });
  });

  it("already stamped → idempotent", () => {
    expect(evaluateMediaConnectedEvidence({ ...base, status: "active", connectedAt: iso(-1_000) })).toEqual({
      ok: true,
      kind: "idempotent",
    });
  });

  it("ringing / terminal without connected_at → not_active (never stamps)", () => {
    expect(evaluateMediaConnectedEvidence({ ...base, status: "ringing", connectedAt: null })).toEqual({
      ok: false,
      error: "not_active",
    });
    expect(evaluateMediaConnectedEvidence({ ...base, status: "ended", connectedAt: null })).toEqual({
      ok: false,
      error: "not_active",
    });
  });

  it("rejects non-evidence and non-party", () => {
    expect(
      evaluateMediaConnectedEvidence({ ...base, evidence: "heartbeat", status: "active", connectedAt: null }),
    ).toEqual({ ok: false, error: "bad_evidence" });
    expect(
      evaluateMediaConnectedEvidence({ ...base, actorUserId: "stranger", status: "active", connectedAt: null }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});

type Call = { method: string; args: unknown[] };

function makeFakeSupabase(opts: { row: Record<string, unknown>; updateReturns: Record<string, unknown> | null; freshRow?: Record<string, unknown> }) {
  const updateChains: Call[][] = [];
  const inserts: Array<{ table: string; value: unknown }> = [];
  let selectCount = 0;
  const from = (table: string) => {
    const calls: Call[] = [];
    let isUpdate = false;
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => {
        calls.push({ method: m, args });
        return chain;
      };
    }
    chain.update = (...args: unknown[]) => {
      isUpdate = true;
      calls.push({ method: "update", args });
      updateChains.push(calls);
      return chain;
    };
    chain.insert = async (value: unknown) => {
      inserts.push({ table, value });
      return { error: null };
    };
    chain.maybeSingle = async () => {
      if (isUpdate) return { data: opts.updateReturns, error: null };
      selectCount += 1;
      return { data: selectCount === 1 ? opts.row : (opts.freshRow ?? opts.row), error: null };
    };
    return chain;
  };
  return { client: { from }, updateChains, inserts };
}

const fakeHolder: { current: ReturnType<typeof makeFakeSupabase> | null } = { current: null };

vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({
  resolveServiceSupabaseForApi: () => fakeHolder.current?.client ?? null,
}));
vi.mock("@/lib/community-messenger/service", () => ({
  getCommunityMessengerCallSessionById: async (_u: string, id: string) => ({ id }),
}));

describe("recordCommunityMessengerCallMediaConnected (mocked supabase)", () => {
  beforeEach(() => {
    fakeHolder.current = null;
  });

  const activeRow = {
    id: "s1",
    status: "active",
    initiator_user_id: "caller",
    recipient_user_id: "callee",
    connected_at: null,
  };

  it("stamps connected_at with CAS status=active AND connected_at IS NULL + evidence event", async () => {
    fakeHolder.current = makeFakeSupabase({ row: activeRow, updateReturns: { ...activeRow, connected_at: iso(0) } });
    const { recordCommunityMessengerCallMediaConnected } = await import("@/lib/community-messenger/call-media-connected");
    const r = await recordCommunityMessengerCallMediaConnected({
      userId: "callee",
      sessionId: "s1",
      evidence: "remote_user_joined",
      remoteUid: 1234,
      platform: "ios",
    });
    expect(r.ok).toBe(true);
    expect(r.idempotent).toBeUndefined();
    const chain = fakeHolder.current.updateChains[0];
    expect(chain).toBeDefined();
    expect(chain).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(chain).toContainEqual({ method: "is", args: ["connected_at", null] });
    expect(fakeHolder.current.inserts[0]).toMatchObject({
      table: "community_messenger_call_events",
      value: {
        event_type: "connected",
        payload: { source: "native_media_evidence", evidence: "remote_user_joined", stamped: true, remote_uid: "1234" },
      },
    });
  });

  it("already stamped → idempotent, no UPDATE", async () => {
    fakeHolder.current = makeFakeSupabase({ row: { ...activeRow, connected_at: iso(-5_000) }, updateReturns: null });
    const { recordCommunityMessengerCallMediaConnected } = await import("@/lib/community-messenger/call-media-connected");
    const r = await recordCommunityMessengerCallMediaConnected({ userId: "caller", sessionId: "s1", evidence: "remote_user_joined" });
    expect(r).toMatchObject({ ok: true, idempotent: true });
    expect(fakeHolder.current.updateChains).toHaveLength(0);
  });

  it("ringing → not_active, no UPDATE", async () => {
    fakeHolder.current = makeFakeSupabase({ row: { ...activeRow, status: "ringing" }, updateReturns: null });
    const { recordCommunityMessengerCallMediaConnected } = await import("@/lib/community-messenger/call-media-connected");
    const r = await recordCommunityMessengerCallMediaConnected({ userId: "callee", sessionId: "s1", evidence: "remote_user_joined" });
    expect(r).toEqual({ ok: false, error: "not_active" });
    expect(fakeHolder.current.updateChains).toHaveLength(0);
  });

  it("CAS lost to a terminal transition (no connected_at) → not_active", async () => {
    fakeHolder.current = makeFakeSupabase({
      row: activeRow,
      updateReturns: null,
      freshRow: { ...activeRow, status: "ended" },
    });
    const { recordCommunityMessengerCallMediaConnected } = await import("@/lib/community-messenger/call-media-connected");
    const r = await recordCommunityMessengerCallMediaConnected({ userId: "callee", sessionId: "s1", evidence: "remote_user_joined" });
    expect(r).toEqual({ ok: false, error: "not_active" });
    expect(fakeHolder.current.inserts).toHaveLength(0);
  });
});

describe("call stub unique violation", () => {
  it("detects RPC unique_violation and raw 23505 messages", () => {
    expect(isCallStubUniqueViolationError("unique_violation")).toBe(true);
    expect(
      isCallStubUniqueViolationError('duplicate key value violates unique constraint "cm_messages_call_stub_session_uidx"'),
    ).toBe(true);
    expect(isCallStubUniqueViolationError("participant_left")).toBe(false);
    expect(isCallStubUniqueViolationError(null)).toBe(false);
  });

  it("migration only creates the index when no duplicates exist and never deletes rows", () => {
    const mig = readFileSync(
      join(root, "supabase/migrations/20270504130000_cm_call_stub_session_unique.sql"),
      "utf8",
    );
    expect(mig).toContain("CREATE UNIQUE INDEX cm_messages_call_stub_session_uidx");
    expect(mig).toContain("HAVING count(*) > 1");
    expect(mig).toContain("RAISE NOTICE");
    expect(mig).not.toMatch(/\bDELETE\b/i);
  });
});
