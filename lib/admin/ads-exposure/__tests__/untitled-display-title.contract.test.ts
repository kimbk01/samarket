import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { describe, expect, it } from "vitest";
import {
  isPlatformPopupUntitledName,
  popupOperationalDisplayTitle,
} from "@/lib/admin/ads-exposure/untitled-display-title";

describe("popup operational display title", () => {
  it("recognizes legacy auto-generated names", () => {
    expect(isPlatformPopupUntitledName("새 팝업 캠페인")).toBe(true);
    expect(isPlatformPopupUntitledName("Untitled popup")).toBe(true);
    expect(isPlatformPopupUntitledName("New popup campaign")).toBe(true);
    expect(isPlatformPopupUntitledName("9월 배달 팝업")).toBe(false);
  });

  it("projects a stable operational title for legacy untitled rows", () => {
    expect(
      popupOperationalDisplayTitle({
        name: "새 팝업 캠페인",
        id: "12345678-abcd",
        updatedAt: "2026-09-07T00:00:00.000Z",
        ko: true,
      })
    ).toBe("팝업 · 09/07 · 12345678");
  });
});
