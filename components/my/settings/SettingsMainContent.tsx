"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, isAdminUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  LANGUAGE_NAMES,
  COUNTRY_NAMES,
} from "@/lib/settings/user-settings-store";
import { SettingsSection } from "./SettingsSection";
import { SettingsRow } from "./SettingsRow";
import { SettingsValueRow } from "./SettingsValueRow";
import { SettingsDangerRow } from "./SettingsDangerRow";
import { SettingsAdminEntry } from "./SettingsAdminEntry";
import { SettingsIcons } from "./settings-icons";
import { useHasOwnerStores } from "@/hooks/useHasOwnerStores";

export function SettingsMainContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [settings, setSettings] = useState(() => getUserSettings(userId));
  const showAdmin = isAdminUser(getCurrentUser());
  const hasOwnerStores = useHasOwnerStores();

  const refresh = useCallback(() => {
    setSettings(getUserSettings(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const languageLabel =
    LANGUAGE_NAMES[settings.preferred_language ?? "ko"] ?? settings.preferred_language ?? "한국어";
  const countryLabel =
    COUNTRY_NAMES[settings.preferred_country ?? "PH"] ?? settings.preferred_country ?? "필리핀";

  return (
    <div className="mx-auto max-w-[480px] bg-background pb-8">
      <SettingsSection title="서비스 설정">
        <SettingsRow
          href="/my/settings/favorite-users"
          icon={SettingsIcons.users}
          label="모아보는 사용자"
        />
        <SettingsRow
          href="/my/settings/blocked-users"
          icon={SettingsIcons.block}
          label="차단한 사용자"
        />
        <SettingsRow
          href="/my/settings/hidden-users"
          icon={SettingsIcons.eyeOff}
          label="숨긴 사용자"
        />
        <SettingsRow
          href="/my/settings/video-autoplay"
          icon={SettingsIcons.play}
          label="동영상 자동 재생"
        />
        <SettingsRow
          href="/my/settings/bulk-region-change"
          icon={SettingsIcons.target}
          label="판매 글 동네 일괄 변경"
        />
        <SettingsRow
          href="/my/settings/chat"
          icon={SettingsIcons.chat}
          label="채팅 설정"
        />
        <SettingsRow
          href="/my/settings/personalization"
          icon={SettingsIcons.dots}
          label="맞춤 설정"
        />
      </SettingsSection>

      <SettingsSection title="기타">
        <SettingsRow
          href="/my/settings/notices"
          icon={SettingsIcons.megaphone}
          label="공지사항"
        />
        <SettingsValueRow
          href="/my/settings/country"
          icon={SettingsIcons.globe}
          label="국가 변경"
          value={countryLabel}
        />
        <SettingsValueRow
          href="/my/settings/language"
          icon={SettingsIcons.language}
          label="언어 설정"
          value={languageLabel}
        />
        <SettingsRow
          href="/my/settings/cache"
          icon={SettingsIcons.trash}
          label="캐시 삭제"
        />
        <SettingsRow
          href="/my/settings/version"
          icon={SettingsIcons.info}
          label="버전 정보"
        />
        <SettingsDangerRow
          href="/my/settings/leave"
          icon={SettingsIcons.hand}
          label="탈퇴하기"
        />
      </SettingsSection>

      <SettingsAdminEntry showAdmin={showAdmin} showStoreOwner={hasOwnerStores === true} />
    </div>
  );
}
