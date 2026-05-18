"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useMemo } from "react";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { getBlockedUsers } from "@/lib/reports/mock-blocked-users";
import { BlockedUserCard } from "./BlockedUserCard";

interface BlockedUserListProps {
  refreshKey?: number;
  onUnblock?: () => void;
}

export function BlockedUserList({ refreshKey, onUnblock }: BlockedUserListProps) {
  const { t } = useI18n();
  const userId = getCurrentUserId();
  const list = useMemo(
    () => getBlockedUsers(userId),
    [userId, refreshKey]
  );

  if (list.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="sam-text-body text-sam-muted">{t("ui_report_blocked_empty")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {list.map((blocked) => (
        <li key={blocked.id}>
          <BlockedUserCard blocked={blocked} onUnblock={onUnblock ?? (() => {})} />
        </li>
      ))}
    </ul>
  );
}
