import { translate, type MessageKey } from "./messages";

/** ko·en 문구 쌍 — `{ ko, en }` 표를 쓰는 기존 코드 모양을 유지하면서 문구 원본은 카탈로그 키 하나로 둔다 (S6). */
export type CatalogPair = { readonly ko: string; readonly en: string };

/**
 * 언어 SSOT S6: 코드 안 인라인 `{ ko: "…", en: "…" }` 를 카탈로그로 옮길 때 쓴다(값은 카탈로그 그대로).
 * 새 화면은 `t("key")`·`translateBy` 를 우선한다.
 */
export function catalogPair(key: MessageKey): CatalogPair {
  return { ko: translate("ko", key), en: translate("en", key) };
}
