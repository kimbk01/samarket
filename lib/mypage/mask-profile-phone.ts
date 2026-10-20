/**
 * 내정보 전화번호 마스킹 (최종 설계 S03) — `formatProfilePhoneForDisplay` 결과(`+63 912 345 6789`)에 적용.
 * 국가코드(`+63`)는 그대로, 국내 번호는 **첫 자리 + 끝 4자리**만 보이고 나머지는 `*`.
 *   `+63 912 345 6789` → `+63 9** *** 6789`
 * 국가코드 없는 값도 같은 규칙(첫 자리 + 끝 4자리). 숫자 5자리 이하면 끝 4자리만 보인다. 빈 값 → "".
 */
export function maskProfilePhoneForDisplay(formatted: string | null | undefined): string {
  const raw = (formatted ?? "").trim();
  if (!raw) return "";
  const prefixMatch = raw.match(/^\+\d{1,3}\s+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const body = raw.slice(prefix.length);
  const totalDigits = body.replace(/\D/g, "").length;
  if (totalDigits === 0) return raw;
  const keepHead = totalDigits > 5 ? 1 : 0;
  const keepTailFrom = totalDigits - 4;
  let seen = 0;
  let out = "";
  for (const ch of body) {
    if (/\d/.test(ch)) {
      const idx = seen;
      seen += 1;
      out += idx < keepHead || idx >= keepTailFrom ? ch : "*";
    } else {
      out += ch;
    }
  }
  return `${prefix}${out}`;
}

export type AccountPhoneDisplay =
  /** 인증됨 + 번호 있음 → 마스킹 번호 + 인증 뱃지 */
  | { kind: "verified_with_number"; masked: string }
  /** 인증됨 + 번호 없음(관리자·소셜 인증) → "인증 완료"만 ("번호 없음" 동시 표시 금지) */
  | { kind: "verified_no_number" }
  /** 미인증 + 번호 있음 → 마스킹 번호 + 미인증 */
  | { kind: "unverified_with_number"; masked: string }
  /** 미인증 + 번호 없음 → "번호 없음" */
  | { kind: "missing" };

/** 인증 여부와 번호 표시를 같은 값에서 계산 (S03 — 두 상태가 서로 모순되게 보이지 않게) */
export function resolveAccountPhoneDisplay(input: {
  formattedPhone: string | null | undefined;
  verified: boolean;
}): AccountPhoneDisplay {
  const masked = maskProfilePhoneForDisplay(input.formattedPhone);
  if (input.verified) {
    return masked ? { kind: "verified_with_number", masked } : { kind: "verified_no_number" };
  }
  return masked ? { kind: "unverified_with_number", masked } : { kind: "missing" };
}
