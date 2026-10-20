import { describe, expect, it } from "vitest";
import { classifyGiftInstanceDetailResponse } from "@/lib/gift-certificate/gift-instance-detail-load-state";
import { formatMypageMoney } from "@/lib/mypage/format-mypage-date";

describe("S45 상품권 상세 응답 분류 — 무한 로딩 금지", () => {
  it("403 수령 대기 · 404 없음 · ok:false 없음 · 5xx/JSON 깨짐 오류 · 정상", () => {
    expect(classifyGiftInstanceDetailResponse(403, null)).toEqual({ kind: "forbidden" });
    expect(classifyGiftInstanceDetailResponse(404, { ok: false })).toEqual({ kind: "not_found" });
    expect(classifyGiftInstanceDetailResponse(200, { ok: false })).toEqual({ kind: "not_found" });
    expect(classifyGiftInstanceDetailResponse(500, { ok: false, error: "x" })).toEqual({ kind: "error" });
    expect(classifyGiftInstanceDetailResponse(200, null)).toEqual({ kind: "error" });
    const inst = { id: "g1" };
    expect(classifyGiftInstanceDetailResponse(200, { ok: true, instance: inst })).toEqual({ kind: "ok", instance: inst });
  });

  it("상세·사용 내역 금액은 formatMypageMoney(₱ SSOT)", () => {
    expect(formatMypageMoney(1500)).toMatch(/1,500/);
    expect(formatMypageMoney(1500)).toContain("₱");
  });
});
