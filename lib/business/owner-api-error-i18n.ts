import type { MessageKey } from "@/lib/i18n/messages";

const KNOWN_CODES: Record<string, MessageKey> = {
  network_error: "common_network_error",
  load_failed: "business_phase7_353",
  save_failed: "business_phase7_368",
  upload_failed: "business_phase7_440",
  reply_failed: "business_phase7_368",
  delete_failed: "business_phase7_352",
};

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** 사장님·비즈 API `error` 코드·폴백 문자열 → `t()` 메시지 */
export function resolveOwnerApiErrorMessage(codeOrMessage: string | null | undefined, t: TranslateFn): string {
  const raw = (codeOrMessage ?? "").trim();
  if (!raw) return t("common_error");
  const key = KNOWN_CODES[raw];
  if (key) return t(key);
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return t("business_phase7_426");
  return raw;
}
