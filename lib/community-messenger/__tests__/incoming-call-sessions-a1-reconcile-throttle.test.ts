/**
 * Phase A1 — 수신 목록: 연속 호출 시 두 번째부터는 call_sessions 목록 1회만.
 * 전체 reconcile(R1~R3)은 사용자당 N초에 최대 1회. L1 중복 stale 정리는 제거.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetIncomingListReconcileGateForTests } from "@/lib/community-messenger/call-incoming-list-reconcile-gate";

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

import { listIncomingCommunityMessengerCallSessionsResult } from "@/lib/community-messenger/service";

const UID = "11111111-1111-1111-1111-111111111111";
const callSessionQueries = () => recorded.filter((r) => r.table === "community_messenger_call_sessions");
const isListQuery = (r: Recorded) => r.eq.recipient_user_id === UID && r.eq.status === "ringing" && r.limit === 10;
const isReconcileScan = (r: Recorded) => r.inStatus && r.limit === 20;
const isLiveLookup = (r: Recorded) => r.inStatus && r.limit === 1;
/** R1: status=ringing + limit 20 (`.in` 아님). 목록은 recipient+limit 10. */
const isStaleSweep = (r: Recorded) => r.eq.status === "ringing" && r.limit === 20 && !r.inStatus;

beforeEach(() => {
  recorded = [];
  resetIncomingListReconcileGateForTests();
});

afterEach(() => {
  resetIncomingListReconcileGateForTests();
});

describe("Phase A1 수신 목록 reconcile 묶기", () => {
  it("첫 directOnly 호출 = reconcile 묶음 + 목록 1 (중복 L1 stale 없음)", async () => {
    const result = await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true });
    expect(result).toEqual({ ok: true, sessions: [] });
    const qs = callSessionQueries();
    expect(qs.filter(isStaleSweep).length).toBeGreaterThanOrEqual(1);
    expect(qs.filter(isReconcileScan)).toHaveLength(1);
    expect(qs.filter(isLiveLookup)).toHaveLength(1);
    expect(qs.filter(isListQuery)).toHaveLength(1);
    /** L1 중복: recipient 없는 stale sweep 이 reconcile 안에서 1번만 (list 직전 재호출 없음) */
    expect(qs.filter(isStaleSweep)).toHaveLength(1);
  });

  it("연속 두 번째 directOnly = 목록 SELECT 1회만 (reconcile 생략)", async () => {
    await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true });
    recorded = [];
    const result = await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true });
    expect(result).toEqual({ ok: true, sessions: [] });
    const qs = callSessionQueries();
    expect(qs).toHaveLength(1);
    expect(qs.filter(isListQuery)).toHaveLength(1);
    expect(qs.filter(isReconcileScan)).toHaveLength(0);
    expect(qs.filter(isLiveLookup)).toHaveLength(0);
    expect(qs.filter(isStaleSweep)).toHaveLength(0);
  });
});
