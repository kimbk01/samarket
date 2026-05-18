"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import type { MessageKey } from "@/lib/i18n/messages";
import type { VideoAutoplayMode } from "@/lib/types/settings-db";

export function VideoAutoplayContent() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [mode, setMode] = useState<VideoAutoplayMode>("wifi_only");

  const options = useMemo(
    (): { value: VideoAutoplayMode; labelKey: MessageKey }[] => [
      { value: "always", labelKey: "settings_video_autoplay_always" },
      { value: "wifi_only", labelKey: "settings_video_autoplay_wifi_only" },
      { value: "never", labelKey: "settings_video_autoplay_never" },
    ],
    []
  );

  const refresh = useCallback(() => {
    const s = getUserSettings(userId);
    setMode((s.video_autoplay_mode as VideoAutoplayMode) ?? "wifi_only");
  }, [userId]);
  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  const select = (value: VideoAutoplayMode) => {
    updateUserSettings(userId, { video_autoplay_mode: value });
    setMode(value);
  };

  return (
    <ul className="divide-y divide-sam-border-soft">
      {options.map((opt) => (
        <li key={opt.value}>
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left sam-text-body text-sam-fg"
            onClick={() => select(opt.value)}
          >
            <span>{t(opt.labelKey)}</span>
            {mode === opt.value ? (
              <span className="sam-text-body-secondary font-medium text-signature">{t("common_selected")}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
