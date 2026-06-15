"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { SectorHeaderBar } from "@/components/layout/sector-header/SectorHeaderBar";
import { SectorHeaderBackButton } from "@/components/layout/sector-header/SectorHeaderBackButton";
import { SectorHeaderTitle } from "@/components/layout/sector-header/SectorHeaderTitle";
import {
  SECTOR_HEADER_SHELL_CLASS,
  SECTOR_HEADER_SHELL_EMBEDDED_CLASS,
} from "@/lib/ui/sector-header-classes";

/** 고정 1단 헤더 — 표준 섹터 52px·상하 중앙, 저장은 하단 바 */
export function ProfileEditHeader({
  backHref,
  onBack,
}: {
  backHref: string;
  /** 뒤로가기 — dirty 가드·setup defer 등 (true 반환 시 기본 이동 차단) */
  onBack?: () => void;
}) {
  const { t } = useI18n();

  return (
    <BodyPortal>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[55] pt-[env(safe-area-inset-top,0px)]">
        <header
          data-profile-edit-header
          className={`pointer-events-auto ${SECTOR_HEADER_SHELL_CLASS} ${SECTOR_HEADER_SHELL_EMBEDDED_CLASS}`}
        >
          <SectorHeaderBar
            left={
              <SectorHeaderBackButton
                backHref={backHref}
                preferHistoryBack
                interceptBack={() => {
                  if (!onBack) return false;
                  onBack();
                  return true;
                }}
                ariaLabel={t("nav_back")}
              />
            }
            center={<SectorHeaderTitle>{t("profile_edit_title")}</SectorHeaderTitle>}
            right={<span className="block w-10 shrink-0" aria-hidden />}
          />
        </header>
      </div>
    </BodyPortal>
  );
}
