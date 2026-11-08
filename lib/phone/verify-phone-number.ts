/**
 * 전화 인증 번호 — 국가 판정·정규화 단일 정의 (Owner 2026-11-09).
 *   필리핀 +63 → Semaphore · 한국 +82 → Solapi. 그 외 국가는 인증 불가.
 *
 * 저장 형식 (profiles):
 *   PH — phone `09` + 9자리 (기존 계약 유지), phone_country_code `+63`, phone_number `9XXXXXXXXX`
 *   KR — phone E.164 `+8210XXXXXXXX`, phone_country_code `+82`, phone_number `10XXXXXXXX`
 * OTP 해시·challenge.phone 은 두 나라 모두 E.164.
 */
import {
  isValidPhilippinesMobilePhone,
  normalizePhilippinesPhoneNumber,
} from "@/lib/phone/philippines-phone";
import { normalizePhMobileDb, parsePhMobileInput } from "@/lib/utils/ph-mobile";

export type VerifyPhoneCountry = "PH" | "KR";
export type VerifyPhoneProvider = "semaphore_local" | "solapi";

export const VERIFY_PHONE_DIAL_CODE: Record<VerifyPhoneCountry, "+63" | "+82"> = {
  PH: "+63",
  KR: "+82",
};

export const VERIFY_PHONE_PROVIDER: Record<VerifyPhoneCountry, VerifyPhoneProvider> = {
  PH: "semaphore_local",
  KR: "solapi",
};

export type ResolvedVerifyPhone = {
  country: VerifyPhoneCountry;
  /** `+639…` / `+8210…` */
  e164: string;
  provider: VerifyPhoneProvider;
  storage: { phone: string; phone_country_code: string; phone_number: string };
  /** 중복 검사용 — 같은 번호의 다른 표기 */
  lookupVariants: string[];
};

/** 한국 휴대폰 국내 표기: 010·011·016·017·018·019 + 7~8자리 */
const KR_LOCAL_MOBILE_RE = /^01[016789]\d{7,8}$/;

/** 한국 번호 입력 → 국내 표기 `010…` (아니면 null). `+82 10-…` / `8210…` / `010…` / `10…` 허용. */
export function parseKoreaMobileLocal(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("82")) local = `0${local.slice(2).replace(/^0/, "")}`;
  else if (local.startsWith("1")) local = `0${local}`;
  return KR_LOCAL_MOBILE_RE.test(local) ? local : null;
}

/** 입력 중 표시용 숫자만 (최대 11자리 국내 표기) */
export function parseKoreaMobileTyping(raw: string): string {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("82")) digits = `0${digits.slice(2).replace(/^0/, "")}`;
  return digits.slice(0, 11);
}

/** `01012345678` → `010 1234 5678` (부분 입력 허용) */
export function formatKoreaMobileLocal(local: string): string {
  const d = String(local ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  const midLen = d.length === 10 ? 3 : 4;
  return `${d.slice(0, 3)} ${d.slice(3, 3 + midLen)} ${d.slice(3 + midLen)}`;
}

function resolveKorea(raw: string): ResolvedVerifyPhone | null {
  const local = parseKoreaMobileLocal(raw);
  if (!local) return null;
  const national = local.slice(1);
  const e164 = `+82${national}`;
  return {
    country: "KR",
    e164,
    provider: "solapi",
    storage: { phone: e164, phone_country_code: "+82", phone_number: national },
    lookupVariants: [e164],
  };
}

function resolvePhilippines(raw: string): ResolvedVerifyPhone | null {
  const e164 = normalizePhilippinesPhoneNumber(String(raw ?? "").trim());
  if (!isValidPhilippinesMobilePhone(e164)) return null;
  const db09 = normalizePhMobileDb(parsePhMobileInput(e164));
  if (!db09) return null;
  return {
    country: "PH",
    e164,
    provider: "semaphore_local",
    storage: { phone: db09, phone_country_code: "+63", phone_number: db09.slice(1) },
    lookupVariants: [e164, db09],
  };
}

/**
 * API 입력 번호 → 인증 대상. 국가는 번호 앞 국가번호로 정한다.
 * - `+82`/`82` 로 시작 → 한국
 * - 그 외(`+63`·`09`·`9…`) → 필리핀 (이전 앱 화면이 보내던 형식 그대로 호환)
 * 두 나라 형식이 아니면 null (다른 나라 번호는 인증 불가).
 */
export function resolveVerifyPhone(raw: string): ResolvedVerifyPhone | null {
  const trimmed = String(raw ?? "").replace(/[\s()-]/g, "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+82") || /^82\d{9,10}$/.test(trimmed)) return resolveKorea(trimmed);
  if (trimmed.startsWith("+") && !trimmed.startsWith("+63")) return null;
  return resolvePhilippines(trimmed);
}

/** 저장된 profiles 번호(또는 E.164)의 나라 — 표시·어드민 라벨용 */
export function detectStoredPhoneCountry(row: {
  phone?: string | null;
  phone_country_code?: string | null;
}): VerifyPhoneCountry | null {
  const phone = String(row.phone ?? "").trim();
  const cc = String(row.phone_country_code ?? "").trim();
  if (phone.startsWith("+82") || cc === "+82") return "KR";
  if (phone.startsWith("+63") || /^09\d{9}$/.test(phone) || cc === "+63") return "PH";
  return null;
}

export const VERIFY_PHONE_COUNTRY_FLAG: Record<VerifyPhoneCountry, string> = { PH: "🇵🇭", KR: "🇰🇷" };
