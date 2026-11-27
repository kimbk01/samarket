"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  chatRoomId: string;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
};

/**
 * 매장 판매자 채팅 헤더 — 우측 주문 패널(서랍) 열기 버튼.
 * 패널 본문은 `StoreOrderSellerOrderPanel` + `ChatDetailView`에서 렌더합니다.
 */
export function StoreOrderSellerHamburger({ chatRoomId, drawerOpen, onDrawerOpenChange }: Props) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onDrawerOpenChange(!drawerOpen)}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect text-sam-fg hover:bg-black/10"
      aria-expanded={drawerOpen}
      aria-label={drawerOpen ? t("store_chat_seller_panel_close") : t("store_chat_seller_panel_open")}
      aria-controls={`seller-drawer-${chatRoomId}`}
    >
      <svg
        className="h-5 w-5 text-sam-fg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
