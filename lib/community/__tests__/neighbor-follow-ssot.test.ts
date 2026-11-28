/**
 * 관심이웃 SSOT — 감사 `docs/audit/interest-neighbor-audit-2026-11-28.md` 결함 재현 시험.
 * 설계 `docs/audit/interest-neighbor-build-design-2026-11-28.md` A·C·D.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;
let blockedEitherWay = false;
let registrationGap: Response | null = null;

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake }));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: ME }),
}));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({
  requireRegistrationForAction: async () => registrationGap,
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedEitherWay: async () => blockedEitherWay,
}));

function profile(id: string, extra: Record<string, unknown> = {}) {
  return { id, status: "verified_user", deleted_at: null, ...extra };
}

function follow(user: string, target: string, at = "2026-11-01T00:00:00Z") {
  return {
    id: `rel-${user.slice(0, 4)}-${target.slice(0, 4)}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: user,
    target_user_id: target,
    type: "neighbor_follow",
    relation_type: "neighbor_follow",
    created_at: at,
  };
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/community/neighbor-relations/route");
  const req = new Request("http://localhost/api/community/neighbor-relations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = await POST(req as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function followRows(user = ME) {
  return (db.user_relationships ?? []).filter((r) => r.user_id === user && r.type === "neighbor_follow");
}

beforeEach(() => {
  db = { user_relationships: [], profiles: [profile(ME), profile(PEER), profile(OTHER)] };
  fake = createFakeSb(db);
  blockedEitherWay = false;
  registrationGap = null;
});

describe("E1 — 상태 지정 POST: 같은 「추가」를 두 번 보내도 해제되지 않는다", () => {
  it("이전 토글 결함 재현 조건: 이미 관심이웃인데 다른 버튼이 following:true 를 보냄 → 그대로 관심이웃", async () => {
    db.user_relationships!.push(follow(ME, PEER));
    const r = await post({ targetUserId: PEER, following: true });
    expect(r).toEqual({ status: 200, json: { ok: true, following: true } });
    expect(followRows()).toHaveLength(1);
  });

  it("추가 → 추가 → 해제 → 해제 (멱등)", async () => {
    expect((await post({ targetUserId: PEER, following: true })).json.following).toBe(true);
    expect((await post({ targetUserId: PEER, following: true })).json.following).toBe(true);
    expect(followRows()).toHaveLength(1);
    expect((await post({ targetUserId: PEER, following: false })).json.following).toBe(false);
    expect((await post({ targetUserId: PEER, following: false })).json.following).toBe(false);
    expect(followRows()).toHaveLength(0);
  });

  it("상태 없이 보낸 옛 토글 요청은 400 (뒤집기 금지)", async () => {
    const r = await post({ targetUserId: PEER });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("following_required");
    expect(followRows()).toHaveLength(0);
  });
});

describe("E9 — 상한 100명 (레거시 FAQ 102)", () => {
  it("100명 저장돼 있으면 101번째 추가는 409, 해제는 된다", async () => {
    for (let i = 0; i < 100; i += 1) {
      db.user_relationships!.push(follow(ME, `t-${String(i).padStart(3, "0")}`));
    }
    const add = await post({ targetUserId: PEER, following: true });
    expect(add.status).toBe(409);
    expect(add.json.error).toBe("neighbor_follow_limit");
    expect(followRows()).toHaveLength(100);
    const rm = await post({ targetUserId: "t-000", following: false });
    expect(rm.json).toEqual({ ok: true, following: false });
    expect(followRows()).toHaveLength(99);
  });
});

describe("추가 거절 — 차단·탈퇴·가입 미완료 (해제는 막지 않음)", () => {
  it("양방향 차단이면 400 blocked_target", async () => {
    blockedEitherWay = true;
    const r = await post({ targetUserId: PEER, following: true });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("blocked_target");
  });

  it("탈퇴한 상대·프로필 없는 상대는 404 target_unavailable", async () => {
    db.profiles = [profile(ME), profile(PEER, { status: "deleted", deleted_at: "2026-11-20T00:00:00Z" })];
    expect((await post({ targetUserId: PEER, following: true })).json.error).toBe("target_unavailable");
    expect((await post({ targetUserId: "44444444-4444-4444-8444-444444444444", following: true })).json.error).toBe(
      "target_unavailable",
    );
  });

  it("가입 미완료는 추가만 거절, 해제는 가입 없이", async () => {
    db.user_relationships!.push(follow(ME, PEER));
    registrationGap = Response.json({ ok: false, error: "signup_incomplete" }, { status: 403 }) as never;
    expect((await post({ targetUserId: OTHER, following: true })).status).toBe(403);
    expect((await post({ targetUserId: PEER, following: false })).json).toEqual({ ok: true, following: false });
  });
});

describe("E4 — 보이는 관심이웃 = 탈퇴·프로필 없음·차단 제외 (목록·개수·글 공통)", () => {
  it("listVisibleNeighborFollowRows", async () => {
    vi.resetModules();
    vi.doMock("@/lib/neighborhood/social-filter", () => ({
      fetchBlockedAuthorIdsForViewer: async () => new Set([OTHER]),
    }));
    const { listVisibleNeighborFollowRows } = await import("@/lib/community/neighbor-follow-list.server");
    const gone = "55555555-5555-4555-8555-555555555555";
    const withdrawn = "66666666-6666-4666-8666-666666666666";
    db.profiles!.push(profile(withdrawn, { status: "deleted" }));
    db.user_relationships!.push(
      follow(ME, PEER, "2026-11-05T00:00:00Z"),
      follow(ME, OTHER),
      follow(ME, gone),
      follow(ME, withdrawn),
      follow(PEER, ME),
    );
    const r = await listVisibleNeighborFollowRows(fake as never, ME);
    expect(r.ok && r.rows.map((x) => x.targetId)).toEqual([PEER]);
    vi.doUnmock("@/lib/neighborhood/social-filter");
  });

  it("차단·탈퇴 정리: 양방향 삭제 · 한 회원 전체 삭제 (다른 회원 행은 그대로)", async () => {
    const { deleteNeighborFollowsBetween, deleteAllNeighborFollowsForUser } = await import(
      "@/lib/community/neighbor-follow-list.server"
    );
    db.user_relationships!.push(follow(ME, PEER), follow(PEER, ME), follow(OTHER, PEER), {
      ...follow(ME, PEER),
      type: "blocked",
      relation_type: "blocked",
    });
    await deleteNeighborFollowsBetween(fake as never, ME, PEER);
    expect(db.user_relationships!.map((r) => `${r.user_id}>${r.target_user_id}:${r.type}`).sort()).toEqual(
      [`${OTHER}>${PEER}:neighbor_follow`, `${ME}>${PEER}:blocked`].sort(),
    );
    db.user_relationships!.push(follow(ME, OTHER));
    await deleteAllNeighborFollowsForUser(fake as never, PEER);
    expect(db.user_relationships!.map((r) => `${r.user_id}>${r.target_user_id}:${r.type}`).sort()).toEqual(
      [`${ME}>${PEER}:blocked`, `${ME}>${OTHER}:neighbor_follow`].sort(),
    );
  });

  it("관계 삭제가 던져도(가짜 클라이언트) 탈퇴 흐름을 멈추지 않는다", async () => {
    const { deleteAllNeighborFollowsForUser } = await import("@/lib/community/neighbor-follow-list.server");
    await expect(deleteAllNeighborFollowsForUser({ from: () => ({}) } as never, ME)).resolves.toBeUndefined();
  });
});
