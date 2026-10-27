import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { createFakeSupabase } from "@/lib/mypage/__tests__/helpers/fake-postgrest";

/** 거래 계획 1단계 M-1 — 판매자가 삭제한 글은 「다시 보이기」로 공개할 수 없다 */
const db = {
  [POSTS_TABLE_WRITE]: [
    { id: "del", user_id: "u1", status: "hidden", seller_listing_state: null, moderation_state: "visible", owner_state: "owner_deleted" },
  ],
};
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "u1" }),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => createFakeSupabase(db) }));
vi.mock("@/lib/trade/insert-seller-listing-change-system-messages", () => ({
  applySellerListingChangeSideEffectsServer: async () => {},
}));

import { POST } from "@/app/api/posts/[postId]/owner-status/route";

describe("owner-status — 삭제 글 부활 차단", () => {
  it("owner_deleted 글에 status:active → 403 owner_deleted", async () => {
    const req = new NextRequest("http://localhost/api/posts/del/owner-status", {
      method: "POST",
      body: JSON.stringify({ status: "active" }),
    });
    const res = await POST(req, { params: Promise.resolve({ postId: "del" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("owner_deleted");
  });
});
