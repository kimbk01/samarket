"use client";

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
  const currentUserId = getCurrentUserId();
  const blocked = isBlocked(currentUserId, userId);

  const handleClick = () => {
    if (currentUserId === userId) return;
    if (blocked) {
      unblockUser(currentUserId, userId);
    } else {
      if (confirm(`${nickname ?? "이 사용자"}를 차단할까요?`)) {
        blockUser(currentUserId, userId, nickname);
      }
    }
    onBlockChange();
  };

  if (currentUserId === userId) return null;

  const label = blocked ? "차단 해제" : "차단";

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`rounded-ui-rect px-3 py-1.5 text-[13px] font-medium ${
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
      className="block w-full py-2.5 text-left text-[14px] text-sam-fg"
    >
      {label}
    </button>
  );
}
