/**
 * T3 1단계 (Owner 「T3 1단계 승인」 2026-11-09) — 거래 글 조회수 갱신은 view_count 만 바꾸고 updated_at 은 쓰지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn();
let row: { view_count: number | null; user_id: string } | null = { view_count: 11, user_id: "seller-1" };
let viewer: string | null = "buyer-1";

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (payload: unknown) => {
        update(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
vi.mock("@/lib/auth/api-session", () => ({
  getOptionalAuthenticatedUserId: async () => viewer,
}));

const POST_ID = "ed37be0d-0a35-47bb-a67e-c83c32d8e852";

async function call() {
  const { POST } = await import("@/app/api/posts/[postId]/increment-view/route");
  return POST({} as never, { params: Promise.resolve({ postId: POST_ID }) });
}

describe("increment-view T3 1단계", () => {
  beforeEach(() => {
    update.mockReset();
    row = { view_count: 11, user_id: "seller-1" };
    viewer = "buyer-1";
  });

  it("조회수만 +1, updated_at 은 쓰지 않음", async () => {
    const res = await call();
    expect(res.status).toBe(204);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ view_count: 12 });
    expect(Object.keys(update.mock.calls[0][0] as object)).not.toContain("updated_at");
  });

  it("view_count 가 비어 있으면 1", async () => {
    row = { view_count: null, user_id: "seller-1" };
    await call();
    expect(update).toHaveBeenCalledWith({ view_count: 1 });
  });

  it("작성자 본인 조회는 기존처럼 세지 않음", async () => {
    viewer = "seller-1";
    await call();
    expect(update).not.toHaveBeenCalled();
  });

  it("비회원 조회는 기존처럼 셈 (2단계 집계 규칙 결정 전 동작 유지)", async () => {
    viewer = null;
    await call();
    expect(update).toHaveBeenCalledWith({ view_count: 12 });
  });
});
