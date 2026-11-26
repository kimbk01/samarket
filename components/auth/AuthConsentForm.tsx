"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { RegistrationPageShell } from "@/components/auth/RegistrationPageShell";
import { MY_STICKY_CTA_PRIMARY_BUTTON_CLASS } from "@/components/mypage/ds/MyStickyCta";
import { ConsentLegalDocSheet } from "@/components/legal/ConsentLegalDocSheet";
import { AUTH_GATE_DIALOG_Z_CLASS } from "@/components/auth/AuthGateOverlay";
import { getSupabaseClient } from "@/lib/supabase/client";
import { runBrowserAuthRefreshDeduped } from "@/lib/supabase/auth-refresh-telemetry";
import { invalidateMeProfileDedupedCache, fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ProfileRow } from "@/lib/profile/types";
import { markSignupConsentResolvedSession } from "@/lib/auth/signup-gate-session";
import {
  REGISTRATION_DONE_DEFAULT_PATH,
  registrationStepHref,
  resolveRegistrationReturnPath,
} from "@/lib/auth/dibay-registration-steps";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { notifyLegalConsentCompleted } from "@/lib/auth/client-consent-state";
import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";
import type { RequiredConsentGap } from "@/lib/legal/has-required-member-consents";
import type { AppLegalKind } from "@/lib/legal/app-legal-documents";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import { DIBAY_ONBOARDING_NOTICE_CLASS } from "@/lib/ui/dibay-onboarding-styles";

/**
 * Owner-approved consent UX (mockup 2026-11-05).
 * Required: terms + privacy (+ age 14+ with DOB for members after the age policy). Optional: marketing (default off).
 * Legal docs open in an in-app sheet (checkbox state preserved).
 */
export function AuthConsentForm({
  requiredVersions,
  marketing,
  consentGap = "terms_privacy_and_age",
  priorConsent = false,
}: {
  /** Versions the server required when this screen rendered — sent back so a stale screen cannot record a newer version (P7). */
  requiredVersions?: { termsVersion: string; privacyVersion: string } | null;
  /**
   * 혜택·이벤트 수신 동의(선택) — 동의 기록이 없는 회원에게만 (Owner 2026-11-03). 문구 = 어드민 marketing 문서.
   * null = 묻지 않음(이미 기록 있음 · 약관 개정 재동의).
   */
  marketing?: { version: string; title: { ko: string; en: string } } | null;
  /** Server-decided missing items. Pre-policy members never get an age gap. */
  consentGap?: Exclude<RequiredConsentGap, null>;
  /** Member already accepted terms once — reconsent / age-only (in-session), not first signup. */
  priorConsent?: boolean;
} = {}) {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  /**
   * 돌아갈 화면 — 가입 흐름 단일 판정(전체 감사 A3·A5). 없으면 신규 가입은 앱 홈,
   * 이미 가입한 회원의 약관 개정 재동의는 로그인 착지 `/mypage` 그대로(2026-11-25 후속 결정 1).
   */
  const next = resolveRegistrationReturnPath(
    searchParams.get("next"),
    priorConsent ? POST_LOGIN_PATH : REGISTRATION_DONE_DEFAULT_PATH,
  );

  const needsLegal = consentGap !== "age";
  const needsAge = consentGap !== "terms_privacy";
  const ageOnly = consentGap === "age";
  const isReconsent = priorConsent && !ageOnly;

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(!needsLegal);
  const [agreePrivacy, setAgreePrivacy] = useState(!needsLegal);
  const [attestAge, setAttestAge] = useState(!needsAge);
  /** 생년월일 — 년·월·일 선택 3칸 (Owner 2026-11-09 「선택 형식」). 서버에는 YYYY-MM-DD 로 보낸다. */
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const dateOfBirth = dobYear && dobMonth && dobDay ? `${dobYear}-${dobMonth}-${dobDay}` : "";
  const ageBlockRef = useRef<HTMLDivElement | null>(null);
  const legalBlockRef = useRef<HTMLDivElement | null>(null);
  /** Apple 4.5.4 「명시적 동의」 — 처음엔 체크 안 됨. */
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [shownVersions, setShownVersions] = useState(requiredVersions ?? null);
  const [sheetKind, setSheetKind] = useState<AppLegalKind | null>(null);

  const dobYearOptions = useMemo(() => buildDobYearOptions(), []);
  const dobDayCount = daysInDobMonth(dobYear, dobMonth);

  const onDobYear = (v: string) => {
    setDobYear(v);
    if (dobDay && Number(dobDay) > daysInDobMonth(v, dobMonth)) setDobDay("");
    setError(null);
  };
  const onDobMonth = (v: string) => {
    setDobMonth(v);
    if (dobDay && Number(dobDay) > daysInDobMonth(dobYear, v)) setDobDay("");
    setError(null);
  };
  const onDobDay = (v: string) => {
    setDobDay(v);
    setError(null);
  };

  const revealMissing = (el: HTMLElement | null) => {
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const syncAllFromParts = (terms: boolean, privacy: boolean, age: boolean, mkt: boolean) => {
    setAgreeAll(terms && privacy && age && (!marketing || mkt));
  };

  const onToggleAll = (checked: boolean) => {
    setAgreeAll(checked);
    if (needsLegal) {
      setAgreeTerms(checked);
      setAgreePrivacy(checked);
    }
    if (needsAge) setAttestAge(checked);
    if (marketing) setAgreeMarketing(checked);
  };

  const tagReq = useMemo(
    () => (
      <span className={`${CONSENT_TAG_CLASS} bg-sam-primary-soft text-sam-primary`}>
        {t("auth_consent_tag_required")}
      </span>
    ),
    [t],
  );
  const tagOpt = useMemo(
    () => (
      <span className={`${CONSENT_TAG_CLASS} border border-sam-border text-sam-muted`}>
        {t("auth_consent_tag_optional")}
      </span>
    ),
    [t],
  );

  const underageMessage = () =>
    safeT("auth_consent_age_under_minimum");
  const handleSubmit = async () => {
    if (inFlightRef.current || submitting) return;
    // 저장 버튼은 막지 않는다 — 빠진 항목을 그 이유와 함께 알려 주고 그 칸으로 이동한다 (Owner 2026-11-09).
    if (needsLegal && (!agreeTerms || !agreePrivacy)) {
      setError(t("auth_consent_both_required"));
      revealMissing(legalBlockRef.current);
      return;
    }
    if (needsAge && !attestAge) {
      setError(safeT("auth_consent_age_check_required"));
      revealMissing(ageBlockRef.current);
      return;
    }
    if (needsAge && !dateOfBirth) {
      setError(safeT("auth_consent_dob_required"));
      revealMissing(ageBlockRef.current);
      return;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/legal-consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agreeTerms: needsLegal ? true : undefined,
          agreePrivacy: needsLegal ? true : undefined,
          ...(needsAge ? { attestAge: true, dateOfBirth } : {}),
          ...(marketing ? { agreeMarketing, marketingVersion: marketing.version } : {}),
          ...(shownVersions
            ? {
                termsVersion: shownVersions.termsVersion,
                privacyVersion: shownVersions.privacyVersion,
              }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
        requiredConsent?: { termsVersion: string; privacyVersion: string };
      } | null;
      if (res.status === 409 && data?.code === "consent_version_stale") {
        // Terms were revised while this screen was open — ask the member to review and agree again.
        if (data.requiredConsent) {
          setShownVersions(data.requiredConsent);
          setClientRequiredConsentVersions(data.requiredConsent);
        }
        setAgreeAll(false);
        setAgreeTerms(false);
        setAgreePrivacy(false);
        setError(t("auth_consent_version_stale"));
        return;
      }
      if (data?.code === "age_under_minimum") {
        setError(underageMessage());
        return;
      }
      if (data?.code === "dob_required") {
        setError(safeT("auth_consent_age_check_required"));
        return;
      }
      if (data?.code === "dob_invalid") {
        setError(safeT("auth_consent_dob_required"));
        return;
      }
      if (data?.code === "marketing_save_failed") {
        // 선택 동의만 실패 — 필수도 저장하지 않았다. 화면에 머물러 다시 누르게 한다(재감사 D-1).
        setError(t("auth_consent_marketing_save_failed"));
        return;
      }
      if (!res.ok || !data?.ok) {
        // 서버 원문·코드는 화면에 노출하지 않는다 — 로그로만 (§5.6).
        console.warn("[auth-consent] save failed", {
          status: res.status,
          code: data?.code ?? null,
        });
        setError(t("auth_consent_save_failed"));
        return;
      }

      invalidateMeProfileDedupedCache();
      try {
        const { status, json } = await fetchMeProfileDeduped();
        const raw = json as { ok?: boolean; profile?: ProfileRow } | null;
        if (status === 200 && raw?.ok && raw.profile?.id) {
          mergeAppBootProfileFull(raw.profile);
          const fromDb = profileRowToClientProfile(raw.profile);
          const prev = getCurrentUser();
          setSupabaseProfileCache({
            ...(prev ?? fromDb),
            ...fromDb,
            avatar_url: fromDb.avatar_url ?? prev?.avatar_url ?? null,
            temperature: fromDb.temperature ?? prev?.temperature ?? 50,
          });
        }
      } catch {
        /* 캐시 갱신 실패는 signup-status 로 위임 */
      }

      markSignupConsentResolvedSession();
      notifyLegalConsentCompleted();
      /**
       * 토큰 클레임 `dibay_m` 에는 동의 버전이 들어 있다 — 저장 직후 1회 갱신해 proxy 가 화면 이동마다 `profiles` 를 읽지 않게
       * (전체 감사 A9 · Auth HARD LOCK Amendment 2026-11-24). 기존 단일 비행 갱신만 쓴다. 실패해도 화면 이동은 계속.
       */
      {
        const sbForClaim = getSupabaseClient();
        if (sbForClaim) void runBrowserAuthRefreshDeduped(sbForClaim, "consent_saved_claim").catch(() => undefined);
      }

      // 동의 뒤 다음 화면은 항상 서버 판정(가입 = 동의 + 전화 + 주소, 설계 2026-11-24 S1 ④):
      // 재동의·나이 확인은 원래 화면(deep link 포함)을 지우지 않는다(inSession) · 첫 가입은 로그인 목적지 규칙.
      // 조회 실패면 원래 화면이 아니라 가입 단계 화면 — 그 화면이 서버로 다시 판정해 맞는 단계/원래 화면으로 보낸다.
      let target = registrationStepHref("phone", next) ?? next;
      try {
        const { status: signupStatus, json: signupJson } = await fetchSignupStatusDeduped(next, {
          inSession: priorConsent,
        });
        if (signupStatus === 200 && signupJson?.route?.trim()) target = signupJson.route.trim();
      } catch {
        /* 단계 화면이 다시 판정 */
      }

      guardedRouterReplace(router, target, {
        source: "auth-consent-form",
        reason: "consent_saved",
      });
    } catch {
      const nextError = t("auth_consent_save_failed");
      setError((prev) => (prev === nextError ? prev : nextError));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const title = ageOnly
    ? safeT("auth_consent_age_title")
    : isReconsent
      ? safeT("auth_consent_reconsent_title")
      : t("auth_consent_title");

  const description = ageOnly
    ? safeT("auth_consent_age_intro")
    : isReconsent
      ? safeT("auth_consent_reconsent_intro")
      : safeT("auth_consent_intro_v2");

  const showAllToggle = [needsLegal, needsAge, Boolean(marketing)].filter(Boolean).length > 1;

  /** 하단 왼쪽 출구 — 이미 가입한 회원(재동의·나이 확인)은 「로그아웃」, 신규 가입은 「가입 취소」 (동작 같음) */
  const exitKind = priorConsent ? "reconsent_logout" : "signup_cancel";

  return (
    <>
      <RegistrationPageShell
        topTitle={priorConsent ? t("auth_consent_title") : undefined}
        title={title}
        description={description}
        titleId="dibay-onboarding-consent-title"
        exit={exitKind}
        showLeaveLink
        footerNote={
          error ? (
            <p className="text-[12px] leading-[1.4] text-sam-danger" role="alert">
              {error}
            </p>
          ) : null
        }
        primaryAction={
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className={`${MY_STICKY_CTA_PRIMARY_BUTTON_CLASS} sam-press`}
            data-testid="auth-consent-submit"
          >
            {submitting ? t("auth_consent_submitting") : t("auth_consent_submit")}
          </button>
        }
      >
        {isReconsent && shownVersions ? (
          <div className={`mb-3 ${DIBAY_ONBOARDING_NOTICE_CLASS}`}>
            {safeT("auth_consent_required_versions", { vars: { terms: shownVersions.termsVersion, privacy: shownVersions.privacyVersion } })}
          </div>
        ) : null}

        {showAllToggle ? (
          <label className={`${CONSENT_ROW_CLASS} mt-3.5 !border-b-2`}>
            <input
              type="checkbox"
              checked={agreeAll}
              onChange={(e) => onToggleAll(e.target.checked)}
              className={CONSENT_CHECKBOX_CLASS}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold leading-[1.4] text-sam-fg">
                {t("auth_consent_all_label")}
              </span>
              <span className={CONSENT_HINT_CLASS}>{t("auth_consent_all_hint")}</span>
            </span>
          </label>
        ) : null}

        <p className={CONSENT_SECTION_CLASS}>{t("auth_consent_section_required")}</p>
        {needsLegal ? (
          <div ref={legalBlockRef}>
            <div className={CONSENT_ROW_CLASS}>
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreeTerms(v);
                    syncAllFromParts(v, agreePrivacy, attestAge, agreeMarketing);
                  }}
                  className={CONSENT_CHECKBOX_CLASS}
                />
                <span className={CONSENT_LABEL_CLASS}>
                  {tagReq}
                  {t("auth_consent_terms_label")}
                </span>
              </label>
              <button type="button" className={CONSENT_VIEW_BTN_CLASS} onClick={() => setSheetKind("terms")}>
                {t("auth_consent_terms_link")}
              </button>
            </div>
            <div className={CONSENT_ROW_CLASS}>
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreePrivacy(v);
                    syncAllFromParts(agreeTerms, v, attestAge, agreeMarketing);
                  }}
                  className={CONSENT_CHECKBOX_CLASS}
                />
                <span className={CONSENT_LABEL_CLASS}>
                  {tagReq}
                  {t("auth_consent_privacy_collect_label")}
                  <span className={CONSENT_HINT_CLASS}>{t("auth_consent_privacy_collect_hint")}</span>
                </span>
              </label>
              <button type="button" className={CONSENT_VIEW_BTN_CLASS} onClick={() => setSheetKind("privacy")}>
                {t("auth_consent_privacy_link")}
              </button>
            </div>
          </div>
        ) : null}

        {needsAge ? (
          <div ref={ageBlockRef} className="border-b border-sam-border pb-3">
            <label className="flex min-h-[48px] items-start gap-2 py-3">
              <input
                type="checkbox"
                checked={attestAge}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAttestAge(v);
                  syncAllFromParts(agreeTerms, agreePrivacy, v, agreeMarketing);
                }}
                className={CONSENT_CHECKBOX_CLASS}
              />
              <span className={CONSENT_LABEL_CLASS}>
                {tagReq}
                {safeT("auth_consent_age_label")}
                <span className={CONSENT_HINT_CLASS}>{safeT("auth_consent_age_hint")}</span>
              </span>
            </label>

            {/* 들여쓰기 = 체크(22)+간격(8) — fieldset 은 전역 padding 초기화가 유틸리티를 이겨 바깥 div 로 준다 */}
            <div className="pl-[30px]">
              <fieldset className="block min-w-0 space-y-1" data-testid="auth-consent-dob">
                <legend className="mb-1 text-[12px] font-semibold text-sam-muted">
                  {safeT("auth_consent_dob_label")}
                </legend>
                <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                  <select
                    value={dobYear}
                    onChange={(e) => onDobYear(e.target.value)}
                    aria-label={safeT("auth_consent_dob_year")}
                    className={DOB_SELECT_CLASS}
                    data-testid="auth-consent-dob-year"
                  >
                    <option value="">{safeT("auth_consent_dob_year")}</option>
                    {dobYearOptions.map((y) => (
                      <option key={y} value={y}>
                        {t("auth_consent_dob_year_option", { year: y })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dobMonth}
                    onChange={(e) => onDobMonth(e.target.value)}
                    aria-label={safeT("auth_consent_dob_month")}
                    className={DOB_SELECT_CLASS}
                    data-testid="auth-consent-dob-month"
                  >
                    <option value="">{safeT("auth_consent_dob_month")}</option>
                    {Array.from({ length: 12 }, (_, i) => pad2(i + 1)).map((m) => (
                      <option key={m} value={m}>
                        {t("auth_consent_dob_month_option", {
                          month: Number(m),
                        })}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dobDay}
                    onChange={(e) => onDobDay(e.target.value)}
                    aria-label={safeT("auth_consent_dob_day")}
                    className={DOB_SELECT_CLASS}
                    data-testid="auth-consent-dob-day"
                  >
                    <option value="">{safeT("auth_consent_dob_day")}</option>
                    {Array.from({ length: dobDayCount }, (_, i) => pad2(i + 1)).map((d) => (
                      <option key={d} value={d}>
                        {t("auth_consent_dob_day_option", { day: Number(d) })}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            </div>
          </div>
        ) : null}

        {marketing ? (
          <>
            <p className={CONSENT_SECTION_CLASS}>{t("auth_consent_section_optional")}</p>
            <div className={CONSENT_ROW_CLASS} data-auth-consent-marketing>
              <label className="flex min-w-0 flex-1 items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreeMarketing}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreeMarketing(v);
                    syncAllFromParts(agreeTerms, agreePrivacy, attestAge, v);
                  }}
                  className={CONSENT_CHECKBOX_CLASS}
                />
                <span className={CONSENT_LABEL_CLASS}>
                  {tagOpt}
                  {language === "en" ? marketing.title.en : marketing.title.ko}
                </span>
              </label>
              <button type="button" className={CONSENT_VIEW_BTN_CLASS} onClick={() => setSheetKind("marketing")}>
                {t("auth_consent_marketing_link")}
              </button>
            </div>
            <p className={`${CONSENT_HINT_CLASS} !mt-2`}>{t("auth_consent_feature_notice")}</p>
          </>
        ) : null}

        <p className={`${CONSENT_HINT_CLASS} !mt-3`} data-auth-consent-safety>
          {t("auth_consent_safety_notice")}
        </p>
      </RegistrationPageShell>

      <ConsentLegalDocSheet
        open={sheetKind != null}
        kind={sheetKind}
        onClose={() => setSheetKind(null)}
        zIndexClass={AUTH_GATE_DIALOG_Z_CLASS}
      />
    </>
  );
}

/**
 * 동의 화면 모양 — 시안 v3 (2026-11-27 · 전체 화면) · 앱 글자(16·15·14·12)·sam 색 · 체크 22px · 누르는 높이 44 이상.
 * 줄 = 흰 바탕 + 아래 구분선 (베이지 상자 제거). [보기] = 줄 오른쪽 44px 글자 버튼.
 */
const CONSENT_ROW_CLASS = "flex min-h-[48px] items-start gap-2 border-b border-sam-border py-3";
const CONSENT_CHECKBOX_CLASS = "mt-[1px] h-[22px] w-[22px] shrink-0 accent-[var(--sam-primary)]";
const CONSENT_LABEL_CLASS =
  "min-w-0 flex-1 text-[15px] font-medium leading-[1.5] text-sam-fg [word-break:keep-all] [overflow-wrap:anywhere]";
const CONSENT_HINT_CLASS =
  "mt-0.5 block text-[12px] font-normal leading-[1.4] text-sam-muted [word-break:keep-all] [overflow-wrap:anywhere]";
const CONSENT_SECTION_CLASS = "mt-[18px] text-[12px] font-bold text-sam-muted";
const CONSENT_TAG_CLASS =
  "mr-1.5 inline-flex h-5 items-center rounded-ui-rect px-1.5 align-[1px] text-[12px] font-semibold leading-none";
const CONSENT_VIEW_BTN_CLASS =
  "-my-2.5 inline-flex min-h-[44px] shrink-0 items-center px-1 text-[12px] font-semibold text-sam-muted underline underline-offset-2";

const DOB_SELECT_CLASS =
  "block min-h-[44px] w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[14px] text-sam-fg";

const DOB_MIN_YEAR = 1900;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 올해 → 1900 내림차순 (만 14세 판정은 서버 `evaluateAgeAttestationInput`). */
function buildDobYearOptions(now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let y = now.getFullYear(); y >= DOB_MIN_YEAR; y -= 1) out.push(String(y));
  return out;
}

/** 고른 년·월의 날짜 수 — 년 미선택 시 2월은 29일까지 보여 준다. */
function daysInDobMonth(year: string, month: string): number {
  const m = Number(month);
  if (!m) return 31;
  const y = Number(year) || 2000;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
