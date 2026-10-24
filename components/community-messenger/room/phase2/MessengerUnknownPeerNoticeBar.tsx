"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

/** 공통 기준 §1-4 — 브랜드 녹색 테두리 버튼 · 비활성은 회색 토큰(흐림 금지) */
const NOTICE_BTN = `${Sam.btn.outlinePrimaryCombo} ${Sam.btn.sm} ${Sam.btn.disabledToken} !min-h-[32px] !px-3`;

type Props = {
  variant: "stranger" | "blocked_by_me";
  busy?: boolean;
  onAddFriend?: () => void;
  onBlock?: () => void;
  onUnblock?: () => void;
};

/**
 * 1:1 room top notice — stranger warning or blocked peer.
 */
export function MessengerUnknownPeerNoticeBar({
  variant,
  busy = false,
  onAddFriend,
  onBlock,
  onUnblock,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (variant === "stranger") {
      messengerMonitorRecord({
        category: "api.community_messenger",
        metric: "unknown_user_chat_notice_rendered",
        unit: "count",
        value: 1,
        labels: { variant },
      });
    }
  }, [variant]);

  if (variant === "blocked_by_me") {
    return (
      <div className="border-b border-sam-border bg-sam-app px-3 py-2">
        <p className="sam-text-helper text-sam-fg">{t("cm_social_peer_blocked_notice")}</p>
        {onUnblock ? (
          <button
            type="button"
            disabled={busy}
            onClick={onUnblock}
            aria-busy={busy || undefined}
            className={`mt-1.5 ${NOTICE_BTN}`}
          >
            {t("cm_social_unblock")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-b border-sam-border bg-sam-app px-3 py-2">
      <div className="flex flex-wrap gap-2">
        {onAddFriend ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAddFriend}
            aria-busy={busy || undefined}
            className={NOTICE_BTN}
          >
            {t("cm_social_add_friend")}
          </button>
        ) : null}
        {onBlock ? (
          <button
            type="button"
            disabled={busy}
            onClick={onBlock}
            className={`${Sam.btn.ghostCombo} ${Sam.btn.sm} ${Sam.btn.disabledToken} !min-h-[32px] !px-3 !text-[color:var(--sam-danger)]`}
          >
            {t("cm_social_block")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
