/**
 * R9 — 포인트 정책 화면의 주제 목록은 포인트(point) 권한 API 로 받는다
 * (게시판 관리 `content` 권한이 없는 포인트 담당에게 403 이 나지 않게).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAdminPermission = vi.fn();
const listBoardPointPolicies = vi.fn();
const loadAllCommunityTopicsForAdmin = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: (...a: unknown[]) => requireAdminPermission(...a),
}));
vi.mock("@/lib/points/point-policy-db", () => ({
  listBoardPointPolicies: (...a: unknown[]) => listBoardPointPolicies(...a),
  addPointPolicyLogDb: vi.fn(),
  saveBoardPointPolicyDb: vi.fn(),
}));
vi.mock("@/lib/community-topics/server", () => ({
  loadAllCommunityTopicsForAdmin: () => loadAllCommunityTopicsForAdmin(),
}));

const URL_BASE = "https://samarket.vercel.app/api/admin/point-policies/board";

describe("GET /api/admin/point-policies/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminPermission.mockResolvedValue({ ok: true, sb: {}, actor: { userId: "a" } });
    listBoardPointPolicies.mockResolvedValue([{ id: "p1" }]);
    loadAllCommunityTopicsForAdmin.mockResolvedValue({
      rows: [{ id: "t1", slug: "free", name: "자유", is_feed_sort: false, section_id: "s" }],
      error: null,
    });
  });

  it("include=topics → point 가드 하나로 정책 + 주제(id·slug·이름·정렬 탭)", async () => {
    const { GET } = await import("@/app/api/admin/point-policies/board/route");
    const res = await GET(new NextRequest(`${URL_BASE}?include=topics`));
    const json = await res.json();
    expect(requireAdminPermission).toHaveBeenCalledWith("point");
    expect(json.topics).toEqual([{ id: "t1", slug: "free", name: "자유", is_feed_sort: false }]);
    expect(json.policies).toEqual([{ id: "p1" }]);
  });

  it("파라미터 없으면 기존 응답(주제 없음) · 주제 조회 실패는 500 (빈 목록으로 숨기지 않음)", async () => {
    const { GET } = await import("@/app/api/admin/point-policies/board/route");
    const plain = await (await GET(new NextRequest(URL_BASE))).json();
    expect(plain.topics).toBeUndefined();
    expect(loadAllCommunityTopicsForAdmin).not.toHaveBeenCalled();
    loadAllCommunityTopicsForAdmin.mockResolvedValue({ rows: [], error: "boom" });
    const res = await GET(new NextRequest(`${URL_BASE}?include=topics`));
    expect(res.status).toBe(500);
  });

  it("point 권한이 없으면 가드 응답 그대로", async () => {
    requireAdminPermission.mockResolvedValue({ ok: false, response: new Response("no", { status: 403 }) });
    const { GET } = await import("@/app/api/admin/point-policies/board/route");
    const res = await GET(new NextRequest(`${URL_BASE}?include=topics`));
    expect(res.status).toBe(403);
    expect(loadAllCommunityTopicsForAdmin).not.toHaveBeenCalled();
  });
});
