import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-11-27 모임 감사 B5 — 설계 P1 「assertCommunityWriteAllowed 를 쓰되, 조회 실패 시 거부」.
 * 모임만 failClosed 로 부르고, 다른 호출처(커뮤니티 글·댓글·신고)는 이전 동작(허용) 그대로.
 */

let serviceClient: unknown = null;
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => serviceClient }));

import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";

function sanctionsClient(result: { data: unknown; error: unknown } | "throw") {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "or", "order"]) chain[m] = () => chain;
  chain.limit = async () => {
    if (result === "throw") throw new Error("network");
    return result;
  };
  return { from: () => chain };
}

beforeEach(() => {
  serviceClient = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("커뮤니티 쓰기 제한 조회 실패", () => {
  it("서비스 클라이언트 없음: 기본 허용 / failClosed 503", async () => {
    expect(await assertCommunityWriteAllowed("u1", "post")).toBeNull();
    const res = await assertCommunityWriteAllowed("u1", "post", { failClosed: true });
    expect(res?.status).toBe(503);
  });

  it("조회 오류: 기본 허용 / failClosed 503", async () => {
    serviceClient = sanctionsClient({ data: null, error: { message: "boom" } });
    expect(await assertCommunityWriteAllowed("u1", "post")).toBeNull();
    expect((await assertCommunityWriteAllowed("u1", "post", { failClosed: true }))?.status).toBe(503);
  });

  it("조회 예외: 기본 허용 / failClosed 503", async () => {
    serviceClient = sanctionsClient("throw");
    expect(await assertCommunityWriteAllowed("u1", "comment")).toBeNull();
    expect((await assertCommunityWriteAllowed("u1", "comment", { failClosed: true }))?.status).toBe(503);
  });

  it("제한 있음: 두 경우 모두 403, 제한 없음: 두 경우 모두 허용", async () => {
    serviceClient = sanctionsClient({ data: [{ id: "s1", restriction: "all", end_at: null }], error: null });
    expect((await assertCommunityWriteAllowed("u1", "post"))?.status).toBe(403);
    expect((await assertCommunityWriteAllowed("u1", "post", { failClosed: true }))?.status).toBe(403);
    serviceClient = sanctionsClient({ data: [], error: null });
    expect(await assertCommunityWriteAllowed("u1", "post", { failClosed: true })).toBeNull();
  });

  it("모임 관문만 failClosed 로 부른다 (구조 확인)", async () => {
    const { readFileSync } = await import("node:fs");
    const guard = readFileSync("lib/moim/server/moim-route-guard.server.ts", "utf8");
    expect(guard).toContain("assertCommunityWriteAllowed(auth.userId, kind, { failClosed: true })");
  });
});
