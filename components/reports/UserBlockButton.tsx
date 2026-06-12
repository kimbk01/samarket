"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useCallback, useEffect, useState } from "react";
import { getViewerUserId } from "@/lib/auth/viewer-user-id";
import {
  isBlocked,
  blockUser,
  unblockUser,
  refreshBlockedUsersFromServer,
} from "@/lib/reports/user-blocks-client";

interface UserBlockButtonProps {
  userId: string;
  nickname?: string;
  onBlockChange: () => void;
  variant?: "text" | "button";
}

export function UserBlockButton({
  userId,
  nickname,
  onBlockChange,
  variant = "text",
}: UserBlockButtonProps) {
  const { t } = useI18n();
  const currentUserId = getViewerUserId();
  const [blocked, setBlocked] = useState(() => isBlocked(currentUserId, userId));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUserId) {
      setBlocked(false);
      return;
    }
    void refreshBlockedUsersFromServer(currentUserId).then(() => {
      setBlocked(isBlocked(currentUserId, userId));
    });
  }, [currentUserId, userId]);

  const handleClick = useCallback(() => {
    if (!currentUserId || currentUserId === userId || busy) return;
    void (async () => {
      setBusy(true);
      try {
        if (blocked) {
          await unblockUser(currentUserId, userId);
          setBlocked(false);
        } else {
          if (
            !confirm(
              t("ui_report_block_user_confirm", {
                nickname: nickname ?? t("ui_report_user_fallback", { id: "" }),
              })
            )
          ) {
            return;
          }
          await blockUser(currentUserId, userId, nickname);
          setBlocked(true);
        }
        onBlockChange();
      } finally {
        setBusy(false);
      }
    })();
  }, [blocked, busy, currentUserId, nickname, onBlockChange, t, userId]);

  if (!currentUserId || currentUserId === userId) return null;

  const label = blocked ? t("ui_report_unblock") : t("ui_report_block");

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={`rounded-ui-rect px-3 py-1.5 sam-text-body-secondary font-medium ${
          blocked ? "bg-sam-surface-muted text-sam-muted" : "bg-red-50 text-red-600"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="block w-full py-2.5 text-left sam-text-body text-sam-fg"
    >
      {label}
    </button>
  );
}
