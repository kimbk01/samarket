/**
 * Member account / verification control-center status.
 *
 * CONTRACT
 * - @id / phone / address are managed on one MyPage card.
 * - They are NOT one "3/3 required verification" bundle.
 * - Feature gates must not read completedCount / allComplete.
 * - HANDLE custom change is never an action requirement.
 *
 * DO NOT
 * - Treat auto-assigned dibay_* as incomplete.
 * - Treat phone string presence as verified.
 * - Treat region_name as default-address complete.
 */

import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import { hasVerifiedPhone, type PhoneVerificationGateInput } from "@/lib/auth/post-login-profile-policy";
import { DEFAULT_PHONE_OTP_TTL_SECONDS } from "@/lib/auth/phone-otp-contract";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
import { maskProfilePhoneForDisplay } from "@/lib/mypage/mask-profile-phone";
import type { ProfileRow } from "@/lib/profile/types";

export type MemberHandleStatus = {
  value: string | null;
  atDisplay: string | null;
  autoAssigned: boolean;
  canChange: boolean;
  changedOnce: boolean;
};

/**
 * 표시 상태 — 인증 플래그와 번호 컬럼은 따로 계산되므로(관리자 면제·수동 승인 = 인증됨·번호 없음)
 * 화면은 이 값 하나로 분기한다. 「등록된 번호 없음」+「인증 완료」 동시 표기 금지.
 */
export type MemberPhonePresentation = "verified" | "verified_without_number" | "unverified";

export type MemberPhoneStatus = {
  value: string | null;
  verified: boolean;
  presentation: MemberPhonePresentation;
};

export type MemberAddressStatus = {
  registered: boolean;
};

export type MemberAccountStatus = {
  handle: MemberHandleStatus;
  phone: MemberPhoneStatus;
  address: MemberAddressStatus;
};

function pickTrimmed(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveMemberPhoneDisplay(profile: ProfileRow | null | undefined): string | null {
  if (!profile) return null;
  const formatted = formatProfilePhoneForDisplay({
    phone: profile.phone ?? null,
    phone_country_code: profile.phone_country_code ?? null,
    phone_number: profile.phone_number ?? null,
  }).trim();
  if (formatted) return formatted;
  return pickTrimmed(profile.phone);
}

export function deriveMemberAccountStatus(
  profile: ProfileRow | null | undefined,
  opts: { hasDefaultAddress: boolean },
): MemberAccountStatus {
  const view = evaluatePublicIdProfileView(profile ?? {});
  const phoneValue = resolveMemberPhoneDisplay(profile);
  const phoneVerified = hasVerifiedPhone(profile);
  return {
    handle: {
      value: pickTrimmed(profile?.dibay_id) ?? pickTrimmed(view.atDisplay),
      atDisplay: view.atDisplay,
      autoAssigned: view.autoAssigned,
      canChange: view.canChangeOnce,
      changedOnce: view.changeComplete,
    },
    phone: {
      value: phoneValue,
      verified: phoneVerified,
      presentation: !phoneVerified ? "unverified" : phoneValue ? "verified" : "verified_without_number",
    },
    address: {
      registered: opts.hasDefaultAddress === true,
    },
  };
}

/**
 * 전화 표시 상태 (real-screen-redesign §11-2) — 홈 필수정보·계정(S03)·전화 인증(S05) **3곳 공통 단일 판정**.
 * 인증 여부는 `hasVerifiedPhone` 그대로(정책 불변). 이 함수는 「어떻게 보여줄지」만 정한다.
 *
 * - `verified`: `hasVerifiedPhone` 통과 → 「인증 완료」. 번호가 없어도(과거 관리자 수동 인증 등) 인증 회원과 동일 —
 *   인증 = 권한 계약(Owner 2026-10-30). 번호 없음은 `masked=null` 로만 표시한다.
 * - `pending` / `pending_expired`: 미인증 + status `pending` — `requested_at` 이 TTL 안이면 진행 중, 아니면(없음 포함) 만료
 */
export type MemberPhoneStateKind =
  | "unverified"
  | "unverified_with_number"
  | "pending"
  | "pending_expired"
  | "verified";

export type MemberPhoneState = {
  kind: MemberPhoneStateKind;
  /** 기존 인증 판정(`hasVerifiedPhone`) — 기능 게이트와 동일 */
  verified: boolean;
  /** 마스킹된 번호 — 번호 없으면 null */
  masked: string | null;
};

export type MemberPhoneStateInput = PhoneVerificationGateInput & {
  phone?: string | null;
  phone_country_code?: string | null;
  phone_number?: string | null;
  phone_verification_status?: string | null;
  phone_verification_requested_at?: string | null;
};

function parseIsoMs(v: string | null | undefined): number | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

export function resolveMemberPhoneState(
  input: MemberPhoneStateInput | null | undefined,
  opts?: { nowMs?: number; otpTtlSeconds?: number },
): MemberPhoneState {
  if (!input) return { kind: "unverified", verified: false, masked: null };
  const formatted =
    formatProfilePhoneForDisplay({
      phone: input.phone ?? null,
      phone_country_code: input.phone_country_code ?? null,
      phone_number: input.phone_number ?? null,
    }).trim() || pickTrimmed(input.phone) || "";
  const masked = maskProfilePhoneForDisplay(formatted) || null;
  const verified = hasVerifiedPhone(input);
  if (verified) return { kind: "verified", verified, masked };
  if (pickTrimmed(input.phone_verification_status)?.toLowerCase() === "pending") {
    const requestedAt = parseIsoMs(input.phone_verification_requested_at);
    const ttlMs = Math.max(1, opts?.otpTtlSeconds ?? DEFAULT_PHONE_OTP_TTL_SECONDS) * 1000;
    const now = opts?.nowMs ?? Date.now();
    // 기기 시계가 서버보다 늦어 requested_at 이 미래로 보이는 경우도 진행 중으로 본다
    const live = requestedAt != null && now - requestedAt <= ttlMs;
    return { kind: live ? "pending" : "pending_expired", verified, masked };
  }
  return masked
    ? { kind: "unverified_with_number", verified, masked }
    : { kind: "unverified", verified, masked: null };
}
