"use client";

import {
  fetchMandatoryAddressGateDeduped,
  peekMandatoryAddressGateCached,
} from "@/lib/addresses/mandatory-address-gate-client";
import type { Profile } from "@/lib/types/profile";
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
} from "@/lib/profile/profile-requirements";

export type { ProfileCompletionRequiredDetail };

async function readHasDefaultAddressFromGate(): Promise<boolean> {
  try {
    const cached = peekMandatoryAddressGateCached();
    const res =
      cached ??
      (await fetchMandatoryAddressGateDeduped({
        component: "require-profile-completion",
        reason: "profileToRequirementInput",
      }));
    if (!res.ok) return false;
    const json = (await res.json()) as { needsBlock?: boolean; authenticated?: boolean };
    return json.authenticated === true && json.needsBlock !== true;
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
    hasDefaultAddress = await readHasDefaultAddressFromGate();
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
  openProfileCompletionRequiredModal({
    actionType,
    missingFields: evaluation.missingFields,
    ...detail,
  });
  return false;
}
