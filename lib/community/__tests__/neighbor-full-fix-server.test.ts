/**
 * 관심이웃 전체 수정 설계 v2 — 서버 쪽 실패 재현 (docs/audit/interest-neighbor-full-fix-design-2026-11-28.md §8 V-C3)
 * D3 조회·저장 오류를 성공으로 바꾸던 결함 · D5 uuid 미검사 · 차단 토글(같은 「차단」을 두 번 보내면 해제되던 결함)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";

/** 모든 조회·RPC 가 오류를 내는 DB (일시 장애·시간 초과) */
function erroringSb() {
  const err = { message: "timeout", code: "57014" };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "or", "in", "order", "limit", "delete", "insert", "update"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: null, error: err });
  q.single = async () => ({ data: null, error: err });
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: err, count: null }).then(res);
  return { from: () => q, rpc: async () => ({ data: null, error: err }) };
}

let sb: unknown;
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => sb }));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: ME }),
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: ME }),
}));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({ requireRegistrationForAction: async () => null }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));

let alreadyBlocked = false;
const blockCalls: string[] = [];
vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedByMe: async () => alreadyBlocked,
  isBlockedEitherWay: async () => alreadyBlocked,
  blockUserSocial: async () => {
    blockCalls.push("block");
    return { ok: true };
  },
  unblockUserSocial: async () => {
    blockCalls.push("unblock");
    return { ok: true };
  },
}));
vi.mock("@/lib/community-messenger/service", () => ({
  cleanupCommunityMessengerFriendGraphOnBlock: async () => ({ ok: true }),
}));
vi.mock("@/lib/community-messenger/participant-block-hide", () => ({
  hideDirectRoomsOnBlockForViewer: async () => {
    blockCalls.push("hide_rooms");
  },
  restoreDirectRoomsOnUnblockForViewer: async () => {
    blockCalls.push("restore_rooms");
  },
}));
vi.mock("@/lib/community-messenger/block-call-termination", () => ({
  terminateDirectCallsOnBlockBestEffort: async () => {
    blockCalls.push("terminate_calls");
  },
}));

async function postNeighbor(body: unknown) {
  const { POST } = await import("@/app/api/community/neighbor-relations/route");
  const res = await POST(
    new Request("http://localhost/api/community/neighbor-relations", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as never,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function postBlock(body: unknown) {
  const { POST } = await import("@/app/api/community/block-relations/route");
  const res = await POST(
    new Request("http://localhost/api/community/block-relations", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }) as never,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  sb = {
    from: erroringSb().from,
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  };
  rpcResult = { data: null, error: null };
  rpcCalls.length = 0;
  alreadyBlocked = false;
  blockCalls.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("D3 — 관심이웃 해제·추가: DB 오류를 성공으로 바꾸지 않는다", () => {
  it("DB 가 오류면 503 (예전: 해제 요청에 200 「해제했어요」)", async () => {
    sb = erroringSb();
    const r = await postNeighbor({ targetUserId: PEER, following: false });
    expect(r.status).toBe(503);
    expect(r.json.ok).toBe(false);
  });
});

describe("D5 — 대상 id 는 uuid 만", () => {
  it("uuid 가 아니면 400 bad_target, DB 를 부르지 않는다 (예전: DB 조회 → Postgres 오류)", async () => {
    const r = await postNeighbor({ targetUserId: "verify-x", following: false });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("bad_target");
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("DB 함수 한 번으로 추가 — 거절 코드·상태값은 그대로", () => {
  it.each([
    ["target_unavailable", 404],
    ["blocked_target", 400],
    ["neighbor_follow_limit", 409],
  ])("%s → %i", async (error, status) => {
    rpcResult = { data: { ok: false, error }, error: null };
    const r = await postNeighbor({ targetUserId: PEER, following: true });
    expect(r.status).toBe(status);
    expect(r.json.error).toBe(error);
    expect(rpcCalls).toEqual([
      { fn: "neighbor_follow_set_for", args: { p_user: ME, p_target: PEER, p_follow: true, p_limit: 100 } },
    ]);
  });

  it("성공 → {ok, following, count}", async () => {
    rpcResult = { data: { ok: true, following: true, count: 3 }, error: null };
    expect((await postNeighbor({ targetUserId: PEER, following: true })).json).toEqual({
      ok: true,
      following: true,
      count: 3,
    });
  });
});

describe("차단 — 상태 지정 (같은 「차단」 두 번 = 그대로 차단)", () => {
  it("이미 차단인데 blocked:true → 해제하지 않음 (예전: 토글로 해제)", async () => {
    alreadyBlocked = true;
    const r = await postBlock({ targetUserId: PEER, blocked: true });
    expect(r.json).toEqual({ ok: true, blocked: true });
    expect(blockCalls).not.toContain("unblock");
  });

  it("차단 → 통화 종료·방 숨김 호출 순서 그대로 (통화 규정)", async () => {
    alreadyBlocked = false;
    const r = await postBlock({ targetUserId: PEER, blocked: true });
    expect(r.json).toEqual({ ok: true, blocked: true });
    expect(blockCalls).toEqual(["block", "hide_rooms", "terminate_calls"]);
  });

  it("해제 상태인데 blocked:false → 그대로 200, 해제 호출 없음", async () => {
    alreadyBlocked = false;
    const r = await postBlock({ targetUserId: PEER, blocked: false });
    expect(r.json).toEqual({ ok: true, blocked: false });
    expect(blockCalls).toHaveLength(0);
  });

  it("uuid 가 아니면 400", async () => {
    expect((await postBlock({ targetUserId: "x", blocked: true })).status).toBe(400);
  });

  it("옛 토글 요청(blocked 없음)은 400 blocked_required — 차단·해제 호출 없음 (PR-B: 한 배포 호환 종료)", async () => {
    alreadyBlocked = true;
    const r = await postBlock({ targetUserId: PEER });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("blocked_required");
    expect(blockCalls).toHaveLength(0);
  });
});
