/**
 * Required member consents SSOT: terms + privacy versions + age gate.
 * Marketing is optional and never part of this gate.
 */
import {
  hasStoreTermsConsent,
  type RequiredStoreConsentVersions,
} from "@/lib/auth/store-member-policy";
import { hasAgeGateConsent, type AgeGateProfileFields } from "@/lib/legal/member-age-gate";

export type RequiredConsentProfileFields = AgeGateProfileFields & {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
};

export function hasRequiredMemberConsents(
  profile: RequiredConsentProfileFields | null | undefined,
  required?: RequiredStoreConsentVersions | null,
  at?: Date,
): boolean {
  return hasStoreTermsConsent(profile, required) && hasAgeGateConsent(profile, at);
}

export type RequiredConsentGap =
  | "terms_privacy"
  | "age"
  | "terms_privacy_and_age"
  | null;

export function resolveRequiredConsentGap(
  profile: RequiredConsentProfileFields | null | undefined,
  required?: RequiredStoreConsentVersions | null,
  at?: Date,
): RequiredConsentGap {
  const legalOk = hasStoreTermsConsent(profile, required);
  const ageOk = hasAgeGateConsent(profile, at);
  if (legalOk && ageOk) return null;
  if (!legalOk && !ageOk) return "terms_privacy_and_age";
  if (!legalOk) return "terms_privacy";
  return "age";
}
