import {
  isValidPhilippinesMobilePhone,
  normalizePhilippinesPhoneNumber,
} from "@/lib/phone/philippines-phone";
import { profilePhoneStorageFieldsFromDb09 } from "@/lib/profile/resolve-profile-phone";
import { normalizePhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";

/** OTP challenge·해시·E.164 비교용 */
export function philippinesPhoneE164(inputPhone: string): string {
  return normalizePhilippinesPhoneNumber(String(inputPhone ?? "").trim());
}

/** profiles 저장·중복 검사용 `09` + 9자리 */
export function philippinesPhoneDb09(inputPhone: string): string | null {
  const e164 = philippinesPhoneE164(inputPhone);
  if (e164) {
    const fromE164 = normalizePhMobileDb(parsePhMobileInput(e164));
    if (fromE164) return fromE164;
  }
  return normalizePhMobileDb(parsePhMobileInput(inputPhone));
}

export function philippinesPhoneStorageFields(inputPhone: string) {
  return profilePhoneStorageFieldsFromDb09(philippinesPhoneDb09(inputPhone));
}

/** challenge.phone 과 verify 요청 번호 비교 — `09` / `+63` 혼재 허용 */
export function philippinesPhonesMatchForOtp(a: string, b: string): boolean {
  const left = philippinesPhoneE164(a);
  const right = philippinesPhoneE164(b);
  return Boolean(left && right && left === right);
}

/** unique index 검사 — 동일 번호의 `09` / `+63` 표기 모두 조회 */
export function philippinesPhoneLookupVariants(inputPhone: string): string[] {
  const variants = new Set<string>();
  const e164 = philippinesPhoneE164(inputPhone);
  const db09 = philippinesPhoneDb09(inputPhone);
  if (e164 && isValidPhilippinesMobilePhone(e164)) variants.add(e164);
  if (db09) variants.add(db09);
  return [...variants];
}
