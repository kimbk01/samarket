/**
 * CONTRACT — 전화 OTP 단일 서비스 경로.
 * - `phone_otp_challenges` CRUD·OTP 해시·SMS 발송·profiles phone/verified 갱신은 이 파일만.
 * - API route 는 `phone-otp-server-sync` 로 display_name·gate 캐시만 보조한다.
 * - 검증: `npm run verify:phone-otp-contract`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import { loadAuthPhoneSettings, type AuthPhoneSettings } from "@/lib/auth/auth-phone-settings";
import { resolvePhoneOtpHashSecret } from "@/lib/auth/phone-otp-hash-secret";
import { isValidPhoneOtpCodeInput } from "@/lib/auth/phone-otp-contract";
import { findPhoneDuplicateOnOtherProfile } from "@/lib/auth/phone-otp-duplicate-check";
import { resolveVerifyPhone, type ResolvedVerifyPhone, type VerifyPhoneProvider } from "@/lib/phone/verify-phone-number";
import { isSolapiSmsConfigured } from "@/lib/env/solapi-sms";
import { sendSolapiSms } from "@/lib/auth/solapi-sms";
import { recordPhoneOtpDeliveryEvent } from "@/lib/auth/phone-otp-ops";
import { sendSemaphoreSms } from "@/lib/auth/semaphore-sms";

export type PhoneOtpErrorCode =
  | "phone_duplicate"
  | "phone_invalid"
  | "otp_invalid"
  | "otp_expired"
  | "otp_required"
  | "otp_phone_mismatch"
  | "otp_rate_limited"
  | "otp_send_failed"
  | "phone_verify_disabled"
  | "phone_otp_hash_secret_missing"
  | "server_error";

type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: PhoneOtpErrorCode; message: string };

type VerifyOtpResult = {
  phone: string;
  /** 승격 시 "active" · 제재(정지·차단·탈퇴) 회원은 기존 값 유지. */
  member_status: string;
  phone_verified: true;
  verification_method: VerifyPhoneProvider;
};

function fail(
  status: number,
  code: PhoneOtpErrorCode,
  message: string,
): ServiceResult<never> {
  return { ok: false, status, code, message };
}

function invalidPhoneResult(): ServiceResult<never> {
  return fail(
    400,
    "phone_invalid",
    "필리핀(+63)·한국(+82) 휴대폰 번호만 인증할 수 있습니다. 번호를 확인해 주세요.",
  );
}

/**
 * 입력 번호 → 인증 대상 (필리핀 +63 = Semaphore · 한국 +82 = Solapi, Owner 2026-11-09).
 * 한국은 Solapi 설정(키·발신번호)이 있을 때만 받는다. 그 외 나라는 거절.
 */
function resolveVerifyTarget(inputPhone: string): ResolvedVerifyPhone | null {
  const resolved = resolveVerifyPhone(inputPhone);
  if (!resolved) return null;
  if (resolved.country === "KR" && !isSolapiSmsConfigured()) return null;
  return resolved;
}

/** 발송 업체 분기 — 문자 문구는 나라별 (Solapi 한국 SMS 90byte 이내). */
async function sendVerifySms(target: ResolvedVerifyPhone, otpCode: string) {
  if (target.country === "KR") {
    return sendSolapiSms(`0${target.storage.phone_number}`, `[DIBAY] Verification code: ${otpCode}`);
  }
  return sendSemaphoreSms(target.e164, `[DIBAY] Verification code: ${otpCode}`);
}

function phoneDuplicateResult(): ServiceResult<never> {
  return fail(409, "phone_duplicate", "이미 다른 계정에서 사용 중인 전화번호입니다.");
}

async function ensurePhoneUnique(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string,
): Promise<ServiceResult<null>> {
  try {
    const duplicate = await findPhoneDuplicateOnOtherProfile(sb, userId, inputPhone);
    if (duplicate) return phoneDuplicateResult();
    return { ok: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    return fail(500, "server_error", message);
  }
}

type ProfileOtpState = {
  phone_verification_requested_at?: string | null;
  phone_verification_attempt_count?: number | null;
  status?: string | null;
  member_status?: string | null;
  deleted_at?: string | null;
};

/**
 * P1-1 — 전화 인증은 전화 필드만 바꾼다. 생애주기(status/member_status) 승격은
 * 현재 상태가 제재가 아닐 때(가입·일반 계열)만. 정지·차단·탈퇴 회원은 상태 유지.
 */
const PHONE_VERIFY_PROMOTABLE_STATUSES: ReadonlySet<string> = new Set([
  "",
  "active",
  "pending",
  "sns_pending",
  "sns_member",
  "verified_user",
  "normal",
]);

/** 승격 UPDATE 의 DB 가드 — 읽기 후 관리자 제재가 들어온 경쟁 상황에서도 상태를 덮지 않는다. */
const PHONE_VERIFY_RESTRICTED_STATUS_FILTER =
  "status.is.null,status.not.in.(suspended,blocked,withdrawn,deleted,deactivated)";

export function isPhoneVerifyLifecyclePromotable(state: {
  status?: string | null;
  deleted_at?: string | null;
}): boolean {
  if (state.deleted_at) return false;
  const status = String(state.status ?? "").trim().toLowerCase();
  return PHONE_VERIFY_PROMOTABLE_STATUSES.has(status);
}

type PhoneOtpChallengeRow = {
  user_id: string;
  phone: string;
  otp_code_hash: string;
  otp_expires_at: string;
  attempt_count: number;
  verified_at?: string | null;
};

async function loadProfileOtpState(sb: SupabaseClient, userId: string): Promise<ServiceResult<ProfileOtpState>> {
  const { data, error } = await sb
    .from("profiles")
    .select("phone_verification_requested_at, phone_verification_attempt_count, status, member_status, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return fail(500, "server_error", error.message);
  return { ok: true, data: (data ?? {}) as ProfileOtpState };
}

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

async function bumpOtpAttemptCount(sb: SupabaseClient, userId: string, nextCount: number): Promise<void> {
  await sb
    .from("profiles")
    .update({
      phone_verification_attempt_count: Math.max(0, nextCount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

function createOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

function hashOtpCode(phone: string, otpCode: string, secret: string): string {
  return createHash("sha256")
    .update(`${phone}:${otpCode}:${secret}`)
    .digest("hex");
}

async function requirePhoneOtpRuntimeEnabled(): Promise<
  ServiceResult<{ settings: AuthPhoneSettings; hashSecret: string }>
> {
  const settings = await loadAuthPhoneSettings();
  if (!settings.enabled) {
    return fail(403, "phone_verify_disabled", "전화 인증 기능이 현재 비활성화되어 있습니다.");
  }
  const secret = resolvePhoneOtpHashSecret();
  if (!secret.ok) {
    return fail(
      503,
      "phone_otp_hash_secret_missing",
      "전화 인증 보안 설정이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return { ok: true, data: { settings, hashSecret: secret.secret } };
}

async function upsertPhoneOtpChallenge(
  sb: SupabaseClient,
  userId: string,
  phone: string,
  otpCodeHash: string,
  expiresAtIso: string,
): Promise<ServiceResult<null>> {
  const { error } = await sb.from("phone_otp_challenges").upsert(
    {
      user_id: userId,
      phone,
      otp_code_hash: otpCodeHash,
      otp_expires_at: expiresAtIso,
      attempt_count: 0,
      verified_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return fail(500, "server_error", error.message);
  return { ok: true, data: null };
}

async function loadPhoneOtpChallenge(sb: SupabaseClient, userId: string): Promise<ServiceResult<PhoneOtpChallengeRow | null>> {
  const { data, error } = await sb
    .from("phone_otp_challenges")
    .select("user_id, phone, otp_code_hash, otp_expires_at, attempt_count, verified_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return fail(500, "server_error", error.message);
  return { ok: true, data: (data as PhoneOtpChallengeRow | null) ?? null };
}

async function updatePhoneOtpChallengeAttempts(
  sb: SupabaseClient,
  userId: string,
  nextAttemptCount: number,
): Promise<ServiceResult<null>> {
  const { error } = await sb
    .from("phone_otp_challenges")
    .update({
      attempt_count: Math.max(0, nextAttemptCount),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) return fail(500, "server_error", error.message);
  return { ok: true, data: null };
}

async function markPhoneOtpChallengeVerified(sb: SupabaseClient, userId: string): Promise<ServiceResult<null>> {
  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from("phone_otp_challenges")
    .update({
      verified_at: nowIso,
      updated_at: nowIso,
    })
    .eq("user_id", userId);
  if (error) return fail(500, "server_error", error.message);
  return { ok: true, data: null };
}

/** 아직 입력할 수 있는 인증번호 — 화면을 나갔다 와도 같은 번호로 이어서 입력 (Owner 2026-11-09). */
export type PendingPhoneOtpChallenge = {
  /** 보낸 번호 (E.164, +63…/+82…) */
  phone: string;
  expires_at: string;
  /** 재발송 가능 시각 — 이전에는 서버가 429 로 거절 */
  resend_available_at: string;
};

/**
 * 유효한 인증 대기 기록 1건(없으면 null). 만료·인증 완료·시도 횟수 초과면 null — 그때는 새로 보내야 한다.
 * `phone_otp_challenges` 접근은 이 파일만 (phone-otp-contract 테스트).
 */
export async function loadPendingPhoneOtpChallengeForUser(
  sb: SupabaseClient,
  userId: string,
  settings: Pick<AuthPhoneSettings, "resend_cooldown_seconds" | "max_attempts">,
  nowMs: number = Date.now(),
): Promise<PendingPhoneOtpChallenge | null> {
  const challengeResult = await loadPhoneOtpChallenge(sb, userId);
  if (!challengeResult.ok || !challengeResult.data) return null;
  const c = challengeResult.data;
  if (c.verified_at) return null;
  const expiresMs = parseTime(c.otp_expires_at);
  if (!expiresMs || expiresMs <= nowMs) return null;
  if (Number(c.attempt_count ?? 0) >= settings.max_attempts) return null;
  const otpState = await loadProfileOtpState(sb, userId);
  if (!otpState.ok) return null;
  const profileAttempts = Math.max(0, Math.floor(Number(otpState.data.phone_verification_attempt_count ?? 0)));
  if (profileAttempts >= settings.max_attempts) return null;
  const requestedAtMs = parseTime(otpState.data.phone_verification_requested_at);
  const resendAtMs = requestedAtMs > 0 ? requestedAtMs + settings.resend_cooldown_seconds * 1000 : nowMs;
  return {
    phone: c.phone,
    expires_at: new Date(expiresMs).toISOString(),
    resend_available_at: new Date(Math.max(resendAtMs, 0)).toISOString(),
  };
}

export async function sendPhoneOtpForUser(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string,
): Promise<ServiceResult<{ phone: string; settings: AuthPhoneSettings }>> {
  const runtime = await requirePhoneOtpRuntimeEnabled();
  if (!runtime.ok) return runtime;
  const { settings, hashSecret } = runtime.data;

  const target = resolveVerifyTarget(inputPhone);
  if (!target) return invalidPhoneResult();
  const normalizedPhone = target.e164;
  const phoneFields = target.storage;

  const uniqueCheck = await ensurePhoneUnique(sb, userId, inputPhone);
  if (!uniqueCheck.ok) return uniqueCheck;

  const otpState = await loadProfileOtpState(sb, userId);
  if (!otpState.ok) return otpState;
  const requestedAtMs = parseTime(otpState.data.phone_verification_requested_at);
  if (requestedAtMs > 0) {
    const elapsedSec = (Date.now() - requestedAtMs) / 1000;
    if (elapsedSec < settings.resend_cooldown_seconds) {
      const left = Math.ceil(settings.resend_cooldown_seconds - elapsedSec);
      return fail(429, "otp_rate_limited", `재발송은 ${left}초 후 가능합니다.`);
    }
  }

  const otpCode = createOtpCode();
  const otpCodeHash = hashOtpCode(normalizedPhone, otpCode, hashSecret);
  const expiresAtIso = new Date(Date.now() + settings.otp_ttl_seconds * 1000).toISOString();

  const otpRow = await upsertPhoneOtpChallenge(sb, userId, normalizedPhone, otpCodeHash, expiresAtIso);
  if (!otpRow.ok) return otpRow;

  const smsSent = await sendVerifySms(target, otpCode);
  if (!smsSent.ok) {
    await recordPhoneOtpDeliveryEvent(sb, {
      userId,
      outcome: "failed",
      providerCode: `${target.provider}:otp_send_failed`,
      errorSummary: smsSent.error,
    });
    return fail(502, "otp_send_failed", "인증번호 발송에 실패했습니다.");
  }
  await recordPhoneOtpDeliveryEvent(sb, {
    userId,
    outcome: "success",
    providerCode: target.provider,
    providerMessageId: smsSent.providerMessageId,
  });

  // B7/B8: sending a code changes nothing the member already has. The requested number lives in
  // phone_otp_challenges until verify succeeds — the profile phone / verified state are written only
  // by verify. (Before: send cleared phone_verified and stored the unverified number on the profile,
  // demoting verified members and reserving numbers through profiles_phone_unique_idx.)
  const nowIso = new Date().toISOString();
  const { error: profileError } = await sb
    .from("profiles")
    .update({
      phone_verification_requested_at: nowIso,
      phone_verification_attempt_count: 0,
      updated_at: nowIso,
    })
    .eq("id", userId);
  if (profileError) {
    return fail(500, "otp_send_failed", "인증번호 발송에 실패했습니다.");
  }
  // Unverified members show "pending" while a code is outstanding; verified members stay verified.
  await sb
    .from("profiles")
    .update({ phone_verification_status: "pending" })
    .eq("id", userId)
    .or("phone_verified.is.null,phone_verified.eq.false");

  return { ok: true, data: { phone: phoneFields.phone, settings } };
}

export async function verifyPhoneOtpForUser(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string,
  otp: string,
): Promise<ServiceResult<VerifyOtpResult>> {
  const runtime = await requirePhoneOtpRuntimeEnabled();
  if (!runtime.ok) return runtime;
  const { settings, hashSecret } = runtime.data;

  const target = resolveVerifyTarget(inputPhone);
  if (!target) return invalidPhoneResult();
  const normalizedPhone = target.e164;
  const phoneFields = target.storage;
  if (!isValidPhoneOtpCodeInput(String(otp ?? ""))) {
    return fail(400, "otp_invalid", "인증번호를 확인해 주세요.");
  }

  const uniqueCheck = await ensurePhoneUnique(sb, userId, inputPhone);
  if (!uniqueCheck.ok) return uniqueCheck;

  const otpState = await loadProfileOtpState(sb, userId);
  if (!otpState.ok) return otpState;
  const attempted = Math.max(0, Math.floor(Number(otpState.data.phone_verification_attempt_count ?? 0)));
  if (attempted >= settings.max_attempts) {
    return fail(
      429,
      "otp_rate_limited",
      "인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.",
    );
  }

  const challengeResult = await loadPhoneOtpChallenge(sb, userId);
  if (!challengeResult.ok) return challengeResult;
  const challenge = challengeResult.data;
  if (!challenge) {
    return fail(400, "otp_required", "먼저 인증번호를 요청해 주세요.");
  }
  const challengeTarget = resolveVerifyPhone(challenge.phone);
  if (!challengeTarget || challengeTarget.e164 !== normalizedPhone) {
    return fail(400, "otp_phone_mismatch", "요청한 전화번호와 인증 대상 번호가 다릅니다.");
  }
  if (new Date(challenge.otp_expires_at).getTime() < Date.now()) {
    return fail(400, "otp_expired", "인증번호가 만료되었습니다. 다시 요청해 주세요.");
  }
  if (challenge.attempt_count >= settings.max_attempts) {
    await bumpOtpAttemptCount(sb, userId, challenge.attempt_count);
    return fail(
      429,
      "otp_rate_limited",
      "인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요.",
    );
  }

  const challengePhoneE164 = challengeTarget.e164;
  const providedHash = hashOtpCode(challengePhoneE164, String(otp).trim(), hashSecret);
  if (providedHash !== challenge.otp_code_hash) {
    await updatePhoneOtpChallengeAttempts(sb, userId, challenge.attempt_count + 1);
    await bumpOtpAttemptCount(sb, userId, attempted + 1);
    return fail(400, "otp_invalid", "인증번호가 올바르지 않습니다.");
  }

  const nowIso = new Date().toISOString();
  const phoneUpdate = {
    phone: phoneFields.phone,
    phone_country_code: phoneFields.phone_country_code,
    phone_number: phoneFields.phone_number,
    phone_verified: true,
    phone_verified_at: nowIso,
    phone_verification_status: "verified",
    phone_verification_method: target.provider,
    phone_verification_attempt_count: 0,
    // 필리핀 번호만 기존처럼 PH 로 맞춘다 — 한국 번호 인증은 회원의 나라 설정을 바꾸지 않는다.
    ...(target.country === "PH" ? { preferred_country: "PH" } : {}),
    updated_at: nowIso,
  };
  let promoted = false;
  if (isPhoneVerifyLifecyclePromotable(otpState.data)) {
    const { data: promotedRows, error: promoteError } = await sb
      .from("profiles")
      .update({
        ...phoneUpdate,
        member_status: "active",
        verified_member_at: nowIso,
        status: "verified_user",
      })
      .eq("id", userId)
      .is("deleted_at", null)
      .or(PHONE_VERIFY_RESTRICTED_STATUS_FILTER)
      .select("id");
    if (promoteError) {
      // profiles_phone_unique_idx — another member verified this number between check and write.
      if ((promoteError as { code?: string }).code === "23505") return phoneDuplicateResult();
      return fail(500, "server_error", promoteError.message);
    }
    promoted = Array.isArray(promotedRows) && promotedRows.length > 0;
  }
  if (!promoted) {
    // 제재 회원(또는 읽기 이후 제재된 회원): 전화 필드만 갱신, 생애주기 상태는 그대로.
    const { error } = await sb.from("profiles").update(phoneUpdate).eq("id", userId);
    if (error) {
      if ((error as { code?: string }).code === "23505") return phoneDuplicateResult();
      return fail(500, "server_error", error.message);
    }
  }
  const marked = await markPhoneOtpChallengeVerified(sb, userId);
  if (!marked.ok) return marked;

  return {
    ok: true,
    data: {
      phone: phoneFields.phone,
      member_status: promoted ? "active" : String(otpState.data.member_status ?? ""),
      phone_verified: true,
      verification_method: target.provider,
    },
  };
}
