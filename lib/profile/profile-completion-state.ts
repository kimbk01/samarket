import { isPublicIdSetupComplete } from "@/lib/auth/dibay-public-id-ssot";
import { hasValidDisplayName, hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import type { ProfileRow } from "@/lib/profile/types";

export type ProfileCompletionState = {
  hasNickname: boolean;
  hasDibayId: boolean;
  hasVerifiedPhone: boolean;
  hasDefaultAddress: boolean;
};

export function deriveProfileCompletionState(
  profile: ProfileRow | null | undefined,
  opts?: { hasDefaultAddress?: boolean },
): ProfileCompletionState {
  const hasDefaultAddress = opts?.hasDefaultAddress === true;
  if (!profile) {
    return {
      hasNickname: false,
      hasDibayId: false,
      hasVerifiedPhone: false,
      hasDefaultAddress,
    };
  }
  return {
    hasNickname: hasValidDisplayName(profile),
    hasDibayId: isPublicIdSetupComplete(profile),
    hasVerifiedPhone: hasVerifiedPhone(profile),
    hasDefaultAddress,
  };
}

export function countIncompleteProfileFields(state: ProfileCompletionState): number {
  let n = 0;
  if (!state.hasNickname) n += 1;
  if (!state.hasDibayId) n += 1;
  if (!state.hasVerifiedPhone) n += 1;
  if (!state.hasDefaultAddress) n += 1;
  return n;
}

export function shouldShowProfileCompletionNudge(state: ProfileCompletionState): boolean {
  return countIncompleteProfileFields(state) >= 2;
}
