/**
 * POST /api/admin/ads/delete · undelete (R2 · 2026-11-07) — 권한 표 · 사유 필수 · DB 함수 1번 · 오류 한국어.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const ownerRow = { value: null as null | { owner_store_id: string | null; owner_request_id: string | null } };
const sb = {
  rpc: (...a: unknown[]) => rpc(...a),
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: ownerRow.value, error: null }) }),
    }),
  }),
};
const actor = { value: { userId: "admin-1", permissions: ["ads"], isSuperAdmin: false } as Record<string, unknown> };

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminApiActor: async () => ({ ok: true, actor: actor.value, sb }),
}));

import { POST as deletePOST } from "@/app/api/admin/ads/delete/route";
import { POST as undeletePOST } from "@/app/api/admin/ads/undelete/route";

const ID = "7a4cd131-69d9-4888-903a-42ed2a49984e";
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/admin/ads/delete", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  rpc.mockReset();
  ownerRow.value = null;
  actor.value = { userId: "admin-1", permissions: ["ads"], isSuperAdmin: false };
});

describe("POST /api/admin/ads/delete", () => {
  it("사유 없음·1자 → 400 reason_required · 한국어 문구 · DB 호출 없음", async () => {
    for (const reason of [undefined, "", " a "]) {
      const res = await deletePOST(req({ kind: "trade_promotion", id: ID, reason }));
      expect(res.status).toBe(400);
      const j = (await res.json()) as { error: string; message: string };
      expect(j.error).toBe("reason_required");
      expect(j.message).toBe("사유를 2자 이상 입력해 주세요.");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("모르는 종류·잘못된 id → 400", async () => {
    expect((await deletePOST(req({ kind: "x", id: ID, reason: "정리" }))).status).toBe(400);
    expect((await deletePOST(req({ kind: "ptr", id: "nope", reason: "정리" }))).status).toBe(400);
  });

  it("권한 표: 배달 광고 = business (ads 만 있으면 403) · 사장님 팝업 = business", async () => {
    let res = await deletePOST(req({ kind: "delivery_banner", id: ID, reason: "정리" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { message: string }).message).toBe("이 광고를 처리할 권한이 없습니다.");
    ownerRow.value = { owner_store_id: "s-1", owner_request_id: null };
    res = await deletePOST(req({ kind: "popup_campaign", id: ID, reason: "정리" }));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ads 없는 운영자는 상위노출 삭제 불가 · 최고관리자는 가능", async () => {
    actor.value = { userId: "admin-1", permissions: ["boards"], isSuperAdmin: false };
    expect((await deletePOST(req({ kind: "trade_promotion", id: ID, reason: "정리" }))).status).toBe(403);
    actor.value = { userId: "super-1", permissions: [], isSuperAdmin: true };
    rpc.mockResolvedValueOnce({ data: { ok: true, mode: "soft", refund_amount: 0, refund_unit: "point", needs_fault: false }, error: null });
    expect((await deletePOST(req({ kind: "trade_promotion", id: ID, reason: "정리" }))).status).toBe(200);
  });

  it("성공: DB 함수 1번 · 인자 그대로 · 대상 재입력 인자 없음", async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, preview: true, mode: "end_and_soft", refund_amount: 428, paid_amount: 500, refund_unit: "point", needs_fault: true },
      error: null,
    });
    const res = await deletePOST(req({ kind: "trade_promotion", id: ID, reason: " 운영 정리 ", fault: "operator", preview: true }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_ad_delete", {
      p_kind: "trade_promotion",
      p_id: ID,
      p_admin: "admin-1",
      p_reason: "운영 정리",
      p_fault: "operator",
      p_preview: true,
    });
    expect(await res.json()).toMatchObject({
      ok: true,
      preview: true,
      plan: { mode: "end_and_soft", refundAmount: 428, paidAmount: 500, refundUnit: "point", needsFault: true },
    });
  });

  it("DB 오류 코드 → 상태·한국어 (fault_required 400 · payment_held 409 · 종료 실패 예외 409)", async () => {
    rpc.mockResolvedValueOnce({ data: { ok: false, error: "fault_required", needs_fault: true }, error: null });
    let res = await deletePOST(req({ kind: "feed_request", id: ID, reason: "정리" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "fault_required", needsFault: true, message: "결제가 있는 광고입니다. 귀책을 선택해 주세요." });
    rpc.mockResolvedValueOnce({ data: { ok: false, error: "payment_held" }, error: null });
    res = await deletePOST(req({ kind: "feed_request", id: ID, reason: "정리" }));
    expect(res.status).toBe(409);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "admin_ad_delete_end_failed:not_running" } });
    res = await deletePOST(req({ kind: "trade_promotion", id: ID, reason: "정리" }));
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; message: string };
    expect(j.error).toBe("end_failed");
    expect(j.message).not.toContain("admin_ad_delete_end_failed");
  });

  it("잘못된 귀책 값 → 400", async () => {
    expect((await deletePOST(req({ kind: "trade_promotion", id: ID, reason: "정리", fault: "boss" }))).status).toBe(400);
  });
});

describe("POST /api/admin/ads/undelete", () => {
  it("사유 필수 · DB 함수 admin_ad_undelete 1번 · not_deleted → 409", async () => {
    expect((await undeletePOST(req({ kind: "my_banner", id: ID }))).status).toBe(400);
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    expect((await undeletePOST(req({ kind: "my_banner", id: ID, reason: "실수 복구" }))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("admin_ad_undelete", { p_kind: "my_banner", p_id: ID, p_admin: "admin-1", p_reason: "실수 복구" });
    rpc.mockResolvedValueOnce({ data: { ok: false, error: "not_deleted" }, error: null });
    const res = await undeletePOST(req({ kind: "my_banner", id: ID, reason: "실수 복구" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { message: string }).message).toBe("삭제된 광고가 아닙니다.");
  });
});
