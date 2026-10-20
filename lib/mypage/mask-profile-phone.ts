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

/**
 * 인증 여부와 번호 표시 조합은 `resolveMemberPhoneState`(`lib/profile/member-account-status.ts`) 하나로 판정한다
 * (홈 필수정보·계정 S03·전화 인증 S05 공통 — real-screen-redesign §11-2).
 */
