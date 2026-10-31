"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  /** `push_only` — 알림함에 보관되지 않는 푸시(C2 예외)로 들어온 경우 */
  reason?: "origin_unavailable" | "push_only";
  /** Optional dismiss (list banner). Detail page renders it without dismiss. */
  onDismiss?: () => void;
  className?: string;
};

/**
 * INAPP-04 — standard notice when a notification's origin content was deleted or can't be shown
 * (`?fallback=origin_unavailable`, destination resolve failure, missing / not-owned detail id).
 */
export function NotificationContentUnavailableNotice({ reason = "origin_unavailable", onDismiss, className = "" }: Props) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      data-notification-origin-unavailable
      className={`flex items-start gap-2 rounded-ui-rect border border-sam-border bg-sam-surface-muted px-3 py-2.5 text-[13px] leading-snug text-sam-fg ${className}`.trim()}
    >
      <span className="min-w-0 flex-1">
        {t(reason === "push_only" ? "notif_push_only_notice" : "notif_content_unavailable_notice")}
      </span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[12px] font-medium text-sam-muted hover:text-sam-fg"
        >
          {t("common_close")}
        </button>
      ) : null}
    </div>
  );
}
