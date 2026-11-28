"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useClientMemberId } from "@/hooks/use-client-membership-state";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { MyToggle } from "@/components/mypage/ds/MyToggle";

export function PersonalizationContent() {
  const { t } = useI18n();
  /** 지금 보는 회원 id = 회원 상태 SSOT — 모르면 설정을 읽거나 쓰지 않는다(예전 "me" 대체 키는 기기 캐시를 실제 회원 키와 갈라 놓았다 — 관심이웃 전체 수정 설계 v2 §6) */
  const userId = useClientMemberId("settings-personalization") ?? "";
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(() => {
    const s = getUserSettings(userId);
    const nextEnabled = s.personalization_enabled !== false;
    setEnabled((prev) => (prev === nextEnabled ? prev : nextEnabled));
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  if (!userId) return null;

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 md:px-5">
      <span className="text-[15px] font-semibold text-sam-fg">{t("settings_personalization_recommend")}</span>
      <MyToggle
        checked={enabled}
        ariaLabel={t("settings_personalization_recommend")}
        onChange={(next) =>
          userId ? updateUserSettings(userId, { personalization_enabled: next }) : Promise.resolve(false)
        }
      />
    </div>
  );
}
