import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

export type GroupReadReceiptPresentation = {
  messageId: string;
  readCount: number;
  label: string;
  readerLabels: string[];
};

const MAX_NAME_PREVIEW = 3;

type GroupReadTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * 비공개 그룹 읽음 문구 — 카탈로그 키로만(P1, 예전 하드코딩 한국어 제거).
 * 말풍선 옆 표시는 없어졌고(상태 아이콘으로 대체) 길게 누름 메뉴 「읽음 N명」 항목에서 쓴다.
 */
export function formatGroupReadReceiptLabel(
  input: { readCount: number; readerLabels: string[] },
  t: GroupReadTranslate
): string {
  const readCount = Math.max(0, input.readCount);
  const names = input.readerLabels.filter(Boolean).slice(0, MAX_NAME_PREVIEW);
  if (readCount <= 0) return "";
  if (names.length === 0) return t("cm_ui_group_read_count", { count: readCount });
  if (readCount <= names.length) return t("cm_ui_group_read_names", { names: names.join(" ") });
  return t("cm_ui_group_read_names_more", { names: names.join(" "), more: readCount - names.length });
}

export function presentGroupReadReceipt(input: {
  messageId: string;
  readCount: number;
  readerLabels: string[];
  /** 응답 문구 언어 — 없으면 ko */
  language?: AppLanguageCode;
}): GroupReadReceiptPresentation {
  const readCount = Math.max(0, input.readCount);
  const names = input.readerLabels.filter(Boolean).slice(0, MAX_NAME_PREVIEW);
  const language = input.language ?? "ko";
  const label = formatGroupReadReceiptLabel({ readCount, readerLabels: names }, (key, vars) =>
    translate(language, key, vars)
  );
  return {
    messageId: input.messageId,
    readCount,
    label,
    readerLabels: names,
  };
}

export function shouldShowGroupReadReceipt(readCount: number, isMine: boolean): boolean {
  return isMine && readCount > 0;
}
