"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { BlockedUser } from "@/lib/types/report";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { unblockUser } from "@/lib/reports/mock-blocked-users";

interface BlockedUserCardProps {
  blocked: BlockedUser;
  onUnblock: () => void;
}

export function BlockedUserCard({ blocked, onUnblock }: BlockedUserCardProps) {
  const { t } = useI18n();
  const userId = getCurrentUserId();

  const handleUnblock = () => {
    if (confirm(t("ui_report_unblock_confirm"))) {
      unblockUser(userId, blocked.blockedUserId);
      onUnblock();
    }
  };

  return (
    <div className="flex items-center justify-between rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
      <div>
        <p className="sam-text-body font-medium text-sam-fg">
          {blocked.blockedUserNickname ?? t("ui_report_user_fallback", { id: blocked.blockedUserId })}
        </p>
        <p className="sam-text-helper text-sam-muted">{t("ui_report_blocked_user_label")}</p>
      </div>
      <button
        type="button"
        onClick={handleUnblock}
        className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
      >
        {t("ui_report_unblock")}
      </button>
    </div>
  );
}
