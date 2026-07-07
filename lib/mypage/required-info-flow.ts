import {
  deriveProfileCompletionState,
  type ProfileCompletionState,
} from "@/lib/profile/profile-completion-state";
import type { ProfileRow } from "@/lib/profile/types";

/** 단일 필수정보 등록 Flow 진입 경로 */
export const MYPAGE_REQUIRED_FLOW_HREF = "/mypage/required" as const;

export type RequiredInfoStep = "dibay-id" | "phone" | "address";

export const REQUIRED_INFO_STEP_ORDER: readonly RequiredInfoStep[] = [
  "dibay-id",
  "phone",
  "address",
] as const;

export type RequiredInfoBundleState = Pick<
  ProfileCompletionState,
  "hasDibayId" | "hasVerifiedPhone" | "hasDefaultAddress"
>;

export function pickRequiredInfoBundleState(
  completion: ProfileCompletionState,
): RequiredInfoBundleState {
  return {
    hasDibayId: completion.hasDibayId,
    hasVerifiedPhone: completion.hasVerifiedPhone,
    hasDefaultAddress: completion.hasDefaultAddress,
  };
}

export function deriveRequiredInfoBundleFromProfile(
  profile: ProfileRow | null | undefined,
  opts?: { hasDefaultAddress?: boolean },
): RequiredInfoBundleState {
  return pickRequiredInfoBundleState(
    deriveProfileCompletionState(profile, opts),
  );
}

export function isRequiredInfoBundleComplete(bundle: RequiredInfoBundleState): boolean {
  return bundle.hasDibayId && bundle.hasVerifiedPhone && bundle.hasDefaultAddress;
}

export function resolveFirstIncompleteStep(
  bundle: RequiredInfoBundleState,
): RequiredInfoStep | null {
  if (!bundle.hasDibayId) return "dibay-id";
  if (!bundle.hasVerifiedPhone) return "phone";
  if (!bundle.hasDefaultAddress) return "address";
  return null;
}

export function resolveRequiredInfoStepIndex(step: RequiredInfoStep): number {
  return REQUIRED_INFO_STEP_ORDER.indexOf(step) + 1;
}

export function buildRequiredInfoAddressHref(): string {
  return `/mypage/addresses?returnTo=${encodeURIComponent(MYPAGE_REQUIRED_FLOW_HREF)}`;
}

export function countRequiredInfoBundleComplete(bundle: RequiredInfoBundleState): number {
  let n = 0;
  if (bundle.hasDibayId) n += 1;
  if (bundle.hasVerifiedPhone) n += 1;
  if (bundle.hasDefaultAddress) n += 1;
  return n;
}
