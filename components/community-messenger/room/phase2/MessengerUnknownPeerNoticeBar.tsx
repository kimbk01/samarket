"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { useEffect } from "react";

/**
 * 공통 기준 §1-4 — 브랜드 녹색 테두리 버튼 · 눌림 · 비활성은 회색 토큰(흐림 금지).
 * 밝은 화면 고정 토큰(--dibay-* / --sm-color-*)만 쓴다 — 기존과 같이 OS 다크 설정에서도 밝게 유지.
 */
const NOTICE_BTN =
  "inline-flex min-h-[32px] items-center justify-center rounded-ui-rect border border-[color:var(--dibay-green)] bg-[color:var(--dibay-card)] px-3 sam-text-helper font-medium text-[color:var(--dibay-green)] transition-transform active:scale-[0.98] active:bg-[color:var(--sm-color-primary-soft)] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[color:var(--sm-color-primary-disabled)] disabled:text-[color:var(--sm-color-text-muted)]";
const NOTICE_SURFACE = "border-b border-[color:var(--sm-color-border)] bg-[color:var(--sm-color-bg-page)] px-3 py-2";

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
      <div className={NOTICE_SURFACE}>
        <p className="sam-text-helper text-[color:var(--sm-color-text-main)]">{t("cm_social_peer_blocked_notice")}</p>
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
    <div className={NOTICE_SURFACE}>
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
            className="inline-flex min-h-[32px] items-center justify-center rounded-ui-rect bg-transparent px-3 sam-text-helper font-medium text-[color:var(--sm-color-danger)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:text-[color:var(--sm-color-text-muted)]"
          >
            {t("cm_social_block")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
