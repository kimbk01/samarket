import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  detectStoredPhoneCountry,
  formatKoreaMobileLocal,
  parseKoreaMobileLocal,
  resolveVerifyPhone,
} from "@/lib/phone/verify-phone-number";
import { parseVerifyDialCodes, phoneVerifyCountryOptionsFor } from "@/lib/phone/phone-country-codes";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import { resolveProfilePhoneDb09, resolveProfilePhoneStored } from "@/lib/profile/resolve-profile-phone";
import { adminPhoneWithCountry } from "@/lib/phone/admin-phone-country-display";
import { buildSolapiAuthorization } from "@/lib/auth/solapi-sms";

describe("resolveVerifyPhone — +63 Semaphore · +82 Solapi · 그 외 거절 (Owner 2026-11-09)", () => {
  it("필리핀: 09·+63·9 표기 모두 같은 번호, 저장은 기존 09 형식", () => {
    for (const raw of ["09171234567", "+639171234567", "+63 917 123 4567", "9171234567"]) {
      const r = resolveVerifyPhone(raw);
      expect(r?.country).toBe("PH");
      expect(r?.provider).toBe("semaphore_local");
      expect(r?.e164).toBe("+639171234567");
      expect(r?.storage).toEqual({ phone: "09171234567", phone_country_code: "+63", phone_number: "9171234567" });
    }
  });

  it("한국: +82 로 시작하면 한국, 저장은 E.164", () => {
    for (const raw of ["+821012345678", "+82 10-1234-5678", "+82 010 1234 5678", "821012345678"]) {
      const r = resolveVerifyPhone(raw);
      expect(r?.country).toBe("KR");
      expect(r?.provider).toBe("solapi");
      expect(r?.e164).toBe("+821012345678");
      expect(r?.storage).toEqual({ phone: "+821012345678", phone_country_code: "+82", phone_number: "1012345678" });
    }
  });

  it("다른 나라·형식 오류는 거절", () => {
    for (const raw of ["+12025550123", "+6591234567", "+8613812345678", "+82 02 123 4567", "0812345678", ""]) {
      expect(resolveVerifyPhone(raw)).toBeNull();
    }
  });

  it("한국 국내 표기 파싱·표시", () => {
    expect(parseKoreaMobileLocal("010-1234-5678")).toBe("01012345678");
    expect(parseKoreaMobileLocal("1012345678")).toBe("01012345678");
    expect(parseKoreaMobileLocal("02-123-4567")).toBeNull();
    expect(formatKoreaMobileLocal("01012345678")).toBe("010 1234 5678");
    expect(formatKoreaMobileLocal("0101234")).toBe("010 1234");
  });
});

describe("저장 번호 표시 — 한국·필리핀 구분", () => {
  it("프로필 표시·나라 판정", () => {
    expect(formatProfilePhoneForDisplay({ phone: "+821012345678" })).toBe("+82 10 1234 5678");
    expect(formatProfilePhoneForDisplay({ phone: "09171234567" })).toBe("+63 917 123 4567");
    expect(resolveProfilePhoneDb09({ phone: "+821012345678", phone_country_code: "+82", phone_number: "1012345678" })).toBeNull();
    expect(resolveProfilePhoneStored({ phone: "+821012345678" })).toBe("+821012345678");
    expect(detectStoredPhoneCountry({ phone: "+821012345678" })).toBe("KR");
    expect(detectStoredPhoneCountry({ phone: "09171234567" })).toBe("PH");
  });

  it("어드민 표시에 나라 라벨", () => {
    const name = (c: "PH" | "KR") => (c === "KR" ? "KR-name" : "PH-name");
    expect(adminPhoneWithCountry("+821012345678", name)).toBe("🇰🇷 KR-name · +82 10 1234 5678");
    expect(adminPhoneWithCountry("09171234567", name)).toBe("🇵🇭 PH-name · +63 917 123 4567");
    expect(adminPhoneWithCountry("", name)).toBe("");
  });
});

describe("국가번호 목록 — 서버가 허용한 것만", () => {
  it("Solapi 미설정이면 +63 만", () => {
    expect(parseVerifyDialCodes(undefined)).toEqual(["+63"]);
    expect(parseVerifyDialCodes(["+63", "+1"])).toEqual(["+63"]);
    expect(phoneVerifyCountryOptionsFor(["+63", "+82"]).map((c) => c.dialCode)).toEqual(["+63", "+82"]);
  });
});

describe("Solapi 인증 헤더 — 공식 SDK 와 같은 서명", () => {
  it("HMAC-SHA256(secret, date+salt) hex", () => {
    const now = new Date("2026-11-09T00:00:00.000Z");
    const header = buildSolapiAuthorization("KEY", "SECRET", now);
    const m = /^HMAC-SHA256 apiKey=KEY, date=(\S+), salt=([0-9A-Za-z]{32}), signature=([0-9a-f]{64})$/.exec(header);
    expect(m).not.toBeNull();
    const [, date, salt, sig] = m!;
    expect(date).toBe("2026-11-09T00:00:00Z");
    expect(sig).toBe(createHmac("sha256", "SECRET").update(date! + salt!).digest("hex"));
  });
});
