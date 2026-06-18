"use client";

export const DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT = "dibay:phone-verification-required" as const;
export const DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT =
  "dibay:phone-verification-required-dismiss" as const;

export type PhoneVerificationRequiredDetail = {
  /** 인증 완료 후 돌아올 경로 */
  next?: string;
};

export function openPhoneVerificationRequiredSheet(detail?: PhoneVerificationRequiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PhoneVerificationRequiredDetail>(DIBAY_PHONE_VERIFICATION_REQUIRED_EVENT, {
      detail: detail ?? {},
    })
  );
}

export function dismissPhoneVerificationRequiredSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_PHONE_VERIFICATION_REQUIRED_DISMISS_EVENT));
}
