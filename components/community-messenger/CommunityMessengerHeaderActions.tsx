"use client";

import { useMemo } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  samTier1HeaderIconCluster,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderSearchGlyph, Tier1HeaderSettingsGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";
import { CommunityMessengerBellPinnedAlerts } from "@/components/community-messenger/CommunityMessengerBellPinnedAlerts";

/**
 * 메신저 홈 상단 우측: 검색 / 설정 / **종(통합 인박스 + 주요 알림, 맨 끝)**.
 * 그룹 생성은 섹션 탭 행 우측(`MessengerHomeSectionTabs`).
 * 친구요청 배지는 종 인박스 상단 주요 알림 섹션으로 통합한다.
 */
export function CommunityMessengerHeaderActions({
  messengerAlertSummary,
  onOpenSearch,
  onOpenNotificationCenter,
  onOpenSettings,
}: {
  messengerAlertSummary: {
    groupInviteCount: number;
    missedCallCount: number;
    importantCount: number;
  };
  onOpenSearch: () => void;
  onOpenNotificationCenter: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const iconBtn = `${Sam.headerAction} relative h-10 w-10 shrink-0 text-sam-fg ${samTier1HeaderIconMicro}`;

  // Header Bell digit = Domain projection only (no invite/missed/important re-add).
  // Pinned alert UI remains for navigation affordance only.

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
      <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label={t("cm_ui_messenger_search")}>
        <Tier1HeaderSearchGlyph />
      </button>
      <button type="button" onClick={onOpenSettings} className={iconBtn} aria-label={t("nav_messenger_settings")}>
        <Tier1HeaderSettingsGlyph />
      </button>
      <Tier1NotificationAnchor
        surface="tier1_inbox_bell"
        pinnedSections={pinnedSections}
      />
    </div>
  );
}
