/**
 * AD2-01 (2026-11-07) — 거래 상위노출 승인도 사유 필수(공통 화면과 같은 L2).
 * D-10 — 내부 메모(`internalReason`)는 회원 공개 사유·알림으로 가지 않고 운영자 메모로만 저장.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runTradePromotionAction = vi.fn();
const persistAdvertisingAdminMemo = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/admin/access/require-ads-write-admin", () => ({
  requireAdsWriteAdmin: vi.fn(async () => ({ ok: true, userId: "admin-1", sb: {} })),
}));
vi.mock("@/lib/admin/trade-admin/trade-promotion-admin", () => ({
  TRADE_PROMOTION_ACTIONS: ["approve", "reject", "pause", "resume", "end"],
  runTradePromotionAction: (...a: unknown[]) => runTradePromotionAction(...a),
}));
vi.mock("@/lib/ads/advertising-admin-memo", () => ({
  persistAdvertisingAdminMemo: (...a: unknown[]) => (persistAdvertisingAdminMemo as (...x: unknown[]) => unknown)(...a),
}));
vi.mock("@/lib/admin/advertising-workspace/workspace-memo-gate", () => ({
  advertisingWorkspaceMemoTargetType: (f: string) => `advertising:${f}`,
}));

import { POST } from "@/app/api/admin/trade/promotions/[id]/route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
function req(body: unknown) {
  return new Request(`https://x.test/api/admin/trade/promotions/${ID}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  runTradePromotionAction.mockResolvedValue({ ok: true, data: { order_status: "active" } });
});

describe("AD2-01 거래 상위노출 승인 사유", () => {
  it("사유 없이 승인 → 400 reason_required (예전: 통과)", async () => {
    const res = await POST(req({ action: "approve" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("reason_required");
    expect(runTradePromotionAction).not.toHaveBeenCalled();
  });

  it("사유 있는 승인 → DB 함수에 사유 전달", async () => {
    const res = await POST(req({ action: "approve", reason: "내용 확인 완료" }), ctx);
    expect(res.status).toBe(200);
    expect(runTradePromotionAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "approve", reason: "내용 확인 완료" })
    );
  });
});

describe("D-10 거래 상위노출 내부 메모 분리", () => {
  it("정지: 공개 사유만 DB 함수(회원 알림)로 · 내부 메모는 운영자 메모로만 · 응답에 내부 메모 0", async () => {
    const res = await POST(req({ action: "pause", reason: "점검 중", internalReason: "신고 누적 내부 확인" }), ctx);
    expect(res.status).toBe(200);
    const call = runTradePromotionAction.mock.calls[0]![1] as Record<string, unknown>;
    expect(call.reason).toBe("점검 중");
    expect(JSON.stringify(call)).not.toContain("신고 누적");
    expect(persistAdvertisingAdminMemo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "internal", targetType: "advertising:boost_trade", memo: "[pause] 신고 누적 내부 확인" })
    );
    expect(JSON.stringify(await res.json())).not.toContain("신고 누적");
  });

  it("종료 미리보기에는 내부 메모를 저장하지 않는다", async () => {
    await POST(req({ action: "end", fault: "operator", preview: true, internalReason: "메모" }), ctx);
    expect(persistAdvertisingAdminMemo).not.toHaveBeenCalled();
  });
});
