import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPhoneForAdminManualVerify } from "@/lib/profile/admin-phone-verification-sync";

/** 관리자 수동 인증 = 전화번호 필수 (Owner 승인 2026-10-20) */
describe("hasPhoneForAdminManualVerify", () => {
  it("저장된 번호가 없으면 인증 불가", () => {
    expect(hasPhoneForAdminManualVerify(null)).toBe(false);
    expect(hasPhoneForAdminManualVerify({ phone: null, phone_country_code: null, phone_number: null })).toBe(false);
    expect(hasPhoneForAdminManualVerify({ phone: "", phone_country_code: "+63", phone_number: "" })).toBe(false);
  });

  it("저장된 필리핀 휴대폰 번호가 있으면 인증 가능", () => {
    expect(hasPhoneForAdminManualVerify({ phone: "09171234567", phone_country_code: "+63", phone_number: null })).toBe(true);
  });

  it("같은 요청에서 저장할 번호가 우선 — 비우면 인증 불가, 넣으면 인증 가능", () => {
    const row = { phone: "09171234567", phone_country_code: "+63", phone_number: null };
    expect(hasPhoneForAdminManualVerify(row, { phone: null, phone_country_code: null, phone_number: null })).toBe(false);
    expect(hasPhoneForAdminManualVerify(null, { phone: "09181234567", phone_country_code: "+63", phone_number: null })).toBe(true);
  });

  it("관리자 승인 경로 2곳 모두 번호 확인 후 phone_required", () => {
    for (const f of ["app/api/admin/users/[id]/phone-verification/route.ts", "app/api/admin/users/[id]/route.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).toContain("hasPhoneForAdminManualVerify(");
      expect(src).toContain('"phone_required"');
    }
  });
});

describe("MandatoryAddressGate 마운트", () => {
  it("메인 셸 provider 트리에 마운트", () => {
    const src = readFileSync(join(process.cwd(), "components/layout/MainAppProviderTree.tsx"), "utf8");
    expect(src).toContain("<MandatoryAddressGate />");
  });
});
