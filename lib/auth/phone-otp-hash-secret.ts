/**
 * OTP hash secret — required (no default fallback).
 * CONTRACT: missing/blank secret → send/verify/ON refuse fail-closed.
 */
export function resolvePhoneOtpHashSecret():
  | { ok: true; secret: string }
  | { ok: false; error: "phone_otp_hash_secret_missing" } {
  const raw = process.env.PHONE_OTP_HASH_SECRET?.trim() ?? "";
  if (!raw || raw === "samarket-phone-otp-hash") {
    return { ok: false, error: "phone_otp_hash_secret_missing" };
  }
  return { ok: true, secret: raw };
}

export function isPhoneOtpHashSecretConfigured(): boolean {
  return resolvePhoneOtpHashSecret().ok;
}
