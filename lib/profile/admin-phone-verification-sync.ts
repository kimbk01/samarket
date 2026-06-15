import type { SupabaseClient } from "@supabase/supabase-js";
import {
  profilePhoneStorageFieldsFromDb09,
  resolveProfilePhoneDb09,
  type ProfilePhoneRowSlice,
} from "@/lib/profile/resolve-profile-phone";
import { formatPhMobileDisplayPlus63 } from "@/lib/utils/ph-mobile";

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
