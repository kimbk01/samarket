"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  normalizePhilippinesPhoneNumber,
  isValidPhilippinesMobilePhone,
} from "@/lib/phone/philippines-phone";
import { phoneVerifyCountryOptionsFor } from "@/lib/phone/phone-country-codes";
import { parseKoreaMobileLocal, parseKoreaMobileTyping } from "@/lib/phone/verify-phone-number";
import { normalizePhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";
import { PROFILE_EDIT_FIELD_INCOMPLETE_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";
import { isValidPhoneOtpCodeInput, PHONE_OTP_CODE_LENGTH } from "@/lib/auth/phone-otp-contract";
import { resolvePhoneOtpUiError } from "@/lib/auth/phone-otp-client-errors";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import { resolveMemberPhoneState } from "@/lib/profile/member-account-status";
import { Sam } from "@/lib/ui/sam-component-classes";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  fetchPhoneVerificationJson,
  parsePhoneVerificationSettings,
  type PhoneOtpPendingChallenge,
} from "@/lib/mypage/load-phone-verification-state";

/** 재전송 남은 초 — 렌더 시점 계산이 아니라 1초마다 갱신되는 `now` 로 계산 (S05) */
export function resolvePhoneOtpCooldownLeft(cooldownUntil: number, now: number): number {
  return Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
}

/** 인증번호 화면 제목 — 보낸 번호를 읽기 쉽게 띄어 쓴다 (+63 917 123 4567 · +82 10 1234 5678). 표시 전용. */
export function formatSentPhoneForDisplay(raw: string | null | undefined): string {
  const s = String(raw ?? "").replace(/[^\d+]/g, "");
  const ph = /^(?:\+63|0)(9\d{2})(\d{3})(\d{4})$/.exec(s);
  if (ph) return `+63 ${ph[1]} ${ph[2]} ${ph[3]}`;
  const kr = /^\+82(\d{2})(\d{3,4})(\d{4})$/.exec(s);
  if (kr) return `+82 ${kr[1]} ${kr[2]} ${kr[3]}`;
  return String(raw ?? "").trim();
}

/**
 * 보낼 번호 형식 — 필리핀 = DB 09 형식, 한국 = +82 E.164. 화면 입력값·서버가 돌려준 보낸 번호를
 * 같은 형식으로 맞춰 「같은 번호인가」를 비교한다.
 */
export function toVerifyApiPhone(raw: string, isKorea: boolean): string {
  if (isKorea) {
    const local = parseKoreaMobileLocal(raw);
    return local ? `+82${local.slice(1)}` : "";
  }
  const db = normalizePhMobileDb(raw);
  if (db) return db;
  const e164 = normalizePhilippinesPhoneNumber(raw);
  if (isValidPhilippinesMobilePhone(e164)) {
    return normalizePhMobileDb(parsePhMobileInput(e164)) ?? e164;
  }
  return e164;
}

/** 아직 입력할 수 있는 인증번호인가 (만료 전) */
export function isLivePendingChallenge(
  p: PhoneOtpPendingChallenge | null | undefined,
  nowMs: number = Date.now(),
): p is PhoneOtpPendingChallenge {
  return Boolean(p?.phone && Date.parse(p.expires_at) > nowMs);
}

type VerificationSettings = {
  enabled: boolean;
  provider?: "supabase" | "semaphore" | string;
  guide_text: string;
  resend_cooldown_seconds: number;
  /** 인증 가능한 국가번호 (`+63`·`+82`) — 없으면 +63 만 */
  country_dial_codes?: string[];
  /** 서버가 보관 중인 유효 인증번호 — 화면을 나갔다 와도 6칸 화면으로 이어서 (Owner 2026-11-09) */
  pending_challenge?: PhoneOtpPendingChallenge | null;
};

type VerifySnapshot = {
  phone: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verified: boolean;
  phone_verified_at?: string | null;
  phone_verification_method?: string | null;
  phone_verification_status?: string | null;
  member_status?: string | null;
  role?: string | null;
  privilegedAdmin?: boolean;
  email?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  settings?: VerificationSettings;
};

/** 텔레그램형 단계 (Owner 2026-11-09): 번호 → (국가 목록) → 6칸 인증번호 → 완료 */
type Step = "phone" | "country" | "code";

function resolveSnapshotPhoneDb09(snapshot: VerifySnapshot): string | null {
  return resolveProfilePhoneDb09({
    phone: snapshot.phone,
    phone_country_code: snapshot.phone_country_code,
    phone_number: snapshot.phone_number,
  });
}

function IconCircle({ children, solid = false }: { children: ReactNode; solid?: boolean }) {
  return (
    <div
      className={`flex h-[72px] w-[72px] items-center justify-center rounded-full ${
        solid ? "bg-sam-primary text-sam-on-primary" : "bg-sam-primary-soft text-sam-primary"
      }`}
      aria-hidden
    >
      {children}
    </div>
  );
}

export function PhoneVerificationBox({
  snapshot,
  onRefreshProfile,
  onDone,
  compact = false,
  setupError = false,
  fieldIncomplete = false,
  settingsLoadFailed = false,
  onRetrySettings,
  surface = "page",
}: {
  snapshot: VerifySnapshot;
  /** 인증 성공 직후 — 부모가 서버에서 새로 받아 클라이언트 사본을 맞춘다(`refreshClientMemberAccountAfterMutation`). */
  onRefreshProfile: () => Promise<void>;
  /** 완료 화면 [확인] 또는 1.2초 뒤 — 시트 닫기·원래 화면 복귀. 없으면 완료 후 「인증 완료」 카드로 남는다. */
  onDone?: () => void;
  /** 프로필 수정 — 큰 아이콘·안내 없이 */
  compact?: boolean;
  setupError?: boolean;
  fieldIncomplete?: boolean;
  /** 설정 조회 실패 — 무한 로딩 대신 오류 + [다시 시도] (S05) */
  settingsLoadFailed?: boolean;
  onRetrySettings?: () => void;
  /** page(기본) = 앱 화면 · overlay = 시트 안 — 시트가 제목을 이미 보여 주므로 제목을 다시 쓰지 않는다. */
  surface?: "page" | "overlay";
}) {
  const { t } = useI18n();
  const ov = surface === "overlay" && !compact;
  const ovCls = {
    card: `rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] px-4 py-3`,
    title: `text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4] text-[color:var(--overlay-text-primary)]`,
    desc: `mt-1 text-[length:var(--overlay-body-2-size)] leading-[1.6] text-[color:var(--overlay-text-secondary)]`,
    skeleton: "rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)]",
  };
  /** 열 때 서버에 유효한 인증번호가 있으면 그 번호로 6칸 화면부터 (늦게 온 문자도 입력 가능) */
  const initialPending = isLivePendingChallenge(snapshot.settings?.pending_challenge)
    ? snapshot.settings!.pending_challenge!
    : null;
  const initialPendingKorea = initialPending ? initialPending.phone.startsWith("+82") : false;
  const [phone, setPhone] = useState(initialPending?.phone ?? snapshot.phone ?? "");
  const [otp, setOtp] = useState("");
  /** 인증번호를 보냈는가 · 보낸 번호(보낼 번호 형식) */
  const [codeSent, setCodeSent] = useState(Boolean(initialPending));
  const [sentPhone, setSentPhone] = useState<string>(
    initialPending ? toVerifyApiPhone(initialPending.phone, initialPendingKorea) : "",
  );
  /** 화면 표시용 — 서버가 돌려준 번호(+63…/+82…) */
  const [sentPhoneDisplay, setSentPhoneDisplay] = useState<string>(
    initialPending ? formatSentPhoneForDisplay(initialPending.phone) : "",
  );
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [allowEdit, setAllowEdit] = useState(!snapshot.phone_verified || Boolean(initialPending));
  /** 확인 API 가 성공을 돌려준 순간 true — 재조회를 기다리지 않고 바로 완료 화면 (F3) */
  const [justVerified, setJustVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(() =>
    initialPending ? Date.parse(initialPending.resend_available_at) || 0 : 0,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pendingOnOpen = snapshot.phone_verification_status === "pending";
  const [step, setStep] = useState<Step>(initialPending || (pendingOnOpen && snapshot.phone) ? "code" : "phone");
  const submittedCodeRef = useRef<string>("");
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedSnapshotPhone = useMemo(() => resolveSnapshotPhoneDb09(snapshot), [snapshot]);

  const verified = hasVerifiedPhone({
    role: snapshot.role ?? null,
    privilegedAdmin: snapshot.privilegedAdmin === true,
    phone_verified: snapshot.phone_verified === true,
    phone_verified_at: snapshot.phone_verified_at ?? null,
    phone_verification_method: snapshot.phone_verification_method ?? null,
    provider: snapshot.provider ?? snapshot.auth_provider ?? null,
    auth_provider: snapshot.auth_provider ?? snapshot.provider ?? null,
    email: snapshot.email ?? null,
  });
  const verifiedNow = verified || justVerified;

  const settings = snapshot.settings;
  /** 국가 — +63 필리핀(Semaphore) · +82 한국(Solapi, 서버가 허용할 때만) (Owner 2026-11-09). */
  const countryOptions = useMemo(
    () => phoneVerifyCountryOptionsFor(settings?.country_dial_codes),
    [settings?.country_dial_codes],
  );
  const snapshotIsKorea =
    String(snapshot.phone ?? "").startsWith("+82") || String(snapshot.phone_country_code ?? "") === "+82";
  const [dialCode, setDialCode] = useState<string>(
    initialPending ? (initialPendingKorea ? "+82" : "+63") : snapshotIsKorea ? "+82" : "+63",
  );
  const isKorea = dialCode === "+82";
  const selectedCountry = countryOptions.find((c) => c.dialCode === dialCode) ?? countryOptions[0];
  const countryName = (iso: string) => t(iso === "KR" ? "my_phone_country_name_KR" : "my_phone_country_name_PH");

  /** 서버의 유효 인증번호로 이어서 — 6칸 화면 · 보낸 번호 · 남은 재발송 시간 */
  const resumePendingChallenge = useCallback((p: PhoneOtpPendingChallenge) => {
    const korea = p.phone.startsWith("+82");
    setDialCode(korea ? "+82" : "+63");
    setPhone(p.phone);
    setSentPhone(toVerifyApiPhone(p.phone, korea));
    setSentPhoneDisplay(formatSentPhoneForDisplay(p.phone));
    setCooldownUntil(Date.parse(p.resend_available_at) || 0);
    setCodeSent(true);
    setOtp("");
    submittedCodeRef.current = "";
    setAllowEdit(true);
    setError(null);
    setStep("code");
  }, []);

  const pendingFromSettings = snapshot.settings?.pending_challenge ?? null;
  const livePending = isLivePendingChallenge(pendingFromSettings) ? pendingFromSettings : null;
  const livePendingKey = livePending ? `${livePending.phone}|${livePending.expires_at}` : "";

  useEffect(() => {
    // 유효 인증번호가 있으면 번호 칸을 프로필 번호로 덮어쓰지 않는다 (이어서 입력 중)
    if (livePendingKey) return;
    if (snapshotIsKorea) {
      setDialCode("+82");
      setPhone(parseKoreaMobileTyping(String(snapshot.phone ?? "")));
    } else {
      setPhone(resolvedSnapshotPhone ?? "");
    }
    setAllowEdit(!verified);
  }, [resolvedSnapshotPhone, verified, snapshotIsKorea, snapshot.phone, livePendingKey]);

  /** 설정이 늦게 도착해 유효 인증번호를 알게 되면(아직 이 화면에서 보내지 않았을 때) 이어서 */
  useEffect(() => {
    if (!livePending || codeSent || justVerified) return;
    resumePendingChallenge(livePending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 같은 인증번호(key)마다 한 번
  }, [livePendingKey]);

  /** 서버가 내준 목록에 없는 국가번호가 선택돼 있으면 첫 항목으로 되돌린다. */
  useEffect(() => {
    if (!countryOptions.some((c) => c.dialCode === dialCode)) {
      setDialCode(countryOptions[0]?.dialCode ?? "+63");
      setPhone("");
    }
  }, [countryOptions, dialCode]);

  const cooldownSec = Math.max(1, Number(settings?.resend_cooldown_seconds ?? 60));
  const cooldownLeft = resolvePhoneOtpCooldownLeft(cooldownUntil, nowMs);

  /** 재전송 타이머 — 쿨다운 동안 1초마다 다시 그린다 (S05: 남은 초가 줄지 않던 결함) */
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      const n = Date.now();
      setNowMs(n);
      if (n >= cooldownUntil) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const normalizedPhone = useMemo(() => normalizePhilippinesPhoneNumber(phone), [phone]);
  const koreaLocal = isKorea ? parseKoreaMobileLocal(phone) : null;
  const phoneForApi = useMemo(() => toVerifyApiPhone(phone, isKorea), [phone, isKorea]);
  const validPhone = isKorea ? koreaLocal != null : isValidPhilippinesMobilePhone(normalizedPhone);
  /** 입력하는 동안 바로 판정 — 10자리 이상 쳤거나 칸을 벗어났는데 형식이 틀리면 「형식에 맞지 않습니다」. */
  const phoneDigitCount = phone.replace(/\D/g, "").length;
  const showFormatError = phone.trim().length > 0 && !validPhone && (phoneBlurred || phoneDigitCount >= 10);
  /** 같은 번호로 이미 보냈고 재전송 대기 중이면 [계속] = 인증번호 화면으로만 이동 */
  const sameNumberAlreadySent = codeSent && sentPhone !== "" && sentPhone === phoneForApi;
  const continueDisabled = sending || !validPhone || (cooldownLeft > 0 && !sameNumberAlreadySent);

  const requestOtp = async () => {
    setError(null);
    if (!validPhone) {
      setError(t("my_phone_err_format"));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/account/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phoneForApi }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        phone?: string;
      };
      if (!res.ok || !json.ok) {
        // 재발송 대기(429) — 이 번호로 보낸 유효 인증번호가 서버에 있으면 새로 보내지 않고 이어서 입력
        if (res.status === 429 && json.code === "otp_rate_limited") {
          const latest = await fetchPhoneVerificationJson()
            .then((r) => (r.ok ? parsePhoneVerificationSettings(r.json)?.pending_challenge ?? null : null))
            .catch(() => null);
          if (
            isLivePendingChallenge(latest) &&
            toVerifyApiPhone(latest.phone, latest.phone.startsWith("+82")) === phoneForApi
          ) {
            resumePendingChallenge(latest);
            return;
          }
        }
        triggerInteractionFeedback("error");
        setError(
          resolvePhoneOtpUiError({ status: res.status, code: json.code, message: json.message }, t, "send"),
        );
        return;
      }
      triggerInteractionFeedback("success");
      setSentPhone(phoneForApi);
      setSentPhoneDisplay(formatSentPhoneForDisplay(json.phone || phoneForApi));
      setCooldownUntil(Date.now() + cooldownSec * 1000);
      setCodeSent(true);
      setOtp("");
      submittedCodeRef.current = "";
      setStep("code");
    } catch (e) {
      // 네트워크 예외 — 원문은 로그로만, 화면은 i18n 키 (P2-15).
      console.warn("[phone-otp] send threw", e instanceof Error ? e.name : "unknown");
      setError(t("my_phone_send_failed"));
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = useCallback(
    async (code: string) => {
      setError(null);
      if (!isValidPhoneOtpCodeInput(code)) {
        setError(t("my_phone_code_required"));
        return;
      }
      setVerifying(true);
      try {
        const res = await fetch("/api/account/phone/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: sentPhone || phoneForApi, otp: code }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          message?: string;
        };
        if (!res.ok || !json.ok) {
          triggerInteractionFeedback("error");
          setError(
            resolvePhoneOtpUiError({ status: res.status, code: json.code, message: json.message }, t, "verify"),
          );
          // 틀리면 칸을 비우고 다시 입력 (같은 번호 재제출 방지 해제)
          setOtp("");
          submittedCodeRef.current = "";
          return;
        }
        // 서버가 인증을 저장했다 — 재조회 결과를 기다리지 않고 바로 완료 (F3)
        triggerInteractionFeedback("success");
        setJustVerified(true);
        setAllowEdit(false);
        setOtp("");
        setVerifying(false);
        await onRefreshProfile();
      } catch (e) {
        console.warn("[phone-otp] verify threw", e instanceof Error ? e.name : "unknown");
        setError(t("my_phone_verify_failed"));
        submittedCodeRef.current = "";
      } finally {
        setVerifying(false);
      }
    },
    [onRefreshProfile, phoneForApi, sentPhone, t],
  );

  /** 6번째 숫자가 들어오면 바로 확인 — 같은 코드는 한 번만 보낸다 */
  useEffect(() => {
    if (step !== "code" || verifying || justVerified) return;
    if (otp.length !== PHONE_OTP_CODE_LENGTH) return;
    if (submittedCodeRef.current === otp) return;
    submittedCodeRef.current = otp;
    void verifyOtp(otp);
  }, [otp, step, verifying, justVerified, verifyOtp]);

  /** 완료 화면 — 1.2초 뒤 자동으로 원래 화면 (부모가 onDone 을 줄 때만) */
  useEffect(() => {
    if (!justVerified || !onDone) return;
    const id = window.setTimeout(onDone, 1200);
    return () => window.clearTimeout(id);
  }, [justVerified, onDone]);

  if (!settings) {
    if (settingsLoadFailed) {
      return (
        <div
          className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}
          role="alert"
          data-testid="phone-verify-settings-error"
        >
          <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
          <p className={ov ? ovCls.desc : "mt-1 sam-text-body-secondary text-sam-muted"}>{t("mypage_s05_load_failed")}</p>
          {onRetrySettings ? (
            <button
              type="button"
              onClick={onRetrySettings}
              className={ov ? `${OverlayUi.btn.secondary} mt-2` : `${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} mt-2`}
            >
              {t("common_retry")}
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <div
        className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}
        aria-busy="true"
        data-testid="phone-verify-settings-loading"
      >
        <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
        <span
          className={`mt-2 block h-3 w-[60%] motion-safe:animate-pulse ${ov ? ovCls.skeleton : "rounded-ui-rect bg-sam-border-soft/70"}`}
        />
        <span
          className={`mt-3 block w-full motion-safe:animate-pulse ${ov ? `h-12 ${ovCls.skeleton}` : "h-[46px] rounded-ui-rect bg-sam-border-soft/70"}`}
        />
      </div>
    );
  }

  if (!settings.enabled) {
    return (
      <div className={ov ? ovCls.card : "rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"}>
        <p className={ov ? ovCls.title : "sam-text-body font-semibold text-sam-fg"}>{t("my_phone_verify_title")}</p>
        <p className={ov ? ovCls.desc : "mt-1 sam-text-body-secondary text-sam-muted"}>
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      </div>
    );
  }

  const showSetupShellError = setupError && !verifiedNow && !error;
  const phoneState = resolveMemberPhoneState(snapshot);
  const verifiedNoNumber = phoneState.kind === "verified" && !phoneState.masked;
  const verifiedDisplayPhone = phoneState.masked ?? t("mypage_req_value_phone_none");
  const pillBtn =
    "flex h-[52px] w-full items-center justify-center rounded-full bg-sam-primary text-[17px] font-bold text-sam-on-primary disabled:bg-sam-border disabled:text-sam-muted";
  const errorText = error ? (
    <p className="text-center text-[13px] text-sam-danger" role="alert">
      {error}
    </p>
  ) : null;
  const pressFeedback = (e: MouseEvent) =>
    triggerInteractionFeedback("light", { pointerType: (e.nativeEvent as PointerEvent).pointerType });

  /** ④ 완료 — 확인 API 성공 즉시 (부모가 닫기·복귀를 맡을 때) */
  if (justVerified && onDone) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-6 text-center" data-testid="phone-verify-done">
        <IconCircle solid>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </IconCircle>
        <p className="mt-3 text-[22px] font-bold text-sam-fg">{t("my_phone_tg_done_title")}</p>
        <p className="text-[16px] tabular-nums text-sam-fg">{sentPhoneDisplay || formatSentPhoneForDisplay(phoneForApi)}</p>
        <p className="text-[14px] leading-[1.5] text-sam-muted">{t("my_phone_tg_done_desc")}</p>
        <button
          type="button"
          className={`${pillBtn} mt-6`}
          onClick={(e) => {
            pressFeedback(e);
            onDone();
          }}
          data-testid="phone-verify-done-confirm"
        >
          {t("common_confirm")}
        </button>
      </div>
    );
  }

  /** 이미 인증됨 — 상태 카드 + [번호 변경] */
  if (verifiedNow && !allowEdit) {
    return (
      <div
        className={
          compact
            ? "flex flex-wrap items-center justify-between gap-2 rounded-ui-rect bg-sam-pressed-surface px-3 py-2.5"
            : "flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
        }
        data-phone-state={phoneState.kind}
        data-testid="phone-verify-verified"
      >
        <div className="min-w-0">
          <span className="inline-block rounded-full bg-sam-primary px-2.5 py-0.5 text-[12px] font-bold text-sam-on-primary">
            {t("my_phone_status_verified")}
          </span>
          <p className="mt-1 text-[15px] tabular-nums text-sam-fg">
            {justVerified && !verified ? sentPhoneDisplay : verifiedDisplayPhone}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 text-[14px] font-semibold text-sam-primary underline"
          onClick={() => {
            setJustVerified(false);
            setAllowEdit(true);
            setStep("phone");
          }}
        >
          {verifiedNoNumber ? t("mypage_req_cta_register_number") : t("mypage_comp_phone_change_number")}
        </button>
      </div>
    );
  }

  /** ② 국가 목록 — 기기 기본 드롭다운(select) 아님: iOS 에서도 같은 목록 */
  if (step === "country") {
    return (
      <div className="flex flex-col" data-testid="phone-verify-country-list">
        <div className="flex h-11 items-center">
          <button
            type="button"
            aria-label={t("nav_back")}
            className="flex h-11 w-11 items-center justify-center"
            onClick={() => setStep("phone")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <p className="flex-1 pr-11 text-center text-[16px] font-bold text-sam-fg">{t("my_phone_tg_country_title")}</p>
        </div>
        <div role="radiogroup" aria-label={t("my_phone_country_code_label")} className="border-t border-sam-border">
          {countryOptions.map((c) => {
            const selected = c.dialCode === dialCode;
            return (
              <button
                key={c.iso}
                type="button"
                role="radio"
                aria-checked={selected}
                className="flex h-14 w-full items-center gap-3 border-b border-sam-border px-1 text-left"
                onClick={(e) => {
                  pressFeedback(e);
                  if (!selected) {
                    setDialCode(c.dialCode);
                    setPhone("");
                    setOtp("");
                    setCodeSent(false);
                    setSentPhone("");
                    setSentPhoneDisplay("");
                    setError(null);
                  }
                  setStep("phone");
                }}
                data-testid={`phone-verify-country-${c.iso}`}
              >
                <span className="text-[22px]" aria-hidden>
                  {c.flag}
                </span>
                <span className="flex-1 text-[16px] text-sam-fg">{countryName(c.iso)}</span>
                <span className="text-[15px] text-sam-muted">{c.dialCode}</span>
                <span className="flex w-5 justify-center text-sam-primary" aria-hidden>
                  {selected ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /** ③ 인증번호 — 6칸, 6번째 숫자에서 자동 확인, 문자 자동 채우기 */
  if (step === "code") {
    const digits = Array.from({ length: PHONE_OTP_CODE_LENGTH }, (_, i) => otp[i] ?? "");
    const activeIndex = Math.min(otp.length, PHONE_OTP_CODE_LENGTH - 1);
    return (
      <div className="flex flex-col items-center gap-2 text-center" data-testid="phone-verify-code-step">
        {compact ? null : (
          <IconCircle>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16v11H8l-4 3z" />
              <path d="M8 11h.01M12 11h.01M16 11h.01" />
            </svg>
          </IconCircle>
        )}
        <p className={`${compact ? "" : "mt-2 "}text-[22px] font-bold tabular-nums text-sam-fg`}>
          {sentPhoneDisplay || formatSentPhoneForDisplay(phoneForApi || snapshot.phone)}
        </p>
        <p className="text-[14px] leading-[1.5] text-sam-muted">{t("my_phone_tg_code_desc")}</p>
        <button
          type="button"
          className="text-[14px] font-semibold text-sam-primary"
          onClick={() => {
            setError(null);
            setOtp("");
            submittedCodeRef.current = "";
            setStep("phone");
          }}
          data-testid="phone-verify-change-number"
        >
          {t("my_phone_tg_change_number")}
        </button>
        <div
          className="relative mt-4 flex justify-center gap-2"
          onClick={() => codeInputRef.current?.focus()}
        >
          {digits.map((d, i) => (
            <span
              key={i}
              aria-hidden
              className={`flex h-14 w-11 items-center justify-center rounded-ui-rect border-[1.5px] text-[24px] font-semibold tabular-nums text-sam-fg ${
                error ? "border-sam-danger" : d || i === activeIndex ? "border-sam-primary" : "border-sam-border"
              }`}
            >
              {d}
            </span>
          ))}
          <input
            ref={codeInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            name="one-time-code"
            aria-label={t("my_phone_tg_code_label")}
            maxLength={PHONE_OTP_CODE_LENGTH}
            value={otp}
            disabled={verifying}
            autoFocus
            onChange={(e) => {
              setError(null);
              setOtp(e.target.value.replace(/\D+/g, "").slice(0, PHONE_OTP_CODE_LENGTH));
            }}
            className="absolute inset-0 h-full w-full cursor-text opacity-0 caret-transparent"
            data-testid="phone-verify-code"
          />
        </div>
        {verifying ? <p className="text-[13px] text-sam-muted">{t("my_phone_verifying")}</p> : null}
        {errorText}
        <button
          type="button"
          disabled={sending || cooldownLeft > 0}
          onClick={(e) => {
            pressFeedback(e);
            void requestOtp();
          }}
          className="mt-3 h-10 text-[15px] font-semibold text-sam-primary disabled:font-normal disabled:text-sam-muted"
          data-testid="phone-verify-resend"
        >
          {sending
            ? t("my_phone_sending")
            : cooldownLeft > 0
              ? t("my_phone_tg_resend_in", { seconds: cooldownLeft })
              : t("my_phone_tg_resend")}
        </button>
      </div>
    );
  }

  /** ① 번호 입력 — 국가 줄 · [국가번호 | 번호] 한 줄 · [계속] */
  return (
    <div className="flex flex-col" data-testid="phone-verify-phone-step">
      {compact ? null : (
        <div className="flex flex-col items-center gap-2 pb-6 text-center">
          <IconCircle>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18.5h3" />
            </svg>
          </IconCircle>
          {/* 시트는 제목을 이미 보여 준다 — 시트 안에서는 제목을 다시 쓰지 않는다 (Owner 2026-11-09) */}
          {ov ? null : <p className="mt-2 text-[22px] font-bold text-sam-fg">{t("my_phone_tg_title")}</p>}
          <p className="text-[14px] leading-[1.5] text-sam-muted">{settings.guide_text || t("my_phone_tg_desc")}</p>
        </div>
      )}
      <div className="border-t border-sam-border">
        <button
          type="button"
          className="flex h-14 w-full items-center gap-3 border-b border-sam-border px-1 text-left"
          onClick={(e) => {
            pressFeedback(e);
            setStep("country");
          }}
          aria-label={`${t("my_phone_country_code_label")}: ${selectedCountry ? countryName(selectedCountry.iso) : ""}`}
          data-testid="phone-verify-country-code"
        >
          <span className="text-[22px]" aria-hidden>
            {selectedCountry?.flag}
          </span>
          <span className="flex-1 text-[16px] font-semibold text-sam-primary">
            {selectedCountry ? countryName(selectedCountry.iso) : ""}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-sam-muted" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div
          className={`flex h-14 items-center border-b-2 ${showFormatError ? "border-sam-danger" : "border-sam-primary"}${
            fieldIncomplete && !verifiedNow ? ` ${PROFILE_EDIT_FIELD_INCOMPLETE_CLASS}` : ""
          }`}
        >
          <span className="w-14 pl-1 text-[18px] font-medium tabular-nums text-sam-fg">{dialCode}</span>
          <span className="mr-3 h-7 w-px bg-sam-border" aria-hidden />
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="tel"
            aria-label={t("my_phone_number_label")}
            value={phone}
            onChange={(e) => {
              setPhone(sanitizePhoneTyping(e.target.value));
              setPhoneBlurred(false);
              setError(null);
            }}
            onBlur={() => setPhoneBlurred(true)}
            aria-invalid={showFormatError}
            placeholder={t("my_phone_number_placeholder")}
            className="min-w-0 flex-1 bg-transparent text-[18px] tabular-nums text-sam-fg outline-none placeholder:text-sam-muted/70"
            data-testid="phone-verify-number"
          />
        </div>
      </div>
      {showFormatError && !error ? (
        <p className="mt-2 text-[13px] text-sam-danger" role="alert" data-testid="phone-verify-format-error">
          {t("my_phone_err_format")}
        </p>
      ) : null}
      {showSetupShellError ? (
        <p className="mt-2 text-[12px] text-sam-danger" role="alert">
          {t("profile_setup_err_phone_required")}
        </p>
      ) : null}
      <button
        type="button"
        disabled={continueDisabled}
        onClick={(e) => {
          pressFeedback(e);
          if (sameNumberAlreadySent) {
            setError(null);
            setStep("code");
            return;
          }
          void requestOtp();
        }}
        className={`${pillBtn} mt-5`}
        data-testid="phone-verify-send"
      >
        {sending
          ? t("my_phone_sending")
          : cooldownLeft > 0 && !sameNumberAlreadySent
            ? t("my_phone_tg_resend_in", { seconds: cooldownLeft })
            : t("my_phone_tg_continue")}
      </button>
      {error ? <div className="mt-3">{errorText}</div> : null}
    </div>
  );
}

/**
 * 번호 칸 입력 — 사용자가 친 그대로 둔다(0 있든 없든·+63/+82 붙여넣기·띄어쓰기·하이픈).
 * 정규화는 보낼 때만 (`normalizePhilippinesPhoneNumber` / `parseKoreaMobileLocal`).
 */
function sanitizePhoneTyping(raw: string): string {
  return String(raw ?? "").replace(/[^\d+\s-]/g, "").slice(0, 18);
}
