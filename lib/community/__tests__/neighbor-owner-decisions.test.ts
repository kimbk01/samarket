/**
 * 관심이웃 Owner 결정(2026-11-28 「권장안대로 구현」) — 실패 재현
 * 결정 2: 로그인 막힌 회원(운영자 이용 제한·탈퇴)은 공개 프로필처럼 관심이웃 목록·개수에서 숨김, 정지(쓰기만 막힘)는 보임, 행은 남김
 */
import { describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

vi.mock("server-only", () => ({}));

const ME = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";

function db(): FakeDb {
  const rel = (id: string, t: string) => ({ id, user_id: ME, target_user_id: t, type: "neighbor_follow", relation_type: "neighbor_follow", created_at: "2026-11-28T00:00:00Z" });
  return {
    user_relationships: [rel("r1", A), rel("r2", B), rel("r3", C)],
    profiles: [
      { id: A, status: "verified_user", deleted_at: null },
      { id: B, status: "blocked", deleted_at: null }, // 운영자 이용 제한(로그인 막힘)
      { id: C, status: "suspended", deleted_at: null }, // 정지(쓰기만 막힘)
    ],
  };
}

describe("결정 2 — 이용 제한 회원은 관심이웃 목록·개수에서 숨김 (예전: 상태를 안 봐 공개 프로필은 404 인데 목록엔 보임)", () => {
  it("목록: 이용 제한 숨김 · 정지는 보임 · 행은 그대로", async () => {
    const { listNeighborFollowRows } = await import("@/lib/community/neighbor-follow-list.server");
    const d = db();
    const r = await listNeighborFollowRows(createFakeSb(d) as never, ME);
    expect(r.ok && r.rows.map((x) => x.targetId).sort()).toEqual([A, C].sort());
    expect(d.user_relationships).toHaveLength(3);
  });

  it("개수 = 목록과 같은 수", async () => {
    const { countNeighborFollows } = await import("@/lib/community/neighbor-follow-list.server");
    expect(await countNeighborFollows(createFakeSb(db()) as never, ME)).toBe(2);
  });

  it("프로필 조회 오류면 목록도 오류 (숨김 판정을 건너뛰어 다 보여 주지 않음)", async () => {
    const { listNeighborFollowRows } = await import("@/lib/community/neighbor-follow-list.server");
    const sb = createFakeSb(db()) as unknown as { from: (t: string) => unknown };
    const realFrom = sb.from.bind(sb);
    sb.from = (t: string) => {
      if (t !== "profiles") return realFrom(t);
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.in = async () => ({ data: null, error: { message: "timeout" } });
      return q;
    };
    const r = await listNeighborFollowRows(sb as never, ME);
    expect(r.ok).toBe(false);
  });
});

/** ── 결정 1: 차단·관심이웃 목록을 못 읽으면 「차단 없음·글 없음」이 아니라 오류 ── */
function erroringFrom() {
  const err = { message: "timeout", code: "57014" };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "or", "in", "order", "limit"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: err }).then(res);
  return { from: () => q };
}

describe("결정 1 — 조회 함수: 오류를 빈 목록으로 바꾸지 않음 (예전: 빈 Set → 차단한 사람 글 섞임·관심이웃 0명)", () => {
  it("차단 작성자 목록", async () => {
    const m = await import("@/lib/social/user-block-ssot");
    await expect(m.fetchBlockedAuthorIdsForViewerSb(erroringFrom() as never, ME)).rejects.toSatisfy(m.isSocialExclusionLookupError);
  });
  it("댓글 차단 방향", async () => {
    const m = await import("@/lib/social/user-block-ssot");
    await expect(m.fetchBlockDirectionsForViewerSb(erroringFrom() as never, ME)).rejects.toSatisfy(m.isSocialExclusionLookupError);
  });
  it("관심이웃 대상", async () => {
    const { fetchNeighborFollowTargetIds } = await import("@/lib/neighborhood/social-filter");
    const { isSocialExclusionLookupError } = await import("@/lib/social/user-block-ssot");
    await expect(fetchNeighborFollowTargetIds(erroringFrom() as never, ME)).rejects.toSatisfy(isSocialExclusionLookupError);
  });
});
