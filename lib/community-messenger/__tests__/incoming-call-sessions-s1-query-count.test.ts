/**
 * S-1 (docs/audit/incoming-call-poll-fanout-plan-2026-11-18.md · Owner 승인 2026-11-18) —
 * 수신 목록 1회의 `community_messenger_call_sessions` 조회 수: 6 → 4 (인증 가드 제외 시 5 → 3).
 * - 만료 울림 정리 쿼리는 reconcile 안에서 1번만
 * - 수신 목록은 live 세션 조회(limit 1)를 하지 않는다
 * - reconcile 기본 호출(다른 호출처)은 live 세션 조회를 그대로 한다
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Recorded = { table: string; eq: Record<string, unknown>; inStatus: boolean; limit: number | null };
let recorded: Recorded[] = [];

function makeQuery(table: string) {
  const rec: Recorded = { table, eq: {}, inStatus: false, limit: null };
  recorded.push(rec);
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "or", "update", "insert", "lt", "lte", "gte", "neq", "is", "not"]) {
    q[m] = () => q;
  }
  q.eq = (k: string, v: unknown) => {
    rec.eq[k] = v;
    return q;
  };
  q.in = (k: string) => {
    if (k === "status") rec.inStatus = true;
    return q;
  };
  q.limit = (n: number) => {
    rec.limit = n;
    return q;
  };
  const res = { data: [], error: null };
  q.maybeSingle = async () => ({ data: null, error: null });
  q.single = async () => ({ data: null, error: null });
  q.then = (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad);
  return q;
}

const fakeSb = { from: (t: string) => makeQuery(t), rpc: async () => ({ data: null, error: null }) };

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => fakeSb),
}));
vi.mock("@/lib/community-messenger/messenger-call-admin-policy", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, getMessengerCallAdminPolicyCached: vi.fn(async () => ({})) };
});

import {
  listIncomingCommunityMessengerCallSessionsResult,
  reconcileUserLiveCallSessions,
} from "@/lib/community-messenger/service";

const UID = "11111111-1111-1111-1111-111111111111";
const callSessionQueries = () => recorded.filter((r) => r.table === "community_messenger_call_sessions");
const isStaleRingingSweep = (r: Recorded) => r.eq.status === "ringing" && r.eq.recipient_user_id == null;
const isLiveLookup = (r: Recorded) => r.inStatus && r.limit === 1;

beforeEach(() => {
  recorded = [];
});

describe("S-1 수신 목록 조회 수", () => {
  it("directOnly 1회 = call_sessions 3건 (만료 울림 정리 1 · reconcile 1 · 수신 목록 1)", async () => {
    const result = await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true });
    expect(result).toEqual({ ok: true, sessions: [] });
    const qs = callSessionQueries();
    expect(qs).toHaveLength(3);
    expect(qs.filter(isStaleRingingSweep)).toHaveLength(1);
    expect(qs.filter(isLiveLookup)).toHaveLength(0);
    expect(qs.filter((r) => r.eq.recipient_user_id === UID && r.eq.status === "ringing")).toHaveLength(1);
  });

  it("전체(그룹 포함) 경로도 만료 울림 정리는 1번, live 조회 없음", async () => {
    await listIncomingCommunityMessengerCallSessionsResult(UID);
    const qs = callSessionQueries();
    expect(qs.filter(isStaleRingingSweep)).toHaveLength(1);
    expect(qs.filter(isLiveLookup)).toHaveLength(0);
  });

  it("reconcile 기본 호출(다른 호출처)은 live 세션 조회를 유지한다", async () => {
    await reconcileUserLiveCallSessions(UID, "session_get");
    const qs = callSessionQueries();
    expect(qs.filter(isStaleRingingSweep)).toHaveLength(1);
    expect(qs.filter(isLiveLookup)).toHaveLength(1);
  });
});
