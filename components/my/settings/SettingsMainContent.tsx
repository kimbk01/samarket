"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import { normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import {
  getUserSettings,
  LANGUAGE_NAMES,
  COUNTRY_NAMES,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import { SettingsSection } from "./SettingsSection";
import { SettingsRow } from "./SettingsRow";
import { SettingsValueRow } from "./SettingsValueRow";
import { SettingsDangerRow } from "./SettingsDangerRow";
import { SettingsAdminEntry } from "./SettingsAdminEntry";
import { SettingsIcons } from "./settings-icons";
import { useHasOwnerStores } from "@/hooks/useHasOwnerStores";

export function SettingsMainContent({ className }: { className?: string } = {}) {
  const { t, setLanguage } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));
  const showAdmin = isAdminUser(getCurrentUser());
  const hasOwnerStores = useHasOwnerStores();
  const [languageBusy, setLanguageBusy] = useState(false);
  const [languageError, setLanguageError] = useState("");

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
    normalizeAppLanguage(settings.preferred_language) === "ko"
      ? "Language"
      : "한국어";
  const countryLabel =
    COUNTRY_NAMES[settings.preferred_country ?? "PH"] ?? settings.preferred_country ?? "필리핀";
  const currentLanguage = normalizeAppLanguage(settings.preferred_language);

  const changeLanguage = useCallback(
    async (next: AppLanguageCode) => {
      if (languageBusy || currentLanguage === next) return;
      setLanguageBusy(true);
      setLanguageError((prev) => (prev === "" ? prev : ""));
      const previous = currentLanguage;
      setLanguage(next);
      updateUserSettings(userId, { preferred_language: next });
      const result = await updateMyProfile({ preferred_language: next });
      if (!result.ok) {
        setLanguage(previous);
        updateUserSettings(userId, { preferred_language: previous });
        setLanguageError(result.error);
      }
      setLanguageBusy(false);
    },
    [currentLanguage, languageBusy, setLanguage, userId]
  );

  return (
    <div className={`min-w-0 bg-background pb-8${className ? ` ${className}` : ""}`}>
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
        <div className="flex items-center gap-3 border-b border-sam-border-soft px-4 py-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center text-sam-muted">
            {SettingsIcons.language}
          </span>
          <span className="min-w-0 flex-1 sam-text-body text-sam-fg">{t("settings_language")}</span>
          <div className="inline-flex h-9 w-[170px] shrink-0 items-center rounded-full border border-[#1877F2]/25 bg-[#1877F2]/10 p-1">
            <button
              type="button"
              disabled={languageBusy}
              onClick={() => void changeLanguage("ko")}
              aria-pressed={currentLanguage === "ko"}
              className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                currentLanguage === "ko" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
              }`}
            >
              한국어
            </button>
            <button
              type="button"
              disabled={languageBusy}
              onClick={() => void changeLanguage("en")}
              aria-pressed={currentLanguage === "en"}
              className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                currentLanguage === "en" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
              }`}
            >
              Language
            </button>
          </div>
        </div>
        {languageError ? (
          <p className="px-4 pt-2 sam-text-body-secondary text-red-600">{languageError}</p>
        ) : null}
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
