"use client";

const FOOTER_BTN_BASE =
  "flex min-h-11 min-w-0 flex-1 touch-manipulation select-none items-center justify-center rounded-md px-3 text-[14px] font-semibold leading-snug shadow-sm transition-[transform,background-color,border-color,box-shadow,opacity] duration-150 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.98] active:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2D7FF9]/35 disabled:pointer-events-none disabled:opacity-45";

const BTN_DETAIL =
  `${FOOTER_BTN_BASE} border border-[#2D7FF9]/40 bg-white text-[#2D7FF9] hover:border-[#2D7FF9]/55 hover:bg-[#F8FAFF] active:border-[#2D7FF9]/70 active:bg-[#E0EFFF] active:shadow-inner`;

const BTN_CHAT =
  `${FOOTER_BTN_BASE} border border-transparent bg-[#2D7FF9] text-white hover:bg-[#1a6fe8] active:bg-[#155ed0] active:shadow-inner`;

/** 주문 카드 하단 — 상세 보기 · 채팅 하기 */
export function OwnerStoreOrderCardFooterActions({
  onViewDetail,
  onOpenChat,
}: {
  onViewDetail: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="주문 카드 작업"
      className="mt-3 flex gap-2 border-t border-[#F0F0F0] pt-3"
    >
      <button type="button" onClick={onViewDetail} className={BTN_DETAIL}>
        상세 보기
      </button>
      <button type="button" onClick={onOpenChat} className={BTN_CHAT}>
        채팅 하기
      </button>
    </div>
  );
}
