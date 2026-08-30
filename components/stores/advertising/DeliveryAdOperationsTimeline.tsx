"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { DeliveryAdOperationsTimelineMessage } from "@/lib/stores/advertising/delivery-ad-operations-message";
import type { MessageKey } from "@/lib/i18n/messages";

function formatOccurredAt(iso: string): string {
  const s = iso.trim();
  if (!s) return "";
  return s.slice(0, 19).replace("T", " ");
}

function senderLabelKey(
  message: DeliveryAdOperationsTimelineMessage,
  viewerRole: "owner" | "admin"
): MessageKey {
  if (message.kind === "system_lifecycle") return "delivery_ad_ops_ui_sender_system";
  if (message.senderRole === "admin") {
    return viewerRole === "admin"
      ? "delivery_ad_ops_ui_sender_you_admin"
      : "delivery_ad_ops_ui_sender_admin";
  }
  return viewerRole === "owner"
    ? "delivery_ad_ops_ui_sender_you_owner"
    : "delivery_ad_ops_ui_sender_owner";
}

export function DeliveryAdOperationsTimeline({
  messages,
  viewerRole,
}: {
  messages: DeliveryAdOperationsTimelineMessage[];
  viewerRole: "owner" | "admin";
}) {
  const { t, safeT } = useI18n();

  if (messages.length === 0) {
    return (
      <p className="text-[13px] text-sam-muted" role="status">
        {safeT("delivery_ad_ops_ui_empty", {
          fallbackKo: "운영 기록이 없습니다.",
          fallbackEn: "No operations history yet.",
        })}
      </p>
    );
  }

  return (
    <ol className="space-y-3" aria-label={t("delivery_ad_ops_ui_timeline_label")}>
      {messages.map((m) => {
        const isSystem = m.kind === "system_lifecycle";
        return (
          <li
            key={m.id}
            className={`rounded-ui-rect border px-3 py-2 text-[13px] ${
              isSystem
                ? "border-sam-border bg-sam-app text-sam-muted"
                : "border-sam-border bg-sam-surface text-sam-fg"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {t(senderLabelKey(m, viewerRole))}
              </span>
              <time className="shrink-0 text-[11px] text-sam-muted" dateTime={m.occurredAt}>
                {formatOccurredAt(m.occurredAt)}
              </time>
            </div>
            {isSystem ? (
              <p className="mt-1 whitespace-pre-wrap">
                {safeT(m.messageKey as MessageKey, {
                  fallbackKo: m.eventType,
                  fallbackEn: m.eventType,
                })}
              </p>
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
