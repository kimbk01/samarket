"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { TradeLocationNationalPicker } from "@/components/trade/TradeLocationNationalPicker";

type CommunityLocalFilterPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  /** 지금 보는 시/군 PSGC */
  initialLguId?: string;
  onApply: (lguId: string) => void;
};

/**
 * Community 「보는 동네」 선택 — 전국 시/군 LGU 검색(거래와 같은 검색 화면, 주소 SSOT 2단계).
 * 이전: 앱 동네 목록(4개 도시권 143개) 드롭다운. 필터만 바꾸고 대표 주소는 바꾸지 않는다.
 */
export function CommunityLocalFilterPickerSheet({
  open,
  onClose,
  initialLguId = "",
  onApply,
}: CommunityLocalFilterPickerSheetProps) {
  const { safeT } = useI18n();
  if (!open) return null;

  return (
    <DibayBottomSheet open={open} onClose={onClose} title={safeT("community_local_filter_title")}>
      <div className="flex h-[min(70vh,560px)] min-h-0 flex-col">
        <p className="px-4 pb-2 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-secondary)]">
          {safeT("community_local_filter_hint")}
        </p>
        <TradeLocationNationalPicker
          selectedCanonicalId={initialLguId || null}
          onBack={onClose}
          onSelect={(hit) => {
            onApply(hit.canonicalId);
            onClose();
          }}
        />
      </div>
    </DibayBottomSheet>
  );
}
