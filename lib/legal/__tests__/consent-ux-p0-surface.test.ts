import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_LEGAL_KINDS, isAppLegalKind } from "@/lib/legal/app-legal-documents";

const root = process.cwd();

describe("consent UX P0 surface (Owner mockup 2026-11-05)", () => {
  it("legal kinds include optional marketing; required gate stays terms+privacy+age", () => {
    expect(APP_LEGAL_KINDS).toEqual(["terms", "privacy", "marketing"]);
    expect(isAppLegalKind("marketing")).toBe(true);
    const resolve = readFileSync(path.join(root, "lib/legal/resolve-required-consent-versions.ts"), "utf8");
    expect(resolve).not.toMatch(/marketing/);
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

  it("PhoneVerificationBox: country code and number are separate fields with device autofill", () => {
    const src = readFileSync(path.join(root, "components/mypage/profile/PhoneVerificationBox.tsx"), "utf8");
    expect(src).toContain('data-testid="phone-verify-country-code"');
    expect(src).toContain('data-testid="phone-verify-number"');
    expect(src).toContain('autoComplete="tel"');
    expect(src).toContain('t("my_phone_number_placeholder")');
    expect(src).not.toContain("PH_MOBILE_PLUS63_PLACEHOLDER");
    // 국가번호 = 버튼(라디오) — 기기 기본 드롭다운 금지(iOS), 안내는 오류 때 숨김
    expect(src).not.toContain("<select");
    expect(src).toContain('role="radiogroup"');
    expect(src).toContain("{error ? null : (");
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
