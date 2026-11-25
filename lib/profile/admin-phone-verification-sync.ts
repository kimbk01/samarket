import type { SupabaseClient } from "@supabase/supabase-js";
import {
  profilePhoneStorageFieldsFromDb09,
  resolveProfilePhoneDb09,
  resolveProfilePhoneKrE164,
  resolveProfilePhoneStored,
  type ProfilePhoneRowSlice,
} from "@/lib/profile/resolve-profile-phone";
import { formatKoreaMobileLocal } from "@/lib/phone/verify-phone-number";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import { hasVerifiedPhone, type PhoneVerificationGateInput } from "@/lib/auth/post-login-profile-policy";

export type ProfilePhoneVerificationMethod = "admin_manual" | "semaphore_local" | "solapi";

/**
 * 승격해도 되는 계정 상태 — 제재·탈퇴가 아닌 회원. 회원 OTP 경로(`phone-otp-service` `PHONE_VERIFY_RESTRICTED_STATUS_FILTER`)와
 * **같은 식**(운영에서 쓰는 PostgREST 조건) — 정지·차단·탈퇴·삭제·비활성은 바꾸지 않는다.
 */
const ADMIN_PHONE_VERIFY_PROMOTABLE_STATUS_FILTER =
  "status.is.null,status.not.in.(suspended,blocked,withdrawn,deleted,deactivated)";

/**
 * 관리자 전화 인증 승인 뒤 계정 상태 승격 — 정지·차단·탈퇴(deleted_at 포함) 회원은 바꾸지 않는다(DB 조건으로 경쟁 상황 포함).
 * 반환: 승격했는지(감사 기록용). 실패는 삼키고 false — 전화 인증 자체는 이미 저장됨.
 */
export async function promoteLifecycleAfterAdminPhoneVerified(
  sb: SupabaseClient,
  userId: string,
  nowIso: string = new Date().toISOString(),
): Promise<boolean> {
  try {
    const { data, error } = await sb
      .from("profiles")
      .update({ status: "verified_user", updated_at: nowIso })
      .eq("id", userId)
      .is("deleted_at", null)
      .or(ADMIN_PHONE_VERIFY_PROMOTABLE_STATUS_FILTER)
      .select("id");
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

const PROFILE_PHONE_ROW_SELECT = "phone, phone_country_code, phone_number";

/**
 * OTP `verifyPhoneOtpForUser` 와 동일한 정회원 전화 인증 필드.
 * 관리자 승인·회원 수정 API 가 같은 gate·UI·캐시 경로를 타도록 단일 패치.
 */
export function buildPhoneVerifiedMemberPatch(input: {
  method: ProfilePhoneVerificationMethod;
  phoneRow?: ProfilePhoneRowSlice | null;
  nowIso?: string;
}): Record<string, unknown> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const patch: Record<string, unknown> = {
    phone_verified: true,
    phone_verified_at: nowIso,
    phone_verification_status: "verified",
    phone_verification_method: input.method,
    member_status: "active",
    verified_member_at: nowIso,
    /**
     * 계정 상태(`status`)는 넣지 않는다 — 정지·차단·탈퇴 회원의 제재를 풀어 버리던 결함(전체 감사 B1).
     * 승격은 `promoteLifecycleAfterAdminPhoneVerified`(제재 아닌 회원만, DB 조건) 로 따로.
     */
    phone_verification_attempt_count: 0,
    updated_at: nowIso,
  };

  const resolved = input.phoneRow ? resolveProfilePhoneDb09(input.phoneRow) : null;
  if (resolved) {
    Object.assign(patch, profilePhoneStorageFieldsFromDb09(resolved), { preferred_country: "PH" });
  } else if (!(input.phoneRow && resolveProfilePhoneKrE164(input.phoneRow))) {
    // 번호 없는 수동 인증(레거시) — 이전처럼 PH. 한국 번호 회원은 나라 설정을 바꾸지 않는다.
    patch.preferred_country = "PH";
  }

  return patch;
}

/**
 * 관리자 수동 인증은 저장된(또는 같은 요청에서 저장할) 전화번호가 있어야 한다 (Owner 승인 2026-10-20).
 * 번호 없이 「인증됨」만 남는 회원(운영 34명 사례)을 더 만들지 않는다. 기존 회원 데이터·인증 판정은 변경하지 않는다.
 */
export function hasPhoneForAdminManualVerify(
  phoneRow: ProfilePhoneRowSlice | null | undefined,
  nextPhonePatch?: Record<string, unknown> | null,
): boolean {
  if (nextPhonePatch) {
    return resolveProfilePhoneStored(nextPhonePatch as ProfilePhoneRowSlice) != null;
  }
  return phoneRow ? resolveProfilePhoneStored(phoneRow) != null : false;
}

export function buildPhoneVerificationResetPatch(nowIso?: string): Record<string, unknown> {
  const ts = nowIso ?? new Date().toISOString();
  return {
    phone_verified: false,
    phone_verification_status: "unverified",
    phone_verified_at: null,
    phone_verification_method: null,
    member_status: "pending",
    verified_member_at: null,
    updated_at: ts,
  };
}

export async function loadProfilePhoneRowSlice(
  sb: SupabaseClient,
  userId: string,
): Promise<ProfilePhoneRowSlice | null> {
  const { data: row } = await sb
    .from("profiles")
    .select(PROFILE_PHONE_ROW_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (!row) return null;
  return row as ProfilePhoneRowSlice;
}

/** 나의정보·프로필 수정 readonly — `phone` / `phone_number` 레거시 복원 후 +63 표기 */
export function formatProfilePhoneForDisplay(row: ProfilePhoneRowSlice): string {
  const db09 = resolveProfilePhoneDb09(row);
  if (db09) return formatPhMobileDisplayPlus63(db09);
  const kr = resolveProfilePhoneKrE164(row);
  // `+82 10 1234 5678` — 국가번호 + 국내 번호(앞 0 제외)
  if (kr) return `+82 ${formatKoreaMobileLocal(`0${kr.slice(3)}`).slice(1)}`;
  return "";
}

export type AdminPhoneVerificationStatus = "unverified" | "pending" | "verified" | "rejected";

/** Admin 4-state status set (manual). verified uses same gate fields as approve. */
export function buildPhoneVerificationStatusPatch(input: {
  status: AdminPhoneVerificationStatus;
  phoneRow?: ProfilePhoneRowSlice | null;
  nowIso?: string;
}): Record<string, unknown> {
  const status = input.status;
  if (status === "verified") {
    return buildPhoneVerifiedMemberPatch({
      method: "admin_manual",
      phoneRow: input.phoneRow,
      nowIso: input.nowIso,
    });
  }
  if (status === "unverified") {
    return buildPhoneVerificationResetPatch(input.nowIso);
  }
  const ts = input.nowIso ?? new Date().toISOString();
  /**
   * pending·rejected 는 인증 완료가 아니다. method 를 `admin_manual` 로 두면 `hasVerifiedPhone` 이
   * 인증 완료로 판정해 앱(통과)과 관리자(미인증) 상태가 어긋난다(감사 #8) — method 는 비운다.
   */
  const patch: Record<string, unknown> = {
    phone_verified: false,
    phone_verified_at: null,
    phone_verification_status: status,
    phone_verification_method: null,
    member_status: "pending",
    verified_member_at: null,
    updated_at: ts,
  };
  const resolved = input.phoneRow ? resolveProfilePhoneDb09(input.phoneRow) : null;
  if (resolved) {
    Object.assign(patch, profilePhoneStorageFieldsFromDb09(resolved));
  }
  return patch;
}


export type PhoneVerificationDisplayStatus = "verified" | "pending" | "rejected" | "unverified";

/**
 * 앱·관리자 공통 표시 상태 — 인증 완료 여부는 앱 게이트와 같은 `hasVerifiedPhone` 으로만 판정한다.
 * `phone_verification_status` 원시값만 보면 과거 OTP 인증 회원(상태 컬럼 미갱신)이 관리자에서 미인증으로 보인다.
 */
export function resolvePhoneVerificationDisplayStatus(
  row: PhoneVerificationGateInput & { phone_verification_status?: string | null; phone?: string | null }
): PhoneVerificationDisplayStatus {
  if (hasVerifiedPhone(row)) return "verified";
  const raw = String(row.phone_verification_status ?? "").trim().toLowerCase();
  if (raw === "pending" || raw === "rejected") return raw;
  return "unverified";
}
