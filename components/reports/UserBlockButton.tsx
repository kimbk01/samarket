"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { isBlocked, blockUser, unblockUser } from "@/lib/reports/mock-blocked-users";

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
  const currentUserId = getCurrentUserId();
  const blocked = isBlocked(currentUserId, userId);

  const handleClick = () => {
    if (currentUserId === userId) return;
    if (blocked) {
      unblockUser(currentUserId, userId);
    } else {
      if (confirm(t("ui_report_block_user_confirm", { nickname: nickname ?? t("ui_report_user_fallback", { id: "" }) }))) {
        blockUser(currentUserId, userId, nickname);
      }
    }
    onBlockChange();
  };

  if (currentUserId === userId) return null;

  const label = blocked ? t("ui_report_unblock") : t("ui_report_block");

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
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
      className="block w-full py-2.5 text-left sam-text-body text-sam-fg"
    >
      {label}
    </button>
  );
}
