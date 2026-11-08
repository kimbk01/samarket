/**
 * 언어 SSOT S9 (Owner 「권장대로 승인」 2026-11-08) — 어드민 영어만 고쳤다.
 * 두 카탈로그의 **한국어 값은 S9 전과 같아야 한다**(미사용 40키 삭제 외 변경 0). 지문 = 정렬한 [키, 값] 의 SHA-256.
 * 계획·결과: `docs/audit/i18n-s9-admin-english-plan-2026-11-08.md`
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminMiscMessages } from "@/lib/i18n/catalog/admin-misc";
import { adminOpsToolsMessages } from "@/lib/i18n/catalog/admin-ops-tools";

function fingerprint(ko: Record<string, string>): string {
  const entries = Object.entries(ko).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

describe("S9 어드민 카탈로그 한국어 무변경", () => {
  it("admin-misc 한국어 706키 = S9 전과 같음", () => {
    expect(Object.keys(adminMiscMessages.ko)).toHaveLength(706);
    expect(fingerprint(adminMiscMessages.ko)).toBe("ff8bae480f82d672e9e6a216ec2859efe93c57af66cee6fd587bece813e831aa");
  });

  it("admin-ops-tools 한국어 492키 = S9 전 532키 − 미사용 40키, 값 같음", () => {
    expect(Object.keys(adminOpsToolsMessages.ko)).toHaveLength(492);
    expect(fingerprint(adminOpsToolsMessages.ko)).toBe("9a481c0a4cb0ae507e4ae45ee1b1d493b13e03afbbb72695979f60cf1a567381");
  });

  it("두 카탈로그 ko·en 키 집합이 같다", () => {
    for (const m of [adminMiscMessages, adminOpsToolsMessages]) {
      expect(Object.keys(m.en).sort()).toEqual(Object.keys(m.ko).sort());
    }
  });
});
