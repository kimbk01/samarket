"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { normalizeAppLanguage } from "@/lib/i18n/config";
import {
  getUserSettings,
  LANGUAGE_NAMES,
  COUNTRY_NAMES,
  subscribeUserSettings,
  syncUserSettings,
} from "@/lib/settings/user-settings-store";
import { SettingsSection } from "./SettingsSection";
import { SettingsRow } from "./SettingsRow";
import { SettingsValueRow } from "./SettingsValueRow";
import { SettingsDangerRow } from "./SettingsDangerRow";
import { SettingsAdminEntry } from "./SettingsAdminEntry";
import { SettingsIcons } from "./settings-icons";
import { useHasOwnerStores } from "@/hooks/useHasOwnerStores";

export function SettingsMainContent({ className }: { className?: string } = {}) {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));
  const showAdmin = isAdminUser(getCurrentUser());
  const hasOwnerStores = useHasOwnerStores();

  const refresh = useCallback(() => {
    setSettings(getUserSettings(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
    void syncUserSettings(userId).then(() => refresh());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) refresh();
    });
  }, [refresh, userId]);

  const languageLabel =
    LANGUAGE_NAMES[normalizeAppLanguage(settings.preferred_language)] ??
    settings.preferred_language ??
    "한국어";
  const countryLabel =
    COUNTRY_NAMES[settings.preferred_country ?? "PH"] ?? settings.preferred_country ?? "필리핀";

  return (
    <div className={`mx-auto max-w-[480px] bg-background pb-8${className ? ` ${className}` : ""}`}>
      <SettingsSection title={t("settings_section_service")}>
        <SettingsRow
          href="/mypage/settings/following"
          icon={SettingsIcons.users}
          label={t("settings_following_users")}
        />
        <SettingsRow
          href="/mypage/settings/blocked-users"
          icon={SettingsIcons.block}
          label={t("settings_blocked_users")}
        />
        <SettingsRow
          href="/mypage/settings/hidden-users"
          icon={SettingsIcons.eyeOff}
          label={t("settings_hidden_users")}
        />
        <SettingsRow
          href="/mypage/settings/autoplay"
          icon={SettingsIcons.play}
          label={t("settings_video_autoplay")}
        />
        <SettingsRow
          href="/mypage/settings/region-bulk"
          icon={SettingsIcons.target}
          label={t("settings_bulk_region_change")}
        />
        <SettingsRow
          href="/mypage/settings/chat"
          icon={SettingsIcons.chat}
          label={t("settings_chat")}
        />
        <SettingsRow
          href="/mypage/settings/preferences"
          icon={SettingsIcons.dots}
          label={t("settings_personalization")}
        />
      </SettingsSection>

      <SettingsSection title={t("settings_section_misc")}>
        <SettingsRow
          href="/mypage/settings/notice"
          icon={SettingsIcons.megaphone}
          label={t("settings_notices")}
        />
        <SettingsValueRow
          href="/mypage/settings/country"
          icon={SettingsIcons.globe}
          label={t("settings_country")}
          value={countryLabel}
        />
        <SettingsValueRow
          href="/mypage/settings/language"
          icon={SettingsIcons.language}
          label={t("settings_language")}
          value={languageLabel}
        />
        <SettingsRow
          href="/mypage/settings/cache"
          icon={SettingsIcons.trash}
          label={t("settings_cache_clear")}
        />
        <SettingsRow
          href="/mypage/settings/version"
          icon={SettingsIcons.info}
          label={t("settings_version")}
        />
        <SettingsDangerRow
          href="/mypage/settings/leave"
          icon={SettingsIcons.hand}
          label={t("settings_leave")}
        />
      </SettingsSection>

      <SettingsAdminEntry showAdmin={showAdmin} showStoreOwner={hasOwnerStores === true} />
    </div>
  );
}
