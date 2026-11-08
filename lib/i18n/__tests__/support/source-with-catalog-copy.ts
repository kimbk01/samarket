import { MESSAGES } from "@/lib/i18n/messages";

/**
 * S6 에서 소스 글자를 대신하게 된 형태만 — `translateBy(lang, "키")` · `catalogPair("키")` ·
 * 대체 문구가 지워진 `safeT("키")` / `safeTranslate(lang, "키")`. `t("키")` 는 S6 전에도 소스에 글자가 없었으므로 풀지 않는다.
 */
const S6_KEY_FORMS = [
  /\btranslateBy\(\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*["']([a-z][a-z0-9_.]*)["']/g,
  /\bcatalogPair\(\s*["']([a-z][a-z0-9_.]*)["']/g,
  /\bsafeT\(\s*["']([a-z][a-z0-9_.]*)["']/g,
  /\bsafeTranslate\(\s*[^,()]+,\s*["']([a-z][a-z0-9_.]*)["']/g,
];

/**
 * 소스 문구 계약 테스트용 — S6(언어 SSOT)에서 카탈로그로 옮긴 문구를 소스 뒤에 붙인다.
 * 「이 화면이 이 문구를 보여 준다 / 보여 주지 않는다」를 S6 전과 **같은 범위**로 확인하려고 둔다.
 */
export function withCatalogCopy(source: string): string {
  const ko = MESSAGES.ko as unknown as Record<string, string>;
  const en = MESSAGES.en as unknown as Record<string, string>;
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const re of S6_KEY_FORMS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const k = m[1];
      if (seen.has(k) || ko[k] === undefined) continue;
      seen.add(k);
      lines.push(`/* i18n ${k}: ${ko[k]} | ${en[k]} */`);
    }
  }
  return lines.length ? `${source}\n${lines.join("\n")}\n` : source;
}
