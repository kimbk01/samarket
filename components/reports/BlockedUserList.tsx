"use client";

import { useMemo } from "react";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { getBlockedUsers } from "@/lib/reports/mock-blocked-users";
import { BlockedUserCard } from "./BlockedUserCard";

interface BlockedUserListProps {
  refreshKey?: number;
  onUnblock?: () => void;
}

export function BlockedUserList({ refreshKey, onUnblock }: BlockedUserListProps) {
  const userId = getCurrentUserId();
  const list = useMemo(
    () => getBlockedUsers(userId),
    [userId, refreshKey]
  );

  if (list.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="sam-text-body text-sam-muted">차단한 사용자가 없어요</p>
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
