"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect } from "react";

type Props = {
  variant: "stranger" | "blocked_by_me" | "pending_incoming";
  busy?: boolean;
  onAddFriend?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
};

/**
 * 1:1 room top notice — Kakao-style stranger warning or blocked peer.
 */
export function MessengerUnknownPeerNoticeBar({
  variant,
  busy = false,
  onAddFriend,
  onBlock,
  onUnblock,
  onAccept,
  onReject,
}: Props) {
  const { t, safeT } = useI18n();

  useEffect(() => {
    if (variant === "stranger" || variant === "pending_incoming") {
      messengerMonitorRecord({
        category: "api.community_messenger",
        metric: "unknown_user_chat_notice_rendered",
        unit: "count",
        value: 1,
        labels: { variant },
      });
    }
  }, [variant]);

  if (variant === "pending_incoming") {
    return (
      <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
        <p className="sam-text-helper text-[#1e3932]">{t("cm_ui_this_user_sent_friend_request")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {onAccept ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAccept}
              className="rounded-ui-rect border border-[#006241] bg-[#006241] px-3 py-1.5 sam-text-helper font-medium text-white disabled:opacity-50"
            >
              {t("cm_ui_accept")}
            </button>
          ) : null}
          {onReject ? (
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="rounded-ui-rect border border-[#e8e8e8] bg-white px-3 py-1.5 sam-text-helper font-medium text-[#1e3932] disabled:opacity-50"
            >
              {t("cm_ui_reject")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === "blocked_by_me") {
    return (
      <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
        <p className="sam-text-helper text-[#1e3932]">{t("cm_social_peer_blocked_notice")}</p>
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
    <div className="border-b border-[#e8e8e8] bg-[#f6f6f6] px-3 py-2">
      <p className="sam-text-helper text-[#1e3932]">{t("cm_social_stranger_notice")}</p>
      <p className="mt-0.5 sam-text-xxs text-ui-muted">
        {safeT("cm_social_stranger_call_hint", {
          fallbackKo: "친구가 아니어도 통화할 수 있지만, 원치 않으면 차단할 수 있습니다.",
          fallbackEn: "You can call even if you are not friends. Block if you do not want contact.",
        })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {onAddFriend ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAddFriend}
            className="rounded-ui-rect border border-[#006241] bg-white px-3 py-1.5 sam-text-helper font-medium text-[#006241] disabled:opacity-50"
          >
            {t("cm_social_add_friend")}
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
