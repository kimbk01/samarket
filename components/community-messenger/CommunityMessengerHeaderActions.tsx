"use client";

import { UserPlus } from "lucide-react";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
  samTier1HeaderIconBadge,
  samTier1HeaderIconCluster,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import { Tier1HeaderSearchGlyph, Tier1HeaderSettingsGlyph } from "@/lib/ui/tier1-header-glyphs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Tier1NotificationAnchor } from "@/components/notifications/Tier1NotificationAnchor";

/**
 * 메신저 홈 상단 우측: 검색 / 친구요청 / 설정 / **종(통합 인박스, 맨 끝)**.
 * 통화목록은 2단 탭에서 진입한다.
 */
export function CommunityMessengerHeaderActions({
  incomingRequestCount,
  onOpenSearch,
  onOpenRequestList,
  onOpenSettings,
}: {
  incomingRequestCount: number;
  onOpenSearch: () => void;
  onOpenRequestList: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useI18n();
  const iconBtn = `${Sam.headerAction} relative h-10 w-10 shrink-0 text-sam-fg ${samTier1HeaderIconMicro}`;

  return (
    <div className={samTier1HeaderIconCluster}>
      <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label={t("cm_ui_messenger_search")}>
        <Tier1HeaderSearchGlyph />
      </button>
      <button
        type="button"
        onClick={onOpenRequestList}
        className={iconBtn}
        aria-label={
          incomingRequestCount > 0
            ? t("cm_ui_notifications_pending_friend_requests", { count: incomingRequestCount })
            : t("cm_ui_requests_box")
        }
      >
        <UserPlus
          className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
          strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
          aria-hidden
        />
        {incomingRequestCount > 0 ? (
          <span className={samTier1HeaderIconBadge}>
            {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
          </span>
        ) : null}
      </button>
      <button type="button" onClick={onOpenSettings} className={iconBtn} aria-label={t("nav_messenger_settings")}>
        <Tier1HeaderSettingsGlyph />
      </button>
      <Tier1NotificationAnchor surface="bottom_nav_chat" />
    </div>
  );
}
