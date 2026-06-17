"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect } from "react";

type Props = {
  variant: "unsaved" | "blocked_by_me" | "request_incoming" | "request_outgoing";
  busy?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
};

/**
 * 1:1 room top notice — inbound unsaved peer (block only) or blocked peer.
 */
export function MessengerUnknownPeerNoticeBar({
  variant,
  busy = false,
  onAccept,
  onDecline,
  onBlock,
  onUnblock,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (variant === "unsaved") {
      messengerMonitorRecord({
        category: "api.community_messenger",
        metric: "unknown_user_chat_notice_rendered",
        unit: "count",
        value: 1,
        labels: { variant: "unsaved" },
      });
    }
  }, [variant]);

  if (variant === "blocked_by_me") {
    return (
      <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
        <p className="sam-text-helper text-[#1e3932]">{t("cm_social_blocked_notice")}</p>
        {onUnblock ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUnblock}
            className="mt-1.5 rounded-ui-rect border border-[#006241] bg-white px-3 py-1.5 sam-text-helper font-medium text-[#006241] disabled:opacity-50"
          >
            {t("cm_social_unblock")}
          </button>
        ) : null}
      </div>
    );
  }

  if (variant === "request_incoming") {
    return (
      <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
        <p className="sam-text-helper font-semibold text-[#1e3932]">{t("cm_social_new_message_request")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onAccept ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="rounded-ui-rect border border-[#006241] bg-white px-3 py-1.5 sam-text-helper font-medium text-[#006241] disabled:opacity-50"
            >
              {t("cm_social_accept_request")}
            </button>
          ) : null}
          {onDecline ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDecline}
              className="rounded-ui-rect border border-[#d6d6d6] bg-white px-3 py-1.5 sam-text-helper font-medium text-[#1f2937] disabled:opacity-50"
            >
              {t("cm_social_decline_request")}
            </button>
          ) : null}
          {onBlock ? (
            <button
              type="button"
              disabled={busy}
              onClick={onBlock}
              className="rounded-ui-rect bg-transparent px-3 py-1.5 sam-text-helper font-medium text-red-600 disabled:opacity-50"
            >
              {t("cm_social_block")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "request_outgoing") {
    return (
      <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
        <p className="sam-text-helper text-[#1e3932]">{t("cm_social_outgoing_request_notice")}</p>
      </div>
    );
  }

  return (
    <div className="flex justify-center border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
      {onBlock ? (
        <button
          type="button"
          disabled={busy}
          onClick={onBlock}
          className="rounded-ui-rect bg-transparent px-3 py-1.5 sam-text-helper font-medium text-red-600 disabled:opacity-50"
        >
          {t("cm_social_block")}
        </button>
      ) : null}
    </div>
  );
}
