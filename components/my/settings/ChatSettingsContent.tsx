"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

export function ChatSettingsContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));

  const refresh = useCallback(() => setSettings(getUserSettings(userId)), [userId]);
  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  const toggle = (key: "chat_push_enabled" | "chat_preview_enabled") => {
    const v = settings[key];
    updateUserSettings(userId, { [key]: !(v ?? true) });
    refresh();
  };

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between border-b border-sam-border-soft py-3">
        <span className="text-[15px] text-sam-fg">채팅 알림</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.chat_push_enabled !== false}
          onClick={() => toggle("chat_push_enabled")}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            settings.chat_push_enabled !== false ? "bg-signature" : "bg-sam-border-soft"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
              settings.chat_push_enabled !== false ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-sam-border-soft py-3">
        <span className="text-[15px] text-sam-fg">미리보기 표시</span>
        <button
          type="button"
          role="switch"
          aria-checked={settings.chat_preview_enabled !== false}
          onClick={() => toggle("chat_preview_enabled")}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            settings.chat_preview_enabled !== false ? "bg-signature" : "bg-sam-border-soft"
          }`}
        >
          <span
            className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
              settings.chat_preview_enabled !== false ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
