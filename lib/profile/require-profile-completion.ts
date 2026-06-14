import {
  hasValidDisplayName,
  hasVerifiedPhone,
  isDibayIdComplete,
  type ProfileFieldCheckInput,
} from "@/lib/auth/post-login-profile-policy";
import {
  ACTION_PROFILE_REQUIREMENTS,
  type ProfileActionType,
  type ProfileRequirementField,
} from "@/lib/profile/profile-requirements";

export type ProfileRequirementEvaluation = {
  actionType: ProfileActionType;
  satisfied: boolean;
  missingFields: ProfileRequirementField[];
};

function isFieldSatisfied(
  field: ProfileRequirementField,
  profile: ProfileFieldCheckInput
): boolean {
  switch (field) {
    case "display_name":
      return hasValidDisplayName(profile);
    case "phone_verified":
      return hasVerifiedPhone(profile);
    case "dibay_id":
      return isDibayIdComplete(profile);
    case "default_address":
      return profile.has_default_address === true;
    case "recipient_phone":
      return hasVerifiedPhone(profile);
    default:
      return true;
  }
}

export function evaluateProfileRequirements(
  profile: ProfileFieldCheckInput | null | undefined,
  actionType: ProfileActionType
): ProfileRequirementEvaluation {
  const required = ACTION_PROFILE_REQUIREMENTS[actionType] ?? [];
  const missingFields = required.filter((field) => !isFieldSatisfied(field, profile ?? {}));
  return {
    actionType,
    satisfied: missingFields.length === 0,
    missingFields,
  };
}

export function isProfileRequirementSatisfied(
  profile: ProfileFieldCheckInput | null | undefined,
  actionType: ProfileActionType
): boolean {
  return evaluateProfileRequirements(profile, actionType).satisfied;
}
