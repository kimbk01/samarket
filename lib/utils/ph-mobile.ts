/**
 * Philippines mobile: UI "09 xx xxx xxxx", DB 저장 `09` + 9 digits (11 chars).
 */

const DB_RE = /^09\d{9}$/;

/** 입력·붙여넣기 → 최대 11자리, 항상 `09` 접두(비어 있으면 "") */
export function parsePhMobileInput(raw: string): string {
  const s = raw.replace(/\D/g, "");
  if (!s) return "";

  let d = s;
  if (d.startsWith("63")) {
    const r = d.slice(2, 12);
    d = r.startsWith("9") ? `0${r}` : `09${r.replace(/^9?/, "").slice(0, 9)}`;
  } else if (d.startsWith("09")) {
    d = d.slice(0, 11);
  } else if (d.startsWith("9")) {
    d = `0${d}`.slice(0, 11);
  } else if (d.startsWith("0")) {
    d = `09${d.slice(1)}`.slice(0, 11);
  } else {
    d = `09${d}`.slice(0, 11);
  }

  if (!d.startsWith("09")) d = "09";
  return d.slice(0, 11);
}

/** DB/표시용 digit string → "09 xx xxx xxxx" */
export function formatPhMobileDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 11);
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

/** 저장값: 완전하면 11자리, 빈 입력이면 null, 불완전·형식 오류면 null */
export function normalizePhMobileDb(digitsOrRaw: string): string | null {
  const d = parsePhMobileInput(digitsOrRaw);
  if (!d) return null;
  return DB_RE.test(d) ? d : null;
}

export function isCompletePhMobile(digitsOrRaw: string): boolean {
  return DB_RE.test(parsePhMobileInput(digitsOrRaw));
}

/** DB `09…` → 다이얼러용 (필리핀 국번 +63) */
export function telHrefFromPhDb09(stored: string | null | undefined): string | null {
  const t = (stored ?? "").replace(/\D/g, "");
  if (!DB_RE.test(t)) return null;
  return `tel:+63${t.slice(1)}`;
}

/** 임의 문자열(공백·+63 포함)에서 tel 링크 */
export function telHrefFromLoosePhPhone(raw: string | null | undefined): string | null {
  const d = parsePhMobileInput(raw ?? "");
  return d.length === 11 ? telHrefFromPhDb09(d) : null;
}
