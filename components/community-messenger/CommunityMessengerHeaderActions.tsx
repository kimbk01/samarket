"use client";

import { Sam } from "@/lib/ui/sam-component-classes";
import {
  samTier1HeaderIconCluster,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderSearchGlyph, Tier1HeaderSettingsGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";

/**
 * 메신저 홈 상단 우측: 검색 / 설정 / **종(통합 인박스 요약 시트 1장, 맨 끝)**.
 * 그룹 생성은 섹션 탭 행 우측(`MessengerHomeSectionTabs`).
 * 종 모달 안 이중 「알림 센터」 카드는 두지 않는다 — 탭·전체보기로만 진입.
 */
export function CommunityMessengerHeaderActions({
  onOpenSearch,
  onOpenSettings,
}: {
  messengerAlertSummary?: {
    groupInviteCount: number;
    missedCallCount: number;
    importantCount: number;
  };
  onOpenSearch: () => void;
  /** @deprecated 종 모달 단일화 — 호출부 호환용, 미사용 */
  onOpenNotificationCenter?: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const iconBtn = `${Sam.headerAction} relative h-10 w-10 shrink-0 text-sam-fg ${samTier1HeaderIconMicro}`;

  // Header Bell digit = Domain projection only (no invite/missed/important re-add).

  return (
    <div className={samTier1HeaderIconCluster}>
      <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label={t("cm_ui_messenger_search")}>
        <Tier1HeaderSearchGlyph />
      </button>
      <button type="button" onClick={onOpenSettings} className={iconBtn} aria-label={t("nav_messenger_settings")}>
        <Tier1HeaderSettingsGlyph />
      </button>
      <Tier1NotificationAnchor surface="tier1_inbox_bell" />
    </div>
  );
}
