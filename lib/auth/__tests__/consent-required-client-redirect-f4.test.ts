/**
 * F4 (2026-11-27) — 화면: 서버 동의 미완 거절(403 signup_incomplete, step 없음)은 동의 화면으로.
 * 가입 진행 중 거절(step phone·address)과 섞지 않는다.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isConsentRequiredApiRejection, redirectForBlockedAction } from "@/lib/auth/client-access-flow";

describe("F4 — isConsentRequiredApiRejection", () => {
  it("403 signup_incomplete + step 없음만 동의 거절", () => {
    expect(isConsentRequiredApiRejection(403, { code: "signup_incomplete" })).toBe(true);
    expect(isConsentRequiredApiRejection(403, { code: "signup_incomplete", step: "phone" })).toBe(false);
    expect(isConsentRequiredApiRejection(403, { code: "signup_incomplete", step: "address" })).toBe(false);
    expect(isConsentRequiredApiRejection(400, { code: "signup_incomplete" })).toBe(false);
    expect(isConsentRequiredApiRejection(403, { code: "phone_duplicate" })).toBe(false);
    expect(isConsentRequiredApiRejection(403, null)).toBe(false);
  });

  it("redirectForBlockedAction 은 동의 화면으로 replace 한다", () => {
    const replace = vi.fn();
    expect(redirectForBlockedAction({ push: vi.fn(), replace }, "signup_incomplete", "/mypage/profile/edit")).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]![0])).toBe("/auth/onboarding/terms?next=%2Fmypage%2Fprofile%2Fedit");
  });

  it("전화 인증 상자(발송·확인)·주소 새 등록이 동의 거절을 동의 화면으로 보낸다", () => {
    const box = readFileSync("components/mypage/profile/PhoneVerificationBox.tsx", "utf8");
    expect(box.match(/isConsentRequiredApiRejection\(res\.status, json\)/g)?.length).toBe(2);
    expect(box.match(/redirectForBlockedAction\(router, "signup_incomplete"\)/g)?.length).toBe(2);
    const addr = readFileSync("components/addresses/AddressPlatformDetailClient.tsx", "utf8");
    expect(addr).toContain("isConsentRequiredApiRejection(res.status, j)");
    expect(addr).toContain('redirectForBlockedAction(router, "signup_incomplete")');
  });
});
