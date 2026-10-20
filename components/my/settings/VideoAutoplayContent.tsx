"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
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

  /** 즉시 저장 — 실패 시 스토어가 되돌리고(구독으로 표시 복귀) 토스트 (S15) */
  const select = (value: VideoAutoplayMode) => {
    setMode(value);
    void updateUserSettings(userId, { video_autoplay_mode: value });
  };

  return (
    <ul
      className="divide-y divide-sam-border-soft overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
      role="radiogroup"
    >
      {options.map((opt) => {
        const selected = mode === opt.value;
        return (
          <li key={opt.value}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              className="flex min-h-[52px] w-full items-center justify-between px-4 py-3 text-left text-[15px] font-semibold text-sam-fg transition-colors active:bg-sam-pressed-surface md:px-5"
              onClick={() => select(opt.value)}
            >
              <span>{t(opt.labelKey)}</span>
              {selected ? (
                <Check className="h-[18px] w-[18px] text-sam-primary" strokeWidth={2.5} aria-label={t("common_selected")} />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
