"use client";

import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import type { Profile } from "@/lib/types/profile";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { profileToDibaySignupInput } from "@/lib/auth/client-signup-gate";
import { evaluateProfileRequirements } from "@/lib/profile/require-profile-completion";
import type { ProfileFieldCheckInput } from "@/lib/auth/post-login-profile-policy";
import {
  openProfileCompletionRequiredModal,
  type ProfileCompletionRequiredDetail,
} from "@/lib/profile/profile-completion-modal-client";
import {
  ACTION_PROFILE_REQUIREMENTS,
  SERVER_ROUTE_ADDRESS_CHECK_ACTIONS,
  type ProfileActionType,
  type ProfileRequirementField,
} from "@/lib/profile/profile-requirements";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import {
  peekKnownRegistrationPendingStep,
  peekRegistrationPendingKnowledge,
} from "@/lib/auth/registration-pending-state.client";

export type { ProfileCompletionRequiredDetail };

function isPhoneOnlyMissing(fields: ProfileRequirementField[]): boolean {
  return fields.length > 0 && fields.every((field) => field === "phone_verified" || field === "recipient_phone");
}

function hasRegistrationFieldMissing(fields: ProfileRequirementField[]): boolean {
  return fields.includes("phone_verified") || fields.includes("default_address");
}

async function readServerRegistrationComplete(): Promise<boolean> {
  try {
    const { status, json } = await fetchSignupStatusDeduped();
    return status === 200 && json?.registration?.complete === true;
  } catch {
    return false;
  }
}

async function readHasCanonicalDefaultAddress(): Promise<boolean> {
  try {
    const cached = peekFreshAddressDefaultsSnapshot();
    const snap =
      cached ??
      (await fetchAddressDefaultsSnapshot({
        caller: "unknown",
        reason: "unspecified",
      }));
    return snap?.ok === true && snap.defaults?.master != null;
  } catch {
    return false;
  }
}

export async function profileToRequirementInput(
  profile: Profile,
  opts?: { hasDefaultAddress?: boolean; actionType?: ProfileActionType }
): Promise<ProfileFieldCheckInput> {
  let hasDefaultAddress = opts?.hasDefaultAddress;
  const needsAddress =
    opts?.actionType != null
      ? ACTION_PROFILE_REQUIREMENTS[opts.actionType].includes("default_address")
      : hasDefaultAddress === undefined;
  /**
   * 대표 주소가 기능에 필요한 기존 4개 행동만 주소를 직접 조회한다. 나머지(가입 조건으로서의 주소)는 서버가 알려 준
   * 빠진 가입 단계 사본으로 판단 — 누를 때마다 주소 조회가 나가지 않는다(재감사3 #5). 모르면 서버가 판단(통과).
   */
  const addressIsFunctional = opts?.actionType != null && SERVER_ROUTE_ADDRESS_CHECK_ACTIONS.has(opts.actionType);

  if (hasDefaultAddress === undefined && needsAddress && !addressIsFunctional && opts?.actionType != null) {
    hasDefaultAddress = peekKnownRegistrationPendingStep() !== "address";
  } else if (hasDefaultAddress === undefined && needsAddress) {
    hasDefaultAddress = await readHasCanonicalDefaultAddress();
  } else if (hasDefaultAddress === undefined) {
    hasDefaultAddress = false;
  }

  const signupInput = profileToDibaySignupInput(profile);
  return {
    ...signupInput,
    nickname: profile.nickname ?? signupInput.display_name,
    phone_verified: profile.phone_verified,
    phone_verified_at: profile.phone_verified_at ?? null,
    phone_verification_method: profile.phone_verification_method ?? null,
    role: profile.role ?? null,
    provider: profile.provider ?? null,
    auth_provider: profile.auth_provider ?? null,
    email: profile.email ?? null,
    phone: profile.phone ?? null,
    has_default_address: hasDefaultAddress,
  };
}

export async function evaluateClientProfileRequirements(
  profile: Profile,
  actionType: ProfileActionType
) {
  const input = await profileToRequirementInput(profile, { actionType });
  return evaluateProfileRequirements(input, actionType);
}

export async function requireProfileCompletionClient(
  profile: Profile,
  actionType: ProfileActionType,
  detail: Omit<ProfileCompletionRequiredDetail, "actionType" | "missingFields">
): Promise<boolean> {
  let evaluation = await evaluateClientProfileRequirements(profile, actionType);
  if (evaluation.satisfied) return true;
  const knowledge = peekRegistrationPendingKnowledge();
  if (hasRegistrationFieldMissing(evaluation.missingFields) && knowledge !== "unknown") {
    /**
     * 서버가 이미 알려 준 판정을 쓴다(다시 묻지 않음 — 재감사3 #5): 가입 완료(관리자 포함)면 가입 항목을 빼고,
     * 빠진 단계가 있으면 그대로 안내.
     */
    if (knowledge === "complete") {
      const keepAddress = SERVER_ROUTE_ADDRESS_CHECK_ACTIONS.has(actionType);
      const missing = evaluation.missingFields.filter(
        (f) => f !== "phone_verified" && f !== "recipient_phone" && (keepAddress || f !== "default_address"),
      );
      evaluation = { ...evaluation, missingFields: missing, satisfied: missing.length === 0 };
      if (evaluation.satisfied) return true;
    }
  } else if (hasRegistrationFieldMissing(evaluation.missingFields)) {
    /**
     * 화면 사본(프로필 캐시·주소 스냅샷)이 「가입 미완」일 때만 서버 판정 1회로 다시 확인한다 —
     * 특권 관리자 면제·방금 끝낸 인증을 화면이 아직 모를 수 있다(재감사 H2). 서버가 가입 완료면 가입 항목을 뺀다
     * (단, 대표 주소가 기능에 필요한 기존 4개 행동은 주소를 계속 요구).
     */
    const serverSaysRegistered = await readServerRegistrationComplete();
    if (serverSaysRegistered) {
      const keepAddress = SERVER_ROUTE_ADDRESS_CHECK_ACTIONS.has(actionType);
      const missing = evaluation.missingFields.filter(
        (f) => f !== "phone_verified" && f !== "recipient_phone" && (keepAddress || f !== "default_address"),
      );
      evaluation = { ...evaluation, missingFields: missing, satisfied: missing.length === 0 };
      if (evaluation.satisfied) return true;
    }
  }
  /**
   * 가입 조건(전화 인증·대표 주소)이 빠졌으면 「가입을 마치면 이용할 수 있어요」 안내 → 빠진 가입 단계 화면
   * (`MissingProfileInfoModal`, 설계 v3 §4-3). 가입 조건과 무관한 항목만 빠졌을 때는 기존 안내 그대로.
   */
  if (!hasRegistrationFieldMissing(evaluation.missingFields) && isPhoneOnlyMissing(evaluation.missingFields)) {
    openPhoneVerificationRequiredSheet({ next: detail.next });
    return false;
  }
  openProfileCompletionRequiredModal({
    actionType,
    missingFields: evaluation.missingFields,
    ...detail,
  });
  return false;
}
