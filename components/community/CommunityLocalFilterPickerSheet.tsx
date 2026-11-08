"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { DibaySheetHeader } from "@/components/ui/dibay-overlay/DibaySheetParts";
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
  const { t, safeT } = useI18n();
  if (!open) return null;

  return (
    /**
     * 거래 지역 검색(`TradeBrowseLocationSheet` search 단계)과 같은 틀 — `heightRatio` 고정 높이 모드.
     * 키보드가 열리면 공용 시트가 보이는 영역(키보드 위)의 85% 로 맞추고 안쪽은 flex 로 채운다.
     * 이전(2026-11-09 iPhone 결함): 안쪽을 70vh 로 고정 → 키보드가 열려 시트가 줄어도 내용이 넘쳐
     * 입력칸 자동 스크롤로 제목·손잡이가 상단 상태 표시줄 밑으로 밀려 잘렸다.
     */
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      ariaLabel={safeT("community_local_filter_title")}
      heightRatio={0.85}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-community-local-filter-picker="search">
        {/* 시트 머리 공용 규칙(DibaySheetHeader): 제목 왼쪽 + 오른쪽 X — Owner 2026-11-09 「모달이 올라오면 X 로 꺼지게」 */}
        <div className="shrink-0">
          <DibaySheetHeader title={safeT("community_local_filter_title")} onClose={onClose} closeLabel={t("nav_close")} />
        </div>
        <p className="shrink-0 px-4 pb-2 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-text-secondary)]">
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
