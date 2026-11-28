/**
 * 차단·탈퇴·영구 삭제 때 관심이웃 정리 = DB 트리거 하나 (전체 수정 설계 v2 §4 · 감사 R1 「삭제 규칙 두 벌」).
 * 예전에는 `blockUserSocial` 안의 삭제 사본과 탈퇴 route 의 삭제 호출이 따로 지켰다.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake }));

const nf = (id: string, u: string, t: string) => ({ id, user_id: u, target_user_id: t, type: "neighbor_follow", relation_type: "neighbor_follow" });
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const MIGRATION = "supabase/migrations/20271128250000_neighbor_follow_invariants.sql";

beforeEach(() => {
  db = { user_relationships: [nf("r1", A, B), nf("r2", B, A), nf("r3", C, B)], user_social_relations: [] };
  fake = createFakeSb(db);
});

describe("앱은 관심이웃을 직접 지우지 않는다 — DB 트리거가 유일", () => {
  it("blockUserSocial 은 차단 행만 쓰고 neighbor_follow 행은 건드리지 않는다", async () => {
    const { blockUserSocial } = await import("@/lib/community-messenger/social-relations");
    const r = await blockUserSocial(A, B, { blockSource: "chat" as never });
    expect(r.ok).toBe(true);
    expect(db.user_relationships!.filter((x) => x.type === "neighbor_follow").map((x) => x.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("탈퇴·영구 삭제 route·목록 모듈에 관심이웃 삭제 호출이 없다 (구조 확인)", () => {
    expect(read("app/api/admin/users/[id]/delete/route.ts")).not.toContain("deleteAllNeighborFollowsForUser");
    expect(read("lib/community/neighbor-follow-list.server.ts")).not.toMatch(/\.delete\(\)/);
  });
});

describe("DB-1 마이그레이션 — 트리거 조건·권한 (구조 확인)", () => {
  const sql = read(MIGRATION);

  it("차단(다시 차단 포함, is_active=false 제외) → 양방향 삭제", () => {
    expect(sql).toMatch(/after insert or update of relation_type, is_active on public\.user_social_relations/);
    expect(sql).toMatch(/when \(new\.relation_type = 'blocked' and new\.is_active is distinct from false\)/);
    expect(sql).toMatch(/user_id = new\.owner_user_id and target_user_id = new\.target_user_id/);
    expect(sql).toMatch(/user_id = new\.target_user_id and target_user_id = new\.owner_user_id/);
  });

  it("탈퇴(status·deleted_at)·영구 삭제 → 맺은·받은 행 삭제", () => {
    expect(sql).toMatch(/after update of status, deleted_at on public\.profiles/);
    expect(sql).toMatch(/after delete on public\.profiles/);
    expect(sql).toMatch(/user_id = new\.id or target_user_id = new\.id/);
    expect(sql).toMatch(/user_id = old\.id or target_user_id = old\.id/);
  });

  it("추가 함수: 쌍 잠금·회원 잠금 뒤 탈퇴 → 차단 → 상한 → 추가, 서버(service_role)만 실행", () => {
    const fn = sql.slice(sql.indexOf("create or replace function public.neighbor_follow_set_for"));
    const order = [
      "neighbor_follow_pair_lock",
      "nf_user:",
      "target_unavailable",
      "blocked_target",
      "neighbor_follow_limit",
      "insert into public.user_relationships",
    ];
    const at = order.map((k) => fn.indexOf(k));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(sql).toMatch(
      /revoke all on function public\.neighbor_follow_set_for\(uuid, uuid, boolean, integer\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(/grant execute on function public\.neighbor_follow_set_for\(uuid, uuid, boolean, integer\) to service_role/);
    expect((sql.match(/security definer/g) ?? []).length).toBe(5);
    expect((sql.match(/set search_path = public, pg_temp/g) ?? []).length).toBe(5);
  });

  it("type = relation_type CHECK · 정책 추가 없음(회원 직접 쓰기 경로를 열지 않음)", () => {
    expect(sql).toMatch(/check \(type = relation_type\)/);
    expect(sql).not.toMatch(/create policy/i);
  });
});
