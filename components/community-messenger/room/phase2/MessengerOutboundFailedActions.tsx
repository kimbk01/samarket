"use client";

import { memo } from "react";
import { AlertCircle } from "lucide-react";
import type { MessageKey } from "@/lib/i18n/messages";
import { getMessengerOutboundFailedSend } from "@/lib/community-messenger/room/messenger-outbound-failed-send";

/**
 * C-3 / C-10 — 내 발신 실패 말풍선 아래 "전송 실패 · 재전송 · 삭제".
 * 핸들러는 `messenger-outbound-failed-send` 레지스트리에서 행 id 로 찾는다(이미지·파일·음성 공용).
 */
export const MessengerOutboundFailedActions = memo(function MessengerOutboundFailedActions({
  messageId,
  t,
}: {
  messageId: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const run = (kind: "retry" | "discard") => {
    const handlers = getMessengerOutboundFailedSend(messageId);
    if (!handlers) return;
    if (kind === "retry") handlers.retry();
    else handlers.discard();
  };
  return (
    <div
      data-cm-outbound-failed=""
      className="mt-1 flex items-center justify-end gap-2 pr-0.5 text-[12px] leading-none"
      role="group"
      aria-label={t("cm_ui_send_failed_label")}
    >
      <span className="inline-flex items-center gap-1 text-sam-danger">
        <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("cm_ui_send_failed_label")}
      </span>
      <button
        type="button"
        className="rounded-full border border-sam-border bg-sam-surface px-2.5 py-1 font-semibold text-sam-fg"
        onClick={(e) => {
          e.stopPropagation();
          run("retry");
        }}
      >
        {t("cm_ui_send_failed_retry")}
      </button>
      <button
        type="button"
        className="rounded-full border border-sam-border bg-sam-surface px-2.5 py-1 text-sam-muted"
        onClick={(e) => {
          e.stopPropagation();
          run("discard");
        }}
      >
        {t("cm_ui_send_failed_discard")}
      </button>
    </div>
  );
});
