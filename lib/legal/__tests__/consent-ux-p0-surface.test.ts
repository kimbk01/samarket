import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LEGAL_KINDS, isAppLegalKind } from "@/lib/legal/app-legal-documents";

const root = process.cwd();

describe("consent UX P0 surface (Owner mockup 2026-11-05)", () => {
  it("legal kinds include optional marketing; required gate stays terms+privacy+age", () => {
    // store_partner_terms = 매장 입점·수수료 약관 (2026-11-10) — 회원 동의 게이트와 무관 (아래 resolve 검사)
    expect(APP_LEGAL_KINDS).toEqual(["terms", "privacy", "marketing", "store_partner_terms"]);
    expect(isAppLegalKind("marketing")).toBe(true);
    const resolve = readFileSync(path.join(root, "lib/legal/resolve-required-consent-versions.ts"), "utf8");
    expect(resolve).not.toMatch(/marketing/);
    expect(resolve).not.toMatch(/store_partner/);
    const gate = readFileSync(path.join(root, "lib/legal/has-required-member-consents.ts"), "utf8");
    expect(gate).toContain("hasAgeGateConsent");
  });

  it("AuthConsentForm: all-agree + age DOB + in-app sheet + marketing optional", () => {
    const src = readFileSync(path.join(root, "components/auth/AuthConsentForm.tsx"), "utf8");
    expect(src).toContain("auth_consent_all_label");
    expect(src).toContain("attestAge");
    expect(src).toContain("dateOfBirth");
    expect(src).toContain("ConsentLegalDocSheet");
    // Marketing = main SSOT: only when the page asks (no prior record), sent with the doc version.
    expect(src).toContain("...(marketing ? { agreeMarketing, marketingVersion: marketing.version } : {})");
    expect(src).toContain("...(needsAge ? { attestAge: true, dateOfBirth } : {})");
    expect(src).not.toContain('target="_blank"');
  });

  it("AuthConsentForm DOB = year·month·day selects; submit never silently disabled (Owner 2026-11-09)", () => {
    const src = readFileSync(path.join(root, "components/auth/AuthConsentForm.tsx"), "utf8");
    expect(src).not.toContain('type="date"');
    expect(src).toContain('data-testid="auth-consent-dob-year"');
    expect(src).toContain('data-testid="auth-consent-dob-month"');
    expect(src).toContain('data-testid="auth-consent-dob-day"');
    // 빠진 항목이 있어도 버튼은 눌리고, 이유를 보여 준다.
    expect(src).toContain("disabled={submitting}");
    expect(src).not.toContain("requiredOk");
    expect(src).toContain('safeT("auth_consent_age_check_required")');
    expect(src).toContain('safeT("auth_consent_dob_required")');
  });

  it("PhoneVerificationBox: 텔레그램형 — 국가 줄·번호 한 줄·[계속] → 6칸 인증번호 → 완료 (Owner 2026-11-09)", () => {
    const src = readFileSync(path.join(root, "components/mypage/profile/PhoneVerificationBox.tsx"), "utf8");
    expect(src).toContain('data-testid="phone-verify-country-code"');
    expect(src).toContain('data-testid="phone-verify-number"');
    expect(src).toContain('autoComplete="tel"');
    expect(src).toContain('t("my_phone_number_placeholder")');
    expect(src).not.toContain("PH_MOBILE_PLUS63_PLACEHOLDER");
    // 국가 = 목록 화면(라디오) — 기기 기본 드롭다운(select) 금지(iOS)
    expect(src).not.toContain("<select");
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain('data-testid="phone-verify-country-list"');
    // 중복 안내 없음 · 번호는 친 그대로 받음 · 입력 즉시 형식 판정 · 형식 맞을 때만 [계속]
    expect(src).not.toContain("phone-verify-country-notice");
    expect(src).toContain("sanitizePhoneTyping");
    expect(src).toContain('data-testid="phone-verify-format-error"');
    expect(src).toContain("sending || !validPhone");
    expect(src).toContain('t("my_phone_tg_continue")');
    // 인증번호 = 보낸 뒤 다음 화면 · 6칸 · 6번째 숫자에서 자동 확인 · [번호 변경]
    expect(src).toContain('setStep("code")');
    expect(src).toContain("otp.length !== PHONE_OTP_CODE_LENGTH");
    expect(src).toContain('data-testid="phone-verify-change-number"');
    // 확인 성공 즉시 완료 화면(재조회 대기 없음)
    expect(src).toContain("setJustVerified(true)");
    expect(src).toContain('data-testid="phone-verify-done"');
    // 시트 안 중복 제목 없음
    expect(src).toContain("{ov ? null : <p");
    // 버튼 누름 진동·소리(공용 light-tap-feedback), 결과는 success/error 진동
    expect(src).toContain('triggerInteractionFeedback("light"');
    expect(src).toContain('triggerInteractionFeedback("success")');
    expect(src).toContain('triggerInteractionFeedback("error")');
  });

  it("legal-consent PATCH uses atomic RPC (no soft-skip required ledger)", () => {
    const src = readFileSync(path.join(root, "app/api/me/legal-consent/route.ts"), "utf8");
    expect(src).toContain("recordRequiredMemberConsentServer");
    expect(src).toContain("evaluateAgeAttestationInput");
    expect(src).not.toContain("appendMemberConsentEvents(");
  });

  it("admin surfaces: version compare + policy + member consents", () => {
    const list = readFileSync(path.join(root, "components/admin/app/AdminAppLegalDocumentsPage.tsx"), "utf8");
    expect(list).toContain("AdminLegalVersionCompare");
    expect(list).toContain("/admin/app/legal/policy");
    expect(list).toContain("/admin/app/legal/member-consents");
  });

  it("migration includes age columns + atomic RPC", () => {
    const mig = readFileSync(
      path.join(root, "supabase/migrations/20271105120100_member_consent_events_and_marketing_legal.sql"),
      "utf8",
    );
    expect(mig).toContain("member_consent_events");
    expect(mig).toContain("record_member_required_consent");
    expect(mig).toContain("date_of_birth");
    expect(mig).toContain("DO NOT apply to Production without Owner approval");
  });

  it("security + hardening SQL: service_role only, fixed legacy set, no marketing writes, no child DOB", () => {
    const sec = readFileSync(
      path.join(root, "supabase/migrations/20271105130000_member_consent_execute_revoke.sql"),
      "utf8",
    );
    expect(sec).toMatch(/REVOKE EXECUTE ON FUNCTION public\.record_member_required_consent\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sec).toContain("ON public.member_consent_events FROM PUBLIC, anon, authenticated");

    const hard = readFileSync(
      path.join(root, "supabase/migrations/20271105140000_member_consent_hardening.sql"),
      "utf8",
    );
    expect(hard).toContain("CREATE TABLE IF NOT EXISTS public.member_age_gate_legacy_members");
    expect(hard).toContain("legacy_set_count_mismatch");
    expect(hard).toContain("FOR UPDATE");
    expect(hard).toContain("'age_gate_legacy', EXISTS");
    expect(hard).not.toMatch(/user_notification_settings/);
    // Under-14: refused with no write; no retry window (Owner 2026-11-05: 7-day limit not approved).
    expect(hard).toContain("RETURN jsonb_build_object('ok', false, 'code', 'age_under_minimum');");
    expect(hard).not.toMatch(/cooldown|blocked_underage/);
    expect(hard).toContain("BEFORE UPDATE ON public.member_consent_events");
    expect(hard).not.toContain("admin_reset_member_age_block");
    for (const fn of [
      "record_member_required_consent(\n  uuid, text, text, date, text, boolean, text, boolean\n) FROM PUBLIC, anon, authenticated",
      "member_write_gate_snapshot(uuid) FROM PUBLIC, anon, authenticated",
    ]) {
      expect(hard).toContain(fn);
    }
  });
});
