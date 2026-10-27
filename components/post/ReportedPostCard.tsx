"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * P-2: 내가 신고한 글 — 목록 행은 그대로 두고(서버 정렬·페이지 계약 유지) 내용만 가린다.
 * 기존 「숨기기」(`HiddenPostCard`)와 같은 자리 바꿈 방식.
 */
export function ReportedPostCard() {
  const { t } = useI18n();
  return (
    <div
      data-reported-post-card="1"
      className="flex aspect-square w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface-muted p-3 text-center text-[13px] text-sam-muted"
    >
      {t("ui_post_reported_placeholder")}
    </div>
  );
}
