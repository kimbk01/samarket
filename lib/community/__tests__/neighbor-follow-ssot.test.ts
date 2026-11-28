/**
 * 관심이웃 SSOT — 감사 `docs/audit/interest-neighbor-audit-2026-11-28.md` 결함 재현 시험.
 * 설계 `docs/audit/interest-neighbor-build-design-2026-11-28.md` A·C·D, 전체 수정 설계 v2(추가·해제 = DB 함수 1회,
 * 차단·탈퇴 정리 = DB 트리거). 가짜 DB 의 `rpc` 는 SQL 함수와 같은 순서로 흉내 낸다(`neighbor-follow-fake-sb.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;
let registrationGap: Response | null = null;

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake }));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: ME }),
}));
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({
  requireRegistrationForAction: async () => registrationGap,
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

const uuidN = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const block = (owner: string, target: string, is_active = true) => ({
  owner_user_id: owner,
  target_user_id: target,
  relation_type: "blocked",
  is_active,
});

beforeEach(() => {
  db = { user_relationships: [], profiles: [profile(ME), profile(PEER), profile(OTHER)], user_social_relations: [] };
  fake = createFakeSb(db);
  registrationGap = null;
});

describe("E1 — 상태 지정 POST: 같은 「추가」를 두 번 보내도 해제되지 않는다", () => {
  it("이전 토글 결함 재현 조건: 이미 관심이웃인데 다른 버튼이 following:true 를 보냄 → 그대로 관심이웃", async () => {
    db.user_relationships!.push(follow(ME, PEER));
    const r = await post({ targetUserId: PEER, following: true });
    expect(r).toEqual({ status: 200, json: { ok: true, following: true, count: 1 } });
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
      db.user_relationships!.push(follow(ME, uuidN(i)));
    }
    const add = await post({ targetUserId: PEER, following: true });
    expect(add.status).toBe(409);
    expect(add.json.error).toBe("neighbor_follow_limit");
    expect(followRows()).toHaveLength(100);
    const rm = await post({ targetUserId: uuidN(0), following: false });
    expect(rm.json).toEqual({ ok: true, following: false, count: 99 });
    expect(followRows()).toHaveLength(99);
  });
});

describe("추가 거절 — 차단·탈퇴·가입 미완료 (해제는 막지 않음)", () => {
  it("양방향 활성 차단이면 400 blocked_target · 차단 해제(is_active=false)면 추가됨", async () => {
    db.user_social_relations!.push(block(PEER, ME));
    const r = await post({ targetUserId: PEER, following: true });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("blocked_target");
    db.user_social_relations = [block(PEER, ME, false)];
    expect((await post({ targetUserId: PEER, following: true })).json.following).toBe(true);
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
    expect((await post({ targetUserId: PEER, following: false })).json).toEqual({ ok: true, following: false, count: 0 });
  });
});

describe("목록·개수 = 저장 행 (탈퇴·차단 상대 행은 DB 트리거가 지움 — 전체 수정 설계 v2 §5-3)", () => {
  it("listNeighborFollowRows: 내 neighbor_follow 행만 최신순, 다른 종류·남의 행·자기 자신 제외", async () => {
    const { listNeighborFollowRows } = await import("@/lib/community/neighbor-follow-list.server");
    db.user_relationships!.push(
      follow(ME, PEER, "2026-11-05T00:00:00Z"),
      follow(ME, OTHER, "2026-11-01T00:00:00Z"),
      { ...follow(ME, uuidN(7)), type: "blocked", relation_type: "blocked" },
      follow(PEER, ME),
    );
    const r = await listNeighborFollowRows(fake as never, ME);
    expect(r.ok && r.rows.map((x) => x.targetId)).toEqual([PEER, OTHER]);
  });

  it("countNeighborFollows: 같은 기준의 head count", async () => {
    const { countNeighborFollows } = await import("@/lib/community/neighbor-follow-list.server");
    db.user_relationships!.push(follow(ME, PEER), follow(ME, OTHER), follow(PEER, ME));
    expect(await countNeighborFollows(fake as never, ME)).toBe(2);
  });
});
