import { MESSAGES } from "@/lib/i18n/messages";

const KEY_LITERAL = /["'`]([a-z][a-z0-9_.]{2,})["'`]/g;

/**
 * 소스 문구 계약 테스트용 — 소스가 쓰는 카탈로그 키의 ko·en 값을 소스 뒤에 붙인다.
 * 언어 SSOT S6: 화면 문구가 코드에서 카탈로그로 옮겨져도 「이 화면이 이 문구를 보여 준다」를 그대로 확인하려고 둔다.
 */
export function withCatalogCopy(source: string): string {
  const ko = MESSAGES.ko as unknown as Record<string, string>;
  const en = MESSAGES.en as unknown as Record<string, string>;
  const seen = new Set<string>();
  const lines: string[] = [];
  KEY_LITERAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_LITERAL.exec(source))) {
    const k = m[1];
    if (seen.has(k) || ko[k] === undefined) continue;
    seen.add(k);
    lines.push(`/* i18n ${k}: ${ko[k]} | ${en[k]} */`);
  }
  return lines.length ? `${source}\n${lines.join("\n")}\n` : source;
}
