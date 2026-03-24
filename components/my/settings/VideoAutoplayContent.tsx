"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  updateUserSettings,
  VIDEO_AUTOPLAY_LABELS,
} from "@/lib/settings/user-settings-store";
import type { VideoAutoplayMode } from "@/lib/types/settings-db";

const OPTIONS: { value: VideoAutoplayMode; label: string }[] = [
  { value: "always", label: VIDEO_AUTOPLAY_LABELS.always },
  { value: "wifi_only", label: VIDEO_AUTOPLAY_LABELS.wifi_only },
  { value: "never", label: VIDEO_AUTOPLAY_LABELS.never },
];

export function VideoAutoplayContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [mode, setMode] = useState<VideoAutoplayMode>("wifi_only");

  const refresh = useCallback(() => {
    const s = getUserSettings(userId);
    setMode((s.video_autoplay_mode as VideoAutoplayMode) ?? "wifi_only");
  }, [userId]);
  useEffect(() => { refresh(); }, [refresh]);

  const select = (value: VideoAutoplayMode) => {
    updateUserSettings(userId, { video_autoplay_mode: value });
    setMode(value);
  };

  return (
    <ul className="divide-y divide-gray-100">
      {OPTIONS.map((opt) => (
        <li key={opt.value}>
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left text-[15px] text-gray-900"
            onClick={() => select(opt.value)}
          >
            <span>{opt.label}</span>
            {mode === opt.value && (
              <span className="text-[13px] font-medium text-signature">선택됨</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
