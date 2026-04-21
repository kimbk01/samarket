"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

export function PersonalizationContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(() => {
    const s = getUserSettings(userId);
    setEnabled(s.personalization_enabled !== false);
  }, [userId]);
  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  const toggle = () => {
    updateUserSettings(userId, { personalization_enabled: !enabled });
    setEnabled(!enabled);
  };

  return (
    <div className="flex items-center justify-between border-b border-sam-border-soft py-3">
      <span className="sam-text-body text-sam-fg">개인화 추천 사용</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-signature" : "bg-sam-border-soft"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
            enabled ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
