import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import { loadAuthPhoneSettings, type AuthPhoneSettings } from "@/lib/auth/auth-phone-settings";
import {
  isValidPhilippinesMobilePhone,
  normalizePhilippinesPhoneNumber,
} from "@/lib/phone/philippines-phone";
import { sendSemaphoreSms } from "@/lib/auth/semaphore-sms";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

type VerifyOtpResult = {
  phone: string;
  member_status: "active";
  phone_verified: true;
  verification_method: "semaphore_local";
};

function invalidPhoneResult(): ServiceResult<never> {
  return { ok: false, status: 400, message: "필리핀 휴대폰 번호 형식을 확인해 주세요. 예: +639171234567" };
}

async function ensurePhoneUnique(
  sb: SupabaseClient,
  userId: string,
  normalizedPhone: string
): Promise<ServiceResult<null>> {
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .eq("phone", normalizedPhone)
    .neq("id", userId)
    .limit(1);
  if (error) return { ok: false, status: 500, message: error.message };
  if ((data?.length ?? 0) > 0) {
    return { ok: false, status: 409, message: "이미 다른 계정에서 사용 중인 전화번호입니다." };
  }
  return { ok: true, data: null };
}

type ProfileOtpState = {
  phone_verification_requested_at?: string | null;
  phone_verification_attempt_count?: number | null;
};

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
    .select("phone_verification_requested_at, phone_verification_attempt_count")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
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

function getOtpHashSecret(): string {
  const raw = process.env.PHONE_OTP_HASH_SECRET?.trim();
  return raw && raw.length > 0 ? raw : "samarket-phone-otp-hash";
}

function createOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

function hashOtpCode(phone: string, otpCode: string): string {
  const secret = getOtpHashSecret();
  return createHash("sha256")
    .update(`${phone}:${otpCode}:${secret}`)
    .digest("hex");
}

async function upsertPhoneOtpChallenge(
  sb: SupabaseClient,
  userId: string,
  phone: string,
  otpCodeHash: string,
  expiresAtIso: string
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
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, data: null };
}

async function loadPhoneOtpChallenge(sb: SupabaseClient, userId: string): Promise<ServiceResult<PhoneOtpChallengeRow | null>> {
  const { data, error } = await sb
    .from("phone_otp_challenges")
    .select("user_id, phone, otp_code_hash, otp_expires_at, attempt_count, verified_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, data: (data as PhoneOtpChallengeRow | null) ?? null };
}

async function updatePhoneOtpChallengeAttempts(
  sb: SupabaseClient,
  userId: string,
  nextAttemptCount: number
): Promise<ServiceResult<null>> {
  const { error } = await sb
    .from("phone_otp_challenges")
    .update({
      attempt_count: Math.max(0, nextAttemptCount),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) return { ok: false, status: 500, message: error.message };
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
  if (error) return { ok: false, status: 500, message: error.message };
  return { ok: true, data: null };
}

export async function sendPhoneOtpForUser(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string
): Promise<ServiceResult<{ phone: string; settings: AuthPhoneSettings }>> {
  const settings = await loadAuthPhoneSettings();
  if (!settings.enabled) {
    return { ok: false, status: 403, message: "전화 인증 기능이 현재 비활성화되어 있습니다." };
  }

  const normalizedPhone = normalizePhilippinesPhoneNumber(inputPhone);
  if (!isValidPhilippinesMobilePhone(normalizedPhone)) return invalidPhoneResult();

  const uniqueCheck = await ensurePhoneUnique(sb, userId, normalizedPhone);
  if (!uniqueCheck.ok) return uniqueCheck;

  const otpState = await loadProfileOtpState(sb, userId);
  if (!otpState.ok) return otpState;
  const requestedAtMs = parseTime(otpState.data.phone_verification_requested_at);
  if (requestedAtMs > 0) {
    const elapsedSec = (Date.now() - requestedAtMs) / 1000;
    if (elapsedSec < settings.resend_cooldown_seconds) {
      const left = Math.ceil(settings.resend_cooldown_seconds - elapsedSec);
      return { ok: false, status: 429, message: `재발송은 ${left}초 후 가능합니다.` };
    }
  }

  const otpCode = createOtpCode();
  const otpCodeHash = hashOtpCode(normalizedPhone, otpCode);
  const expiresAtIso = new Date(Date.now() + settings.otp_ttl_seconds * 1000).toISOString();

  const otpRow = await upsertPhoneOtpChallenge(sb, userId, normalizedPhone, otpCodeHash, expiresAtIso);
  if (!otpRow.ok) return otpRow;

  const smsMessage = `[SAMarket] 인증번호 ${otpCode} (유효 ${Math.floor(settings.otp_ttl_seconds / 60)}분)`;
  const smsSent = await sendSemaphoreSms(normalizedPhone, smsMessage);
  if (!smsSent.ok) {
    return { ok: false, status: 502, message: smsSent.error || "OTP 발송에 실패했습니다." };
  }

  const nowIso = new Date().toISOString();
  const { error: profileError } = await sb
    .from("profiles")
    .update({
      phone: normalizedPhone,
      phone_verified: false,
      phone_verified_at: null,
      phone_verification_method: "semaphore_local",
      phone_verification_requested_at: nowIso,
      phone_verification_attempt_count: 0,
      updated_at: nowIso,
    })
    .eq("id", userId);
  if (profileError) {
    return { ok: false, status: 500, message: profileError.message };
  }

  return { ok: true, data: { phone: normalizedPhone, settings } };
}

export async function verifyPhoneOtpForUser(
  sb: SupabaseClient,
  userId: string,
  inputPhone: string,
  otp: string
): Promise<ServiceResult<VerifyOtpResult>> {
  const normalizedPhone = normalizePhilippinesPhoneNumber(inputPhone);
  if (!isValidPhilippinesMobilePhone(normalizedPhone)) return invalidPhoneResult();
  if (!/^\d{4,8}$/.test(String(otp ?? "").trim())) {
    return { ok: false, status: 400, message: "인증번호를 확인해 주세요." };
  }

  const uniqueCheck = await ensurePhoneUnique(sb, userId, normalizedPhone);
  if (!uniqueCheck.ok) return uniqueCheck;

  const otpState = await loadProfileOtpState(sb, userId);
  if (!otpState.ok) return otpState;
  const attempted = Math.max(0, Math.floor(Number(otpState.data.phone_verification_attempt_count ?? 0)));
  const settings = await loadAuthPhoneSettings();
  if (attempted >= settings.max_attempts) {
    return { ok: false, status: 429, message: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요." };
  }

  const challengeResult = await loadPhoneOtpChallenge(sb, userId);
  if (!challengeResult.ok) return challengeResult;
  const challenge = challengeResult.data;
  if (!challenge) {
    return { ok: false, status: 400, message: "먼저 인증번호를 요청해 주세요." };
  }
  if (challenge.phone !== normalizedPhone) {
    return { ok: false, status: 400, message: "요청한 전화번호와 인증 대상 번호가 다릅니다." };
  }
  if (new Date(challenge.otp_expires_at).getTime() < Date.now()) {
    return { ok: false, status: 400, message: "인증번호가 만료되었습니다. 다시 요청해 주세요." };
  }
  if (challenge.attempt_count >= settings.max_attempts) {
    await bumpOtpAttemptCount(sb, userId, challenge.attempt_count);
    return { ok: false, status: 429, message: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 발송해 주세요." };
  }

  const providedHash = hashOtpCode(normalizedPhone, String(otp).trim());
  if (providedHash !== challenge.otp_code_hash) {
    await updatePhoneOtpChallengeAttempts(sb, userId, challenge.attempt_count + 1);
    await bumpOtpAttemptCount(sb, userId, attempted + 1);
    return { ok: false, status: 400, message: "인증번호가 올바르지 않습니다." };
  }

  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from("profiles")
    .update({
      phone: normalizedPhone,
      phone_verified: true,
      phone_verified_at: nowIso,
      member_status: "active",
      verified_member_at: nowIso,
      status: "verified_user",
      phone_verification_method: "semaphore_local",
      phone_verification_attempt_count: 0,
      updated_at: nowIso,
    })
    .eq("id", userId);
  if (error) return { ok: false, status: 500, message: error.message };
  const marked = await markPhoneOtpChallengeVerified(sb, userId);
  if (!marked.ok) return marked;

  return {
    ok: true,
    data: {
      phone: normalizedPhone,
      member_status: "active",
      phone_verified: true,
      verification_method: "semaphore_local",
    },
  };
}
