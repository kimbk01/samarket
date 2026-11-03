/**
 * 재감사 D-5 — 활성 관리자 전원이 쓸 수 있던 광고 쓰기 API 3개를 같은 영역의 권한 키로 막는다.
 * 권한 없음 = 403 · DB 클라이언트 미생성(아무것도 쓰지 않음). 화면 버튼 판정도 같은 키.
 * (이벤트 Push `distribution/push/send` 는 실제 발송이 아니라 검사·감사 후 `notification-campaigns/[id]/send`(manage)로
 *  넘기는 경로라 대상 아님 — 기존 승인 설계 유지. `store-banner-ads` 쓰기는 410 으로 이미 막혀 있음.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let permOk = false;
const permCalls: string[] = [];
const serviceSb = vi.fn(() => null);

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async (key: string) => {
    permCalls.push(key);
    return permOk
      ? { ok: true, actor: { userId: "admin-1" } }
      : {
          ok: false,
          response: new Response(JSON.stringify({ ok: false, error: "forbidden_permission" }), { status: 403 }),
        };
  },
}));
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => serviceSb() }));

import { POST as postDirectPopup } from "@/app/api/admin/advertising/direct-popup/route";
import { POST as postReorderHero } from "@/app/api/admin/advertising/reorder-hero-banners/route";
import { POST as postOwnerEventAction } from "@/app/api/admin/platform-event-owner-requests/[requestId]/actions/route";
import { canActOnAdminRoute } from "@/lib/admin/access/admin-route-access";

const json = (body: unknown) =>
  new Request("http://localhost/api/admin/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;

beforeEach(() => {
  permOk = false;
  permCalls.length = 0;
  serviceSb.mockClear();
});

describe("D-5 광고 쓰기 API 권한", () => {
  it("권한 없음 → 3경로 모두 403, DB 클라이언트 미생성", async () => {
    const results = await Promise.all([
      postDirectPopup(json({})),
      postReorderHero(json({ orderedCampaignIds: ["a"] })),
      postOwnerEventAction(json({ action: "approve", reason: "ok ok" }), { params: Promise.resolve({ requestId: "r1" }) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(permCalls).toEqual(["ads", "business", "business"]);
    expect(serviceSb).not.toHaveBeenCalled();
  });

  it("권한 있음 → 권한 검사를 지나 다음 단계(서비스 없음 503)로 간다", async () => {
    permOk = true;
    const results = await Promise.all([
      postReorderHero(json({ orderedCampaignIds: ["a"] })),
      postOwnerEventAction(json({ action: "approve", reason: "ok ok" }), { params: Promise.resolve({ requestId: "r1" }) }),
    ]);
    expect(results.map((r) => r.status)).toEqual([503, 503]);
  });

  it("화면 버튼 판정도 서버와 같은 키 (조회는 전원 그대로)", () => {
    const ads = { role: "admin" as const, permissions: ["ads"] };
    const business = { role: "admin" as const, permissions: ["business"] };
    expect(canActOnAdminRoute("/admin/advertising/direct/popup", ads)).toBe(true);
    expect(canActOnAdminRoute("/admin/advertising/direct/popup", business)).toBe(false);
    expect(canActOnAdminRoute("/admin/advertising/placements", business)).toBe(true);
    expect(canActOnAdminRoute("/admin/advertising/placements", ads)).toBe(false);
    expect(canActOnAdminRoute("/admin/platform-event-owner-requests/r1", business)).toBe(true);
    expect(canActOnAdminRoute("/admin/platform-event-owner-requests/r1", ads)).toBe(false);
  });
});
