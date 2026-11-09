/**
 * CONTRACT — 매장 전화 전용 인증 (Owner 2026-11-10 「회원 전화 인증 DB 와 분리」).
 * - `store_phone_verifications` 접근은 이 파일만.
 * - 회원 전화 인증 기록(회원 OTP 표)·회원 프로필은 읽지도 쓰지도 않는다 → 회원 번호와 같아도 된다.
 * - 매장끼리 같은 번호는 지금 규칙 유지(심사·운영 중 매장과 같은 번호면 거부).
 * - 나라: 매장 전화 저장 형식이 필리핀 휴대폰(`09…`)이라 +63 만 받는다.
 * - 문자 발송은 회원 인증과 같은 함수(`phone-verify-sms`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomInt } from "node:crypto";
import { loadAuthPhoneSettings } from "@/lib/auth/auth-phone-settings";
import { resolvePhoneOtpHashSecret } from "@/lib/auth/phone-otp-hash-secret";
import { isValidPhoneOtpCodeInput } from "@/lib/auth/phone-otp-contract";
import { recordPhoneOtpDeliveryEvent } from "@/lib/auth/phone-otp-ops";
import { resolveVerifyTarget, sendVerifySms } from "@/lib/auth/phone-verify-sms";
import type { ResolvedVerifyPhone } from "@/lib/phone/verify-phone-number";

export type StorePhoneVerifyPurpose = "store_apply" | "store_phone_change";

export const STORE_PHONE_VERIFY_PURPOSES: readonly StorePhoneVerifyPurpose[] = ["store_apply", "store_phone_change"];

/** 인증 후 이 시간 안에 신청·저장해야 한다 */
export const STORE_PHONE_VERIFICATION_USE_WINDOW_MS = 30 * 60 * 1000;

/** 심사·운영 중 매장 — 같은 번호 중복 금지 대상 (`/api/me/stores` 와 같은 목록) */
export const STORE_PHONE_ACTIVE_PIPELINE_STATUSES = [
  "pending",
  "under_review",
  "revision_requested",
  "approved",
  "suspended",
] as const;

export type StorePhoneOtpErrorCode =
  | "store_phone_invalid"
  | "store_phone_already_registered"
  | "store_phone_otp_invalid"
  | "store_phone_otp_expired"
  | "store_phone_otp_required"
  | "store_phone_otp_rate_limited"
  | "store_phone_otp_send_failed"
  | "store_phone_verify_disabled"
  | "store_phone_verification_required"
  | "store_phone_verification_mismatch"
  | "server_error";

type Result<T> = { ok: true; data: T } | { ok: false; status: number; code: StorePhoneOtpErrorCode; retryAfterSec?: number };

function fail(status: number, code: StorePhoneOtpErrorCode, retryAfterSec?: number): Result<never> {
  return { ok: false, status, code, ...(retryAfterSec != null ? { retryAfterSec } : {}) };
}

function parseTime(v: string | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

function hashCode(purpose: StorePhoneVerifyPurpose, e164: string, code: string, secret: string): string {
  return createHash("sha256").update(`store:${purpose}:${e164}:${code}:${secret}`).digest("hex");
}

/** 매장 전화 = 필리핀 휴대폰만 (저장 `09…`) */
export function resolveStorePhoneTarget(inputPhone: string): ResolvedVerifyPhone | null {
  const t = resolveVerifyTarget(inputPhone);
  if (!t || t.country !== "PH") return null;
  return t;
}

async function runtime(): Promise<
  Result<{ ttlSec: number; cooldownSec: number; maxAttempts: number; secret: string }>
> {
  const settings = await loadAuthPhoneSettings();
  if (!settings.enabled) return fail(403, "store_phone_verify_disabled");
  const secret = resolvePhoneOtpHashSecret();
  if (!secret.ok) return fail(503, "store_phone_verify_disabled");
  return {
    ok: true,
    data: {
      ttlSec: settings.otp_ttl_seconds,
      cooldownSec: settings.resend_cooldown_seconds,
      maxAttempts: settings.max_attempts,
      secret: secret.secret,
    },
  };
}

/** 심사·운영 중인 다른 매장이 같은 번호를 쓰는지 (`excludeStoreId` = 내 매장) */
export async function isStorePhoneUsedByOtherStore(
  sb: SupabaseClient,
  phoneDb09: string,
  excludeStoreId: string | null
): Promise<Result<boolean>> {
  let q = sb
    .from("stores")
    .select("id")
    .eq("phone", phoneDb09)
    .in("approval_status", [...STORE_PHONE_ACTIVE_PIPELINE_STATUSES])
    .limit(2);
  if (excludeStoreId) q = q.neq("id", excludeStoreId);
  const { data, error } = await q;
  if (error) return fail(500, "server_error");
  return { ok: true, data: Array.isArray(data) && data.length > 0 };
}

type Row = {
  id: string;
  user_id: string;
  store_id: string | null;
  purpose: StorePhoneVerifyPurpose;
  phone: string;
  otp_code_hash: string;
  otp_expires_at: string;
  attempt_count: number;
  requested_at: string;
  verified_at: string | null;
  consumed_at: string | null;
};

const ROW_SELECT =
  "id, user_id, store_id, purpose, phone, otp_code_hash, otp_expires_at, attempt_count, requested_at, verified_at, consumed_at";

async function loadLatest(sb: SupabaseClient, userId: string, purpose: StorePhoneVerifyPurpose): Promise<Result<Row | null>> {
  const { data, error } = await sb
    .from("store_phone_verifications")
    .select(ROW_SELECT)
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return fail(500, "server_error");
  return { ok: true, data: (data as Row | null) ?? null };
}

/** 인증번호 보내기 — 새 행 1개(이전 기록은 남김). 재발송 대기·매장 중복 검사 후 발송. */
export async function sendStorePhoneOtp(
  sb: SupabaseClient,
  input: { userId: string; phone: string; purpose: StorePhoneVerifyPurpose; storeId: string | null }
): Promise<Result<{ phone: string; expiresAt: string; resendAvailableAt: string }>> {
  const rt = await runtime();
  if (!rt.ok) return rt;
  const target = resolveStorePhoneTarget(input.phone);
  if (!target) return fail(400, "store_phone_invalid");

  const dup = await isStorePhoneUsedByOtherStore(sb, target.storage.phone, input.storeId);
  if (!dup.ok) return dup;
  if (dup.data) return fail(409, "store_phone_already_registered");

  const latest = await loadLatest(sb, input.userId, input.purpose);
  if (!latest.ok) return latest;
  const lastMs = parseTime(latest.data?.requested_at);
  if (lastMs > 0) {
    const elapsed = (Date.now() - lastMs) / 1000;
    if (elapsed < rt.data.cooldownSec) {
      return fail(429, "store_phone_otp_rate_limited", Math.ceil(rt.data.cooldownSec - elapsed));
    }
  }

  const code = String(randomInt(100000, 1000000));
  const now = Date.now();
  const expiresAt = new Date(now + rt.data.ttlSec * 1000).toISOString();
  const { error: insErr } = await sb.from("store_phone_verifications").insert({
    user_id: input.userId,
    store_id: input.storeId,
    purpose: input.purpose,
    phone: target.e164,
    otp_code_hash: hashCode(input.purpose, target.e164, code, rt.data.secret),
    otp_expires_at: expiresAt,
    requested_at: new Date(now).toISOString(),
  });
  if (insErr) return fail(500, "server_error");

  const sent = await sendVerifySms(target, code);
  if (!sent.ok) {
    await recordPhoneOtpDeliveryEvent(sb, {
      userId: input.userId,
      outcome: "failed",
      providerCode: `${target.provider}:otp_send_failed`,
      errorSummary: sent.error,
      purpose: input.purpose,
    });
    return fail(502, "store_phone_otp_send_failed");
  }
  await recordPhoneOtpDeliveryEvent(sb, {
    userId: input.userId,
    outcome: "success",
    providerCode: target.provider,
    providerMessageId: sent.providerMessageId,
    purpose: input.purpose,
  });
  return {
    ok: true,
    data: {
      phone: target.storage.phone,
      expiresAt,
      resendAvailableAt: new Date(now + rt.data.cooldownSec * 1000).toISOString(),
    },
  };
}

/** 인증번호 확인 — 성공하면 인증 기록 id 를 돌려준다(신청·저장 때 이 id 로만 번호를 받는다). */
export async function verifyStorePhoneOtp(
  sb: SupabaseClient,
  input: { userId: string; phone: string; code: string; purpose: StorePhoneVerifyPurpose }
): Promise<Result<{ verificationId: string; phone: string; verifiedAt: string }>> {
  const rt = await runtime();
  if (!rt.ok) return rt;
  const target = resolveStorePhoneTarget(input.phone);
  if (!target) return fail(400, "store_phone_invalid");
  if (!isValidPhoneOtpCodeInput(String(input.code ?? ""))) return fail(400, "store_phone_otp_invalid");

  const latest = await loadLatest(sb, input.userId, input.purpose);
  if (!latest.ok) return latest;
  const row = latest.data;
  if (!row || row.verified_at || row.consumed_at) return fail(400, "store_phone_otp_required");
  if (row.phone !== target.e164) return fail(400, "store_phone_otp_required");
  if (parseTime(row.otp_expires_at) < Date.now()) return fail(400, "store_phone_otp_expired");
  if (row.attempt_count >= rt.data.maxAttempts) return fail(429, "store_phone_otp_rate_limited");

  const provided = hashCode(input.purpose, target.e164, String(input.code).trim(), rt.data.secret);
  if (provided !== row.otp_code_hash) {
    await sb
      .from("store_phone_verifications")
      .update({ attempt_count: row.attempt_count + 1 })
      .eq("id", row.id);
    return fail(400, "store_phone_otp_invalid");
  }
  const verifiedAt = new Date().toISOString();
  const { data: upd, error } = await sb
    .from("store_phone_verifications")
    .update({ verified_at: verifiedAt })
    .eq("id", row.id)
    .is("verified_at", null)
    .select("id")
    .maybeSingle();
  if (error || !upd) return fail(500, "server_error");
  return { ok: true, data: { verificationId: row.id, phone: target.storage.phone, verifiedAt } };
}

/**
 * 신청·번호 변경 저장 때 — 인증 기록 확인 후 사용 처리. 화면이 보낸 번호 문자열은 믿지 않는다.
 * 조건: 본인 · 같은 용도 · 인증됨 · 30분 이내 · 미사용. 사용 처리는 조건부 UPDATE(동시 사용 1번만).
 */
export async function consumeStorePhoneVerification(
  sb: SupabaseClient,
  input: { userId: string; verificationId: string; purpose: StorePhoneVerifyPurpose; storeId: string | null }
): Promise<Result<{ verificationId: string; phoneDb09: string; verifiedAt: string }>> {
  const id = String(input.verificationId ?? "").trim();
  if (!id) return fail(400, "store_phone_verification_required");
  const { data, error } = await sb
    .from("store_phone_verifications")
    .select(ROW_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, "server_error");
  const row = data as Row | null;
  if (!row || row.user_id !== input.userId || row.purpose !== input.purpose || !row.verified_at) {
    return fail(400, "store_phone_verification_required");
  }
  if (row.consumed_at) return fail(400, "store_phone_verification_required");
  if (Date.now() - parseTime(row.verified_at) > STORE_PHONE_VERIFICATION_USE_WINDOW_MS) {
    return fail(400, "store_phone_verification_required");
  }
  if (input.purpose === "store_phone_change" && row.store_id && input.storeId && row.store_id !== input.storeId) {
    return fail(400, "store_phone_verification_mismatch");
  }
  const target = resolveStorePhoneTarget(row.phone);
  if (!target) return fail(400, "store_phone_invalid");
  const { data: upd, error: updErr } = await sb
    .from("store_phone_verifications")
    .update({ consumed_at: new Date().toISOString(), consumed_store_id: input.storeId })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (updErr) return fail(500, "server_error");
  if (!upd) return fail(400, "store_phone_verification_required");
  return { ok: true, data: { verificationId: row.id, phoneDb09: target.storage.phone, verifiedAt: row.verified_at } };
}

/** 저장 실패 시 사용 처리 되돌림 (반쪽 상태 금지) */
export async function releaseStorePhoneVerification(sb: SupabaseClient, verificationId: string): Promise<void> {
  const id = String(verificationId ?? "").trim();
  if (!id) return;
  await sb
    .from("store_phone_verifications")
    .update({ consumed_at: null, consumed_store_id: null })
    .eq("id", id);
}

/** 신청 insert 직후 — 인증 기록을 새 매장에 연결 */
export async function linkStorePhoneVerificationToStore(
  sb: SupabaseClient,
  verificationId: string,
  storeId: string
): Promise<void> {
  await sb
    .from("store_phone_verifications")
    .update({ consumed_store_id: storeId })
    .eq("id", verificationId);
}
