"use client";

import { useMemo } from "react";
import { UserPlus } from "lucide-react";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
  samTier1HeaderIconCluster,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderSearchGlyph, Tier1HeaderSettingsGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { CommunityMessengerBellPinnedAlerts } from "@/components/community-messenger/CommunityMessengerBellPinnedAlerts";

/**
 * 메신저 홈 상단 우측: 친구 추가 / 검색 / 설정 / **종(통합 인박스 + 주요 알림, 맨 끝)**.
 * 친구요청 배지는 종 인박스 상단 주요 알림 섹션으로 통합한다.
 */
export function CommunityMessengerHeaderActions({
  messengerAlertSummary,
  onOpenFriendAdd,
  onOpenSearch,
  onOpenNotificationCenter,
  onOpenSettings,
}: {
  messengerAlertSummary: {
    groupInviteCount: number;
    missedCallCount: number;
    importantCount: number;
  };
  onOpenFriendAdd?: () => void;
  onOpenSearch: () => void;
  onOpenNotificationCenter: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const iconBtn = `${Sam.headerAction} relative h-10 w-10 shrink-0 text-sam-fg ${samTier1HeaderIconMicro}`;

  const supplementalUnreadCount = useMemo(
    () =>
      Math.max(
        0,
        messengerAlertSummary.groupInviteCount +
          messengerAlertSummary.missedCallCount +
          messengerAlertSummary.importantCount
      ),
    [messengerAlertSummary]
  );

  const pinnedSections = useMemo(
    () => (
      <CommunityMessengerBellPinnedAlerts
        summary={messengerAlertSummary}
        onOpenNotificationCenter={onOpenNotificationCenter}
      />
    ),
    [messengerAlertSummary, onOpenNotificationCenter]
  );

  return (
    <div className={samTier1HeaderIconCluster}>
      {onOpenFriendAdd ? (
        <button type="button" onClick={onOpenFriendAdd} className={iconBtn} aria-label={t("cm_ui_add_friend")}>
          <UserPlus
            className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
            strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
            aria-hidden
          />
        </button>
      ) : null}
      <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label={t("cm_ui_messenger_search")}>
        <Tier1HeaderSearchGlyph />
      </button>
      <button type="button" onClick={onOpenSettings} className={iconBtn} aria-label={t("nav_messenger_settings")}>
        <Tier1HeaderSettingsGlyph />
      </button>
      <Tier1NotificationAnchor
        surface="bottom_nav_chat"
        pinnedSections={pinnedSections}
        supplementalUnreadCount={supplementalUnreadCount}
      />
    </div>
  );
}
