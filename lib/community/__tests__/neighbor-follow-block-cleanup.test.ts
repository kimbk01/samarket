/**
 * 감사 E4 재현 — 메신저·거래 채팅 차단(공통 `blockUserSocial`)은 관심이웃을 지우지 않았다.
 * 이제 모든 차단 경로가 지나는 공통 함수가 양방향 관심이웃을 지운다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "./neighbor-follow-fake-sb";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake }));

const nf = (id: string, u: string, t: string) => ({ id, user_id: u, target_user_id: t, type: "neighbor_follow", relation_type: "neighbor_follow" });

beforeEach(() => {
  db = { user_relationships: [nf("r1", A, B), nf("r2", B, A), nf("r3", C, B)], user_social_relations: [] };
  fake = createFakeSb(db);
});

describe("blockUserSocial → 양방향 관심이웃 삭제", () => {
  it("A 가 B 를 차단하면 A→B · B→A 관심이웃이 지워지고 C→B 는 남는다", async () => {
    const { blockUserSocial } = await import("@/lib/community-messenger/social-relations");
    const r = await blockUserSocial(A, B, { blockSource: "chat" as never });
    expect(r.ok).toBe(true);
    expect(db.user_relationships!.filter((x) => x.type === "neighbor_follow").map((x) => x.id)).toEqual(["r3"]);
  });
});
