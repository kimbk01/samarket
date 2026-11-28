"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SettingsMemberGate } from "./SettingsMemberGate";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { MyToggle } from "@/components/mypage/ds/MyToggle";

export function PersonalizationContent() {
  return <SettingsMemberGate source="settings-personalization">{(userId) => <PersonalizationContentBody userId={userId} />}</SettingsMemberGate>;
}

/** 회원 id 가 정해진 뒤에만 그린다 — 문은 `SettingsMemberGate` */
function PersonalizationContentBody({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(true);

  const refresh = useCallback(() => {
    const s = getUserSettings(userId);
    const nextEnabled = s.personalization_enabled !== false;
    setEnabled((prev) => (prev === nextEnabled ? prev : nextEnabled));
  }, [userId]);
  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-3 md:px-5">
      <span className="text-[15px] font-semibold text-sam-fg">{t("settings_personalization_recommend")}</span>
      <MyToggle
        checked={enabled}
        ariaLabel={t("settings_personalization_recommend")}
        onChange={(next) =>
          updateUserSettings(userId, { personalization_enabled: next })
        }
      />
    </div>
  );
}
