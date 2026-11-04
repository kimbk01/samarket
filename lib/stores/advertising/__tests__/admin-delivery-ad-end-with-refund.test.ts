/**
 * AL-04 · D-13 — 배달 광고 진행 중 종료 + 귀책별 환급 함수 (DB 함수 rpc 모킹 · 운영 DB 함수는 마이그레이션 담당 M).
 */
import { describe, expect, it, vi } from "vitest";
import {
  adminEndDeliveryAdWithRefund,
  deliveryAdEndFaultLabel,
  isDeliveryAdLiveEndLifecycle,
} from "@/lib/stores/advertising/admin-delivery-ad-end";

function sbWith(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) };
}

const base = { campaignId: "c1", adminUserId: "admin-1", fault: "operator" as const, reason: "운영 오류로 종료" };

describe("adminEndDeliveryAdWithRefund", () => {
  it("rpc 이름·인자 그대로 · 응답을 금액 칸으로 바꾼다", async () => {
    const sb = sbWith({
      data: { ok: true, preview: false, refund_amount: 5000, paid_amount: 10000, remaining_seconds: 43200 },
      error: null,
    });
    const res = await adminEndDeliveryAdWithRefund(sb as never, base);
    expect(sb.rpc).toHaveBeenCalledWith("admin_delivery_ad_end_with_refund", {
      p_campaign_id: "c1",
      p_admin_id: "admin-1",
      p_fault: "operator",
      p_reason: "운영 오류로 종료",
      p_preview: false,
    });
    expect(res).toEqual({ ok: true, preview: false, refundAmount: 5000, paidAmount: 10000, remainingSeconds: 43200 });
  });

  it("미리보기 = p_preview true · 사유 없어도 된다", async () => {
    const sb = sbWith({
      data: { ok: true, preview: true, refund_amount: 1234, paid_amount: 2000, remaining_seconds: 100 },
      error: null,
    });
    const res = await adminEndDeliveryAdWithRefund(sb as never, { ...base, reason: "", preview: true });
    expect((sb.rpc.mock.calls[0] as unknown[])[1]).toMatchObject({ p_preview: true });
    expect(res).toMatchObject({ ok: true, preview: true, refundAmount: 1234 });
  });

  it("실행인데 사유 없음 → reason_required 400 · rpc 안 부름", async () => {
    const sb = sbWith({ data: null, error: null });
    expect(await adminEndDeliveryAdWithRefund(sb as never, { ...base, reason: "  " })).toEqual({
      ok: false,
      error: "reason_required",
      httpStatus: 400,
    });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("귀책 값이 틀리면 fault_required 400 · rpc 안 부름", async () => {
    const sb = sbWith({ data: null, error: null });
    expect(
      await adminEndDeliveryAdWithRefund(sb as never, { ...base, fault: "owner" as never })
    ).toEqual({ ok: false, error: "fault_required", httpStatus: 400 });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["fault_required", 400],
    ["already_ended", 409],
    ["not_found", 404],
    ["not_active", 400],
  ])("DB 오류 %s → %i", async (code, status) => {
    const sb = sbWith({ data: { ok: false, error: code }, error: null });
    expect(await adminEndDeliveryAdWithRefund(sb as never, base)).toEqual({ ok: false, error: code, httpStatus: status });
  });

  it("DB 원문 오류(message)는 내보내지 않는다", async () => {
    const sb = sbWith({ data: null, error: { code: "XX000", message: 'relation "x" violates constraint' } });
    const res = await adminEndDeliveryAdWithRefund(sb as never, base);
    expect(res).toEqual({ ok: false, error: "rpc_failed", httpStatus: 500 });
    expect(JSON.stringify(res)).not.toContain("violates");
    const odd = sbWith({ data: { ok: false, error: "ERROR: duplicate key value" }, error: null });
    expect(await adminEndDeliveryAdWithRefund(odd as never, base)).toEqual({
      ok: false,
      error: "rpc_failed",
      httpStatus: 400,
    });
  });

  it("함수가 아직 운영에 없으면 rpc_missing 503", async () => {
    const sb = sbWith({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    expect(await adminEndDeliveryAdWithRefund(sb as never, base)).toEqual({
      ok: false,
      error: "rpc_missing",
      httpStatus: 503,
    });
  });

  it("진행 중 상태·귀책 문구", () => {
    expect(["ACTIVE", "PAUSED_OWNER", "PAUSED_ADMIN"].every(isDeliveryAdLiveEndLifecycle)).toBe(true);
    expect(isDeliveryAdLiveEndLifecycle("SCHEDULED")).toBe(false);
    expect(deliveryAdEndFaultLabel("operator", true)).toBe("운영 사유 — 남은 기간 비례 환급");
    expect(deliveryAdEndFaultLabel("member", true)).toBe("사장님 사유 — 환급 없음");
    expect(deliveryAdEndFaultLabel("none", true)).toBe("해당 없음 — 환급 없음");
  });
});
