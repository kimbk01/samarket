/**
 * 필리핀 로컬 휴대전화 — 저장 형식: `09` + 9자리 숫자(총 11자).
 * 표시·입력 형식: `09## ### ####` (공백은 표시용).
 */

/** DB·검증용: 반드시 09로 시작하는 11자리 숫자만 허용 */
export const PH_LOCAL_MOBILE_DB_RE = /^09\d{9}$/;

export const PH_LOCAL_MOBILE_LENGTH = 11;

/** 사용자 안내 (폼·API 공통) */
export const PH_LOCAL_MOBILE_RULE_MESSAGE_KO =
  "휴대전화는 09로 시작하는 11자리만 입력할 수 있습니다. 형식: 09## ### #### (+63으로 붙여넣기 가능).";

/**
 * 입력·붙여넣기 → 최대 11자리 숫자 문자열.
 * - 반드시 `09` 접두(부분 입력 시 `0` 또는 `09…`만 허용).
 * - `639…`(+63) 붙여넣기 시 로컬 `09…`로 변환.
 * - `9XXXXXXXXX`(선행 0 없음) 10자리 패턴은 앞에 `0`을 붙임.
 * - 그 외(08…, 1… 등)는 빈 문자열로 두어 추가 입력을 막음.
 */
export function parsePhMobileInput(raw: string): string {
  const s = raw.replace(/\D/g, "");
  if (!s) return "";

  if (s.startsWith("63")) {
    const rest = s.slice(2);
    if (!rest.startsWith("9")) return "";
    return ("0" + rest).slice(0, PH_LOCAL_MOBILE_LENGTH);
  }

  if (s.startsWith("09")) {
    return s.slice(0, PH_LOCAL_MOBILE_LENGTH);
  }

  if (s === "0") {
    return "0";
  }

  if (s.startsWith("0") && !s.startsWith("09")) {
    return "0";
  }

  if (s.startsWith("9")) {
    return ("0" + s).slice(0, PH_LOCAL_MOBILE_LENGTH);
  }

  return "";
}

/** digit string → "09 ## ### ####" */
export function formatPhMobileDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, PH_LOCAL_MOBILE_LENGTH);
  if (!d) return "";
  const a = d.slice(0, 2);
  const b = d.slice(2, 4);
  const c = d.slice(4, 7);
  const e = d.slice(7, 11);
  const parts: string[] = [a];
  if (b) parts.push(b);
  if (c) parts.push(c);
  if (e) parts.push(e);
  return parts.join(" ");
}

/** 완전하면 11자리, 빈 입력이면 null, 불완전·형식 오류면 null */
export function normalizePhMobileDb(digitsOrRaw: string): string | null {
  const d = parsePhMobileInput(digitsOrRaw);
  if (!d) return null;
  return PH_LOCAL_MOBILE_DB_RE.test(d) ? d : null;
}

export function isCompletePhMobile(digitsOrRaw: string): boolean {
  return PH_LOCAL_MOBILE_DB_RE.test(parsePhMobileInput(digitsOrRaw));
}

/**
 * 선택 입력: 비어 있으면 null.
 * 무언가 입력했으나 규칙에 맞지 않으면 `{ ok: false }`.
 */
export function normalizeOptionalPhMobileDb(
  raw: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  const d = parsePhMobileInput(raw);
  if (!d) {
    const hadDigits = /\d/.test(String(raw ?? ""));
    if (!hadDigits) return { ok: true, value: null };
    return { ok: false, error: PH_LOCAL_MOBILE_RULE_MESSAGE_KO };
  }
  const norm = normalizePhMobileDb(d);
  if (!norm) return { ok: false, error: PH_LOCAL_MOBILE_RULE_MESSAGE_KO };
  return { ok: true, value: norm };
}

/** DB `09…` → 다이얼러용 (+63) */
export function telHrefFromPhDb09(stored: string | null | undefined): string | null {
  const t = (stored ?? "").replace(/\D/g, "");
  if (!PH_LOCAL_MOBILE_DB_RE.test(t)) return null;
  return `tel:+63${t.slice(1)}`;
}

/** 임의 문자열(공백·+63 포함)에서 tel 링크 */
export function telHrefFromLoosePhPhone(raw: string | null | undefined): string | null {
  const d = parsePhMobileInput(raw ?? "");
  return d.length === PH_LOCAL_MOBILE_LENGTH ? telHrefFromPhDb09(d) : null;
}
