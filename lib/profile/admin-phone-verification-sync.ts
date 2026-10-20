import type { SupabaseClient } from "@supabase/supabase-js";
import {
  profilePhoneStorageFieldsFromDb09,
  resolveProfilePhoneDb09,
  type ProfilePhoneRowSlice,
} from "@/lib/profile/resolve-profile-phone";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";
import { hasVerifiedPhone, type PhoneVerificationGateInput } from "@/lib/auth/post-login-profile-policy";

export type ProfilePhoneVerificationMethod = "admin_manual" | "semaphore_local";

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
    status: "verified_user",
    preferred_country: "PH",
    phone_verification_attempt_count: 0,
    updated_at: nowIso,
  };

  const resolved = input.phoneRow ? resolveProfilePhoneDb09(input.phoneRow) : null;
  if (resolved) {
    Object.assign(patch, profilePhoneStorageFieldsFromDb09(resolved));
  }

  return patch;
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
  if (!db09) return "";
  return formatPhMobileDisplayPlus63(db09);
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
