import type { MessageKey } from "@/lib/i18n/messages";

export type LocalizedLabel = {
  labelKey: MessageKey;
  label: string;
};

export function resolveLocalizedLabel(
  item: LocalizedLabel,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  return t(item.labelKey);
}
