"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useMemo, useState } from "react";
import { getViewerUserId } from "@/lib/auth/viewer-user-id";
import {
  getBlockedUsers,
  refreshBlockedUsersFromServer,
} from "@/lib/reports/user-blocks-client";
import { BlockedUserCard } from "./BlockedUserCard";

interface BlockedUserListProps {
  refreshKey?: number;
  onUnblock?: () => void;
}

export function BlockedUserList({ refreshKey, onUnblock }: BlockedUserListProps) {
  const { t } = useI18n();
  const userId = getViewerUserId();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    void refreshBlockedUsersFromServer(userId).finally(() => setLoaded(true));
  }, [userId, refreshKey]);

  const list = useMemo(() => getBlockedUsers(userId), [userId, refreshKey, loaded]);

  if (!loaded) {
    return <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

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
