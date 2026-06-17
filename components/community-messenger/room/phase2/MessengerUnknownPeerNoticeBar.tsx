"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect } from "react";

type Props = {
  variant: "unsaved" | "blocked_by_me";
  busy?: boolean;
  onBlock?: () => void;
  onUnblock?: () => void;
};

/**
 * 1:1 room top notice — inbound unsaved peer (block only) or blocked peer.
 */
export function MessengerUnknownPeerNoticeBar({
  variant,
  busy = false,
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
