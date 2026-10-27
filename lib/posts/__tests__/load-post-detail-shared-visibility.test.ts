import { beforeEach, describe, expect, it, vi } from "vitest";

/** 거래 계획 1단계 D-1 — 숨김·삭제·관리자 숨김 거래 글(status=hidden)은 작성자·관리자만 상세를 본다 */
let row: Record<string, unknown> | null = null;
let adminIds = new Set<string>();

vi.mock("@/lib/posts/map-post-detail-row", () => ({
  loadPostRowForDetail: async () => row,
  mapPostDetailRowToPostWithMeta: (r: Record<string, unknown>) => ({ ...r }),
}));
vi.mock("@/lib/posts/fetch-post-row-for-trade-chat", () => ({ fetchPostRowForTradeChatById: async () => null }));
vi.mock("@/lib/posts/public-post-private-fields", () => ({ maskTradeDetailBuyerFields: (r: unknown) => r }));
vi.mock("@/lib/posts/enrich-posts-author-nicknames", () => ({ enrichPostsAuthorNicknamesFromProfiles: async () => {} }));
vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({ resolveServiceSupabaseForApi: () => ({}) }));
vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: async (_sb: unknown, id: string) => adminIds.has(id),
}));

import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";

const clients = { readSb: {}, serviceSb: null } as never;

describe("loadPostDetailShared — 공개 자격", () => {
  beforeEach(() => {
    adminIds = new Set(["admin-1"]);
  });

  it("숨김 거래 글: 비로그인·다른 회원은 없음, 작성자·관리자는 보임", async () => {
    row = { id: "p1", user_id: "seller", trade_category_id: "cat", status: "hidden" };
    expect(await loadPostDetailShared(clients, "p1", null)).toBeNull();
    expect(await loadPostDetailShared(clients, "p1", "buyer")).toBeNull();
    expect(await loadPostDetailShared(clients, "p1", "seller")).not.toBeNull();
    expect(await loadPostDetailShared(clients, "p1", "admin-1")).not.toBeNull();
  });

  it("공개 거래 글(판매중·판매완료)은 누구나 본다", async () => {
    row = { id: "p2", user_id: "seller", trade_category_id: "cat", status: "active" };
    expect(await loadPostDetailShared(clients, "p2", null)).not.toBeNull();
    row = { id: "p3", user_id: "seller", trade_category_id: "cat", status: "sold" };
    expect(await loadPostDetailShared(clients, "p3", "buyer")).not.toBeNull();
  });

  it("거래 글이 아니면(커뮤니티 등) 이 판정을 적용하지 않는다", async () => {
    row = { id: "c1", user_id: "x", trade_category_id: null, status: "hidden" };
    expect(await loadPostDetailShared(clients, "c1", null)).not.toBeNull();
  });
});
