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
  type ProfileActionType,
  type ProfileRequirementField,
} from "@/lib/profile/profile-requirements";

export type { ProfileCompletionRequiredDetail };

function isPhoneOnlyMissing(fields: ProfileRequirementField[]): boolean {
  return fields.length > 0 && fields.every((field) => field === "phone_verified" || field === "recipient_phone");
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

  if (hasDefaultAddress === undefined && needsAddress) {
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
  const evaluation = await evaluateClientProfileRequirements(profile, actionType);
  if (evaluation.satisfied) return true;
  if (isPhoneOnlyMissing(evaluation.missingFields)) {
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
