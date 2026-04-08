import type { AppLanguageCode } from "./config";
import { adminMessages } from "./catalog/admin";
import { commonMessages } from "./catalog/common";
import { myMessages } from "./catalog/my";
import { navigationMessages } from "./catalog/navigation";
import { notificationMessages } from "./catalog/notifications";

export const MESSAGES = {
  ko: {
    ...commonMessages.ko,
    ...myMessages.ko,
    ...navigationMessages.ko,
    ...notificationMessages.ko,
    ...adminMessages.ko,
  },
  en: {
    ...commonMessages.en,
    ...myMessages.en,
    ...navigationMessages.en,
    ...notificationMessages.en,
    ...adminMessages.en,
  },
  "zh-CN": {
    ...commonMessages["zh-CN"],
    ...myMessages["zh-CN"],
    ...navigationMessages["zh-CN"],
    ...notificationMessages["zh-CN"],
    ...adminMessages["zh-CN"],
  },
} as const;

export type MessageKey = keyof typeof MESSAGES["ko"];

const REVERSE_KO_MESSAGE_KEY = Object.fromEntries(
  Object.entries(MESSAGES.ko).map(([key, value]) => [value, key as MessageKey])
) as Record<string, MessageKey>;

export function translate(
  language: AppLanguageCode,
  key: MessageKey,
  vars?: Record<string, string | number>
): string {
  const template = String(MESSAGES[language][key] ?? MESSAGES.ko[key] ?? key);
  if (!vars) return template;
  return Object.entries(vars).reduce<string>(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    template
  );
}

export function translateText(
  language: AppLanguageCode,
  text: string,
  vars?: Record<string, string | number>
): string {
  const key = REVERSE_KO_MESSAGE_KEY[text];
  if (!key) return vars ? Object.entries(vars).reduce<string>(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    text
  ) : text;
  return translate(language, key, vars);
}
