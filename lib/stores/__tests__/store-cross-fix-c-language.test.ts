import "@/lib/i18n/admin-catalog";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import { buildBrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { describeStoreOrderAudit } from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import { translateUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";

const HANGUL = /[가-힣]/;

describe("매장 교차 수정 C — 요청 언어·옛 문장 (재감사 2026-11-27)", () => {
  it("서버 호출처가 넘긴 언어로 조리 시간 기본 라벨을 만든다", () => {
    expect(parseCommerceExtrasFromHoursJson({}, "ko").estPrepLabel).toBe(translate("ko", "store_prep_default_range"));
    expect(HANGUL.test(parseCommerceExtrasFromHoursJson({}, "ko").estPrepLabel)).toBe(true);
    expect(HANGUL.test(parseCommerceExtrasFromHoursJson({}, "en").estPrepLabel)).toBe(false);
    expect(buildBrowseStoreCommerceSnapshot({ prep_time_minutes: 25 }, "ko").estPrepLabel).toBe(
      parseCommerceExtrasFromHoursJson({ prep_time_minutes: 25 }, "ko").estPrepLabel
    );
    expect(HANGUL.test(buildBrowseStoreCommerceSnapshot({}, "en").estPrepLabel)).toBe(false);
  });

  it("관리자 주문 기록: 옛 기본 거절 문장 「Rejected by admin」 은 사유 없음", () => {
    const v = describeStoreOrderAudit(
      { action: "store_order.admin_reject_cancel_request", after_json: { rejected_reason: "Rejected by admin" } },
      false
    );
    expect(v.reason).toBeNull();
    const human = describeStoreOrderAudit(
      { action: "store_order.admin_reject_cancel_request", after_json: { rejected_reason: "재고 확인 필요" } },
      true
    );
    expect(human.reason).toBe("재고 확인 필요");
  });

  it("주소 API invalid_ph_phone → 휴대전화 규칙 키", () => {
    expect(translateUserAddressApiError("invalid_ph_phone", (k) => translate("en", k))).toBe(
      translate("en", "phone_rule")
    );
  });
});
