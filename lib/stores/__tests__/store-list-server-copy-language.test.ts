import { describe, expect, it } from "vitest";
import { localizedStorePrepLabel } from "@/lib/stores/store-delivery-eta-label";
import { translate } from "@/lib/i18n/messages";

/** 재감사 2026-11-08 — 매장 목록 API 가 언어와 상관없이 한국어로 보내던 칸 */
describe("매장 목록 서버 문구 = 요청 언어", () => {
  it("조리 시간: 분 숫자가 있으면 요청 언어, 없으면 사장님이 적은 글 그대로", () => {
    expect(localizedStorePrepLabel({ prepMinutes: 30, estPrepLabel: "30분" }, "en")).toBe("30 min");
    expect(localizedStorePrepLabel({ prepMinutes: 30, estPrepLabel: "30분" }, "ko")).toBe("30분");
    expect(localizedStorePrepLabel({ prepMinutes: null, estPrepLabel: "20~40분" }, "en")).toBe("20~40분");
  });
  it("위치 미등록 키 ko·en", () => {
    expect(translate("ko", "store_location_unregistered")).toBe("위치 미등록");
    expect(translate("en", "store_location_unregistered")).toBe("Location not set");
  });
});
