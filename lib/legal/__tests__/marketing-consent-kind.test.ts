/**
 * 혜택·이벤트 수신 동의(선택) 문서 — 어드민 약관 관리에서 수정 (Owner 2026-11-03).
 * 선택 동의는 필수 재동의 게이트에 들어가지 않는다.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { APP_LEGAL_KINDS, APP_LEGAL_KIND_LABEL, isAppLegalKind } from "@/lib/legal/app-legal-documents";
import { MARKETING_CONSENT_DEFAULT, MARKETING_CONSENT_DOC_PATH } from "@/lib/legal/marketing-consent-default";
import { isAuthEntryPath } from "@/lib/auth/auth-route-classification";

const root = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("marketing 문서 종류", () => {
  it("어드민 문서 종류에 marketing 이 있고 이름이 있다", () => {
    expect(APP_LEGAL_KINDS).toContain("marketing");
    expect(isAppLegalKind("marketing")).toBe(true);
    expect(APP_LEGAL_KIND_LABEL.marketing.ko).toContain("혜택·이벤트");
  });

  it("필수 재동의 버전은 약관·개인정보만 읽는다 (선택 동의는 게이트 밖)", () => {
    const src = read("lib/legal/resolve-required-consent-versions.ts");
    expect(src).not.toMatch(/"marketing"/);
  });

  it("마이그레이션 첫 문서 = 기본 문구 (어드민 첫 화면과 앱 기본값이 같다)", () => {
    const sql = read("supabase/migrations/20271103235000_marketing_consent.sql");
    for (const loc of ["ko", "en"] as const) {
      expect(sql).toContain(MARKETING_CONSENT_DEFAULT[loc].title);
      for (const para of MARKETING_CONSENT_DEFAULT[loc].body.split("\n\n")) expect(sql).toContain(para);
    }
    expect(sql).toContain("CHECK (kind IN ('terms', 'privacy', 'marketing'))");
  });

  it("전문 화면은 가입 동의 전에도 열린다", () => {
    expect(isAuthEntryPath(MARKETING_CONSENT_DOC_PATH)).toBe(true);
  });
});

describe("가입 동의 화면", () => {
  it("선택 체크박스는 처음 체크 안 됨 · 기록 없는 회원에게만", () => {
    const form = read("components/auth/AuthConsentForm.tsx");
    expect(form).toMatch(/const \[agreeMarketing, setAgreeMarketing\] = useState\(false\)/);
    const page = read("app/auth/onboarding/terms/page.tsx");
    expect(page).toMatch(/readMemberMarketingConsent\(readSb, user\.id\)\)\?\.source == null/);
  });

  it("동의 API 는 기록이 없을 때만 signup 으로 저장", () => {
    const api = read("app/api/me/legal-consent/route.ts");
    expect(api).toContain('if (current?.source) return null;');
    expect(api).toContain('source: "signup"');
  });
});
