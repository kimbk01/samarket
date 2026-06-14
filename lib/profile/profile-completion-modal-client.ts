import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import {
  buildRequiredQuery,
  modalVariantForAction,
  type ProfileActionType,
} from "@/lib/profile/profile-requirements";
import type { ProfileRequirementField } from "@/lib/profile/profile-requirements";

export type ProfileCompletionRequiredDetail = {
  actionType: ProfileActionType;
  missingFields: ProfileRequirementField[];
  next?: string;
  token?: string;
};

export const DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT = "dibay:profile-completion-required" as const;

export function buildProfileEditHref(opts?: {
  required?: string | ProfileRequirementField[];
  /** 복귀 경로 (canonical) */
  returnTo?: string | null;
  /** @deprecated `returnTo` 사용 */
  next?: string | null;
}): string {
  const params = new URLSearchParams();
  const required =
    typeof opts?.required === "string"
      ? opts.required
      : opts?.required?.length
        ? buildRequiredQuery(opts.required)
        : null;
  if (required) params.set("required", required);
  const safeReturnTo = sanitizeNextPath(opts?.returnTo ?? opts?.next ?? null);
  if (safeReturnTo) params.set("returnTo", safeReturnTo);
  const qs = params.toString();
  return qs ? `${MYPAGE_PROFILE_EDIT_HREF}?${qs}` : MYPAGE_PROFILE_EDIT_HREF;
}

export function openProfileCompletionRequiredModal(detail: ProfileCompletionRequiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ProfileCompletionRequiredDetail>(DIBAY_PROFILE_COMPLETION_REQUIRED_EVENT, {
      detail,
    })
  );
}

export { modalVariantForAction };
