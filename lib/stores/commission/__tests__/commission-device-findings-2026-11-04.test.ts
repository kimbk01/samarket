import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  commissionOrderStatusLabel,
  commissionOrderStatusLine,
  commissionPaymentMethodLabel,
  commissionPolicyScopeLabel,
} from "@/lib/stores/commission/store-commission-display-labels";
import { loadStoreCommissionLedgerPage } from "@/lib/stores/commission/load-store-commission-ledger";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("실기 발견 결함 1 — 수수료 표·상세 영문 코드 → 한국어 (2026-11-04)", () => {
  it("운영 실기 값 preparing · cod · category 가 그대로 나오지 않는다", () => {
    const status = commissionOrderStatusLabel("preparing", "local_delivery", "ko");
    expect(status).not.toBe("preparing");
    expect(status).not.toMatch(/[a-z_]{4,}/);
    const pm = commissionPaymentMethodLabel("cod", "ko");
    expect(pm).not.toBe("cod");
    expect(commissionPolicyScopeLabel("category", "ko")).toBe("1차 업종 정책");
    expect(commissionPolicyScopeLabel("store", "ko")).toBe("매장 개별 정책");
    expect(commissionPolicyScopeLabel("default", "ko")).toBe("기본");
    // 모르는 값은 숨기지 않고 그대로
    expect(commissionPolicyScopeLabel("brand_new_scope", "ko")).toBe("brand_new_scope");
    expect(commissionOrderStatusLine({ orderStatus: "cancelled", paymentMethod: "cod", fulfillmentType: "local_delivery" }, "ko")).not.toMatch(
      /cancelled|cod/
    );
  });

  it("표·상세·처리 이력·정책·부과 시점이 표기 함수를 쓴다 (원래 값 직접 출력 금지)", () => {
    const table = read("components/stores/commission/StoreCommissionLedgerTable.tsx");
    expect(table).not.toContain('{r.orderStatus || "—"}');
    expect(table).not.toContain("{row.storeName} · {row.orderStatus}");
    expect(table).not.toContain("${row.chargeStage} 진입");
    expect(table).not.toContain("(${b.scope})");
    expect(table).toContain("commissionOrderStatusLine(r, lang)");
    const parts = read("components/stores/commission/StoreCommissionLedgerParts.tsx");
    expect(parts).not.toContain("{row.chargeStage} ·");
  });

  it("사장님 화면 결정 이력에는 관리자 id 대신 「운영팀」", () => {
    const table = read("components/stores/commission/StoreCommissionLedgerTable.tsx");
    expect(table).toMatch(/audience === "owner"\s*\?\s*` · \$\{pickCommissionCopy\(lang, "운영팀", "Operations"\)\}`/);
  });

  it("목록 로더가 그 쪽 주문의 배달·픽업 구분을 붙인다 (DB 함수 변경 없음)", async () => {
    const inFn = vi.fn(async () => ({ data: [{ id: "o1", fulfillment_type: "pickup" }], error: null }));
    const sb = {
      rpc: async () => ({
        data: {
          total: 1,
          summary: {},
          rows: [{ id: "f1", order_id: "o1", order_no: "SO1", order_status: "completed", buyer_payment_method: "cod", store_id: "s1", charge_stage: "preparing" }],
        },
        error: null,
      }),
      from: () => ({ select: () => ({ in: inFn }) }),
    } as unknown as SupabaseClient;
    const page = await loadStoreCommissionLedgerPage(sb, {
      storeIds: ["s1"], fromIso: null, toIso: null, state: "all", orderNo: null, limit: 20, offset: 0,
    });
    expect(page.rows[0]?.fulfillmentType).toBe("pickup");
    expect(inFn).toHaveBeenCalledTimes(1);
  });
});

describe("실기 발견 결함 2 — 「환급」 칸 = 캐시 환급 + 미납 취소 혼합 → 두 칸", () => {
  it("표 머리글·칸이 캐시 환급과 미납 취소로 나뉜다 (위 합계 칸과 같은 말)", () => {
    const table = read("components/stores/commission/StoreCommissionLedgerTable.tsx");
    expect(table).toContain('pickCommissionCopy(lang, "캐시 환급", "Cash refunded")');
    expect(table).toContain('pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")');
    expect(table).not.toContain('pickCommissionCopy(lang, "환급", "Refunded")');
    expect(table).not.toContain("refundedMinor(r) > 0 ? formatCashMinor(refundedMinor(r))");
  });
});

describe("실기 발견 결함 6 — 관리자 수수료 카드: 받기 전·실패를 0 으로 보이지 않음", () => {
  it("카드 상태(불러오는 중/실패)를 따로 두고, 실패를 숨기지 않는다", () => {
    const src = read("components/admin/stores/AdminStoreCommissionLedgerPage.tsx");
    expect(src).toContain("headlineNotReadyCopy");
    expect(src).toContain('setHeadlineStatus({ ledger: "error", integrity: "error" })');
    expect(src).not.toContain("setHeadline((h) => ({ ...h }))");
    expect(src).toContain("ledgerReady ? formatCashMinor(headOutstanding)");
  });
});

describe("실기 발견 결함 4 — 회원 포인트 화면 날짜 표기 하나로 (필리핀 시간 고정)", () => {
  it("충전 목록 취소 시각·만료 예정 화면이 formatMypageDate 를 쓴다", () => {
    const list = read("components/points/PointChargeRequestList.tsx");
    expect(list).not.toContain("formatPointChargePht");
    const expire = read("components/points/PointExpireList.tsx");
    expect(expire).not.toMatch(/toLocale(Date)?String\("ko-KR"\)/);
    expect(expire).toContain("formatMypageDate(e.expiresAt");
  });
});
