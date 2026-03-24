"use client";

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
  return (
    <button
      type="button"
      onClick={() => onDrawerOpenChange(!drawerOpen)}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-800 hover:bg-black/10"
      aria-expanded={drawerOpen}
      aria-label={drawerOpen ? "주문 내역 패널 닫기" : "주문 내역 패널 열기"}
      aria-controls={`seller-drawer-${chatRoomId}`}
    >
      <svg
        className="h-5 w-5 text-neutral-800"
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
