"use client";

import { Check, Globe2, MapPin, Search } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibayMenuList, DibaySheetHeader } from "@/components/ui/dibay-overlay/DibaySheetParts";
import { usePhilifeAddressManageMenuItem } from "@/components/philife/PhilifeAddressManageMenuItem";

/**
 * 정보교환 「보는 동네」 시트 — 1단 제목 뒤 「· 동네 ⌄」를 누르면 열린다
 * (Owner 「3판대로 구현」 2026-11-12, 설계 §2-2). 새 기능 없이 지금 있던 일을 한 곳에 모은다:
 * 전체 지역 글 / ○○ 글만(= 예전 2단 「동네」 탭) / 다른 동네 고르기(= 예전 「지역 변경」 시트) / 내 주소 관리(= 예전 1단 지도 버튼).
 */
export function CommunityAreaSheet({
  open,
  onClose,
  localOn,
  areaLabel,
  onPickAll,
  onPickLocal,
  onPickOther,
}: {
  open: boolean;
  onClose: () => void;
  localOn: boolean;
  /** 보는 동네 이름 — 없으면(비회원·대표 주소 없음) 「동네 글만」 */
  areaLabel: string;
  onPickAll: () => void;
  onPickLocal: () => void;
  onPickOther: () => void;
}) {
  const { t } = useI18n();
  const manage = usePhilifeAddressManageMenuItem({ onBeforeNavigate: onClose });
  if (!open) return null;
  const current = t("community_area_sheet_current");
  return (
    <DibayBottomSheet open={open} onClose={onClose} ariaLabel={t("community_area_sheet_title")}>
      <div data-community-area-sheet="">
        <DibaySheetHeader title={t("community_area_sheet_title")} onClose={onClose} closeLabel={t("nav_close")} />
        <DibayMenuList
          groups={[
            [
              {
                key: "all",
                icon: localOn ? <Globe2 className="h-5 w-5" /> : <Check className="h-5 w-5 text-sam-primary" />,
                label: t("community_area_sheet_all"),
                hint: localOn ? undefined : current,
                onClick: onPickAll,
              },
              {
                key: "local",
                icon: localOn ? <Check className="h-5 w-5 text-sam-primary" /> : <MapPin className="h-5 w-5" />,
                label: areaLabel
                  ? t("community_area_sheet_only", { label: areaLabel })
                  : t("community_area_sheet_only_unset"),
                hint: localOn ? current : undefined,
                onClick: onPickLocal,
              },
              {
                key: "other",
                icon: <Search className="h-5 w-5" />,
                label: t("community_area_sheet_pick"),
                onClick: onPickOther,
              },
            ],
            [manage],
          ]}
        />
      </div>
    </DibayBottomSheet>
  );
}
