import type { AppLanguageCode } from "./config";
import { translate, type MessageKey } from "./messages";

/**
 * 언어 값이 `AppLanguageCode` 로 좁혀지지 않은 곳(서버 `locale`, 문자열 props 등)에서 카탈로그 키로 문구를 고른다.
 * S6(언어 SSOT): 코드 안 `lang === "en" ? "…" : "…"` 를 키로 옮길 때 **원래 동작을 그대로** 유지하려고 둔다.
 * - `lang` 이 "en" 이면 en, "ko" 이면 ko, 그 외(빈 값 등)는 `otherwise`(원래 삼항의 else 쪽 언어).
 * React 화면에서 `useI18n()` 의 `t` 를 바로 쓸 수 있으면 `t` 를 우선한다.
 */
export function translateBy(
  lang: string | null | undefined,
  key: MessageKey,
  /** 템플릿 문자열 `${x}` 와 같게 `String(x)` 로 넣는다(숫자는 그대로) */
  vars?: Record<string, unknown>,
  otherwise: AppLanguageCode = "ko"
): string {
  const resolved: AppLanguageCode = lang === "en" ? "en" : lang === "ko" ? "ko" : otherwise;
  const v = vars
    ? Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, typeof x === "number" ? x : String(x)]))
    : undefined;
  return translate(resolved, key, v);
}
