/**
 * D1 (Owner 승인 2026-11-09 · docs/audit/call-incoming-defects-d1-d2-plan-2026-11-09.md) —
 * 수신 목록 조회의 DB 오류를 「200 + 빈 목록」으로 숨기지 않는다.
 * 서비스(`listIncomingCommunityMessengerCallSessionsResult`)와 라우트(503) 계약.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Res = { data: unknown; error: unknown };
type Plan = { direct?: Res; participants?: Res; groupRows?: Res };
let plan: Plan = {};

function makeQuery(table: string) {
  const filters: Record<string, unknown> = {};
  let hasIdIn = false;
  const resolve = (): Res => {
    if (table === "community_messenger_call_session_participants") {
      return plan.participants ?? { data: [], error: null };
    }
    if (table === "community_messenger_call_sessions") {
      if (hasIdIn) return plan.groupRows ?? { data: [], error: null };
      if (filters.recipient_user_id && filters.status === "ringing") return plan.direct ?? { data: [], error: null };
    }
    return { data: [], error: null };
  };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "or", "update", "insert", "lt", "lte", "gte", "neq", "is", "not"]) {
    q[m] = () => q;
  }
  q.eq = (k: string, v: unknown) => {
    filters[k] = v;
    return q;
  };
  q.in = (k: string) => {
    if (k === "id") hasIdIn = true;
    return q;
  };
  q.maybeSingle = async () => resolve();
  q.single = async () => resolve();
  q.then = (ok: (r: Res) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return q;
}

const fakeSb = { from: (t: string) => makeQuery(t), rpc: async () => ({ data: null, error: null }) };
let sbAvailable = true;

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: vi.fn(() => {
    if (!sbAvailable) throw new Error("no supabase");
    return fakeSb;
  }),
}));
vi.mock("@/lib/community-messenger/messenger-call-admin-policy", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, getMessengerCallAdminPolicyCached: vi.fn(async () => ({})) };
});

import {
  listIncomingCommunityMessengerCallSessions,
  listIncomingCommunityMessengerCallSessionsResult,
} from "@/lib/community-messenger/service";

const UID = "11111111-1111-1111-1111-111111111111";
const dbErr = { message: "canceling statement due to statement timeout", code: "57014" };

beforeEach(() => {
  plan = {};
  sbAvailable = true;
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("D1 서비스 — directOnly (운영 V4 웹 경로)", () => {
  it("direct 조회 오류 → ok:false(direct_query_failed) — 빈 목록으로 숨기지 않음", async () => {
    plan.direct = { data: null, error: dbErr };
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true })).toEqual({
      ok: false,
      reason: "direct_query_failed",
    });
  });
  it("정상 빈 목록 → ok:true, sessions []", async () => {
    plan.direct = { data: [], error: null };
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true })).toEqual({
      ok: true,
      sessions: [],
    });
  });
  it("기존 배열 계약(래퍼)은 오류여도 [] — 다른 호출처 불변", async () => {
    plan.direct = { data: null, error: dbErr };
    expect(await listIncomingCommunityMessengerCallSessions(UID, { directOnly: true })).toEqual([]);
  });
});

describe("D1 서비스 — 전체(direct+group)", () => {
  it("direct 오류(그룹 정상) → direct_query_failed (부분 결과로 「없음」 판정 금지)", async () => {
    plan.direct = { data: null, error: dbErr };
    plan.participants = { data: [], error: null };
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID)).toEqual({ ok: false, reason: "direct_query_failed" });
  });
  it("그룹 참가자 조회 오류 → group_query_failed", async () => {
    plan.direct = { data: [], error: null };
    plan.participants = { data: null, error: dbErr };
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID)).toEqual({ ok: false, reason: "group_query_failed" });
  });
  it("그룹 세션 행 조회 오류 → group_query_failed", async () => {
    plan.direct = { data: [], error: null };
    plan.participants = { data: [{ session_id: "g1", participation_status: "invited" }], error: null };
    plan.groupRows = { data: null, error: dbErr };
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID)).toEqual({ ok: false, reason: "group_query_failed" });
  });
  it("오류 없이 비어 있음 → ok:true (기존 dev 폴백 경로 그대로)", async () => {
    const r = await listIncomingCommunityMessengerCallSessionsResult(UID);
    expect(r.ok).toBe(true);
  });
});

describe("D1 서비스 — DB 클라이언트 없음", () => {
  it("운영 배포 + DB 없음 → db_unavailable (개발 메모리 상태로 떨어지지 않음)", async () => {
    sbAvailable = false;
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_DEPLOY_TIER", "production");
    expect(await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true })).toEqual({
      ok: false,
      reason: "db_unavailable",
    });
  });
  it("비운영 + DB 없음 → 기존 dev 폴백(ok:true)", async () => {
    sbAvailable = false;
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_DEPLOY_TIER", "development");
    const r = await listIncomingCommunityMessengerCallSessionsResult(UID, { directOnly: true });
    expect(r.ok).toBe(true);
  });
});
