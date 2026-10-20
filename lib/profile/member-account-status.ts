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
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { formatProfilePhoneForDisplay } from "@/lib/profile/admin-phone-verification-sync";
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
