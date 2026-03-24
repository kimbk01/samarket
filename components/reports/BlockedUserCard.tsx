"use client";

import type { BlockedUser } from "@/lib/types/report";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { unblockUser } from "@/lib/reports/mock-blocked-users";

interface BlockedUserCardProps {
  blocked: BlockedUser;
  onUnblock: () => void;
}

export function BlockedUserCard({ blocked, onUnblock }: BlockedUserCardProps) {
  const userId = getCurrentUserId();

  const handleUnblock = () => {
    if (confirm("차단을 해제할까요?")) {
      unblockUser(userId, blocked.blockedUserId);
      onUnblock();
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-white p-4">
      <div>
        <p className="text-[15px] font-medium text-gray-900">
          {blocked.blockedUserNickname ?? `사용자 ${blocked.blockedUserId}`}
        </p>
        <p className="text-[12px] text-gray-500">차단된 사용자</p>
      </div>
      <button
        type="button"
        onClick={handleUnblock}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
      >
        차단 해제
      </button>
    </div>
  );
}
