"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

const FOOTER_BTN_BASE =
  "flex min-h-11 min-w-0 flex-1 touch-manipulation select-none items-center justify-center rounded-md px-3 text-[14px] font-semibold leading-snug shadow-sm transition-[transform,background-color,border-color,box-shadow,opacity] duration-150 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.98] active:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--biz-primary)]/35 disabled:pointer-events-none disabled:opacity-45";

const BTN_DETAIL =
  `${FOOTER_BTN_BASE} border border-[var(--biz-primary)]/40 bg-[var(--biz-card-bg)] text-[var(--biz-primary)] hover:border-[var(--biz-primary)]/55 hover:bg-[var(--biz-tan-soft)] active:border-[var(--biz-primary)]/70 active:bg-[var(--biz-primary-soft)] active:shadow-inner`;

const BTN_CHAT =
  `${FOOTER_BTN_BASE} border border-transparent bg-[var(--biz-primary)] text-white hover:bg-[var(--biz-primary-hover)] active:bg-[var(--biz-primary-active)] active:shadow-inner`;

/** 주문 카드 하단 — 상세 보기 · 채팅 하기 */
export function OwnerStoreOrderCardFooterActions({
  onViewDetail,
  onOpenChat,
}: {
  onViewDetail: () => void;
  onOpenChat: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t("store_owner_order_card_actions_aria")}
      className="mt-3 flex gap-2 border-t border-[var(--biz-card-border)] pt-3"
    >
      <button type="button" onClick={onViewDetail} className={BTN_DETAIL}>
        {t("store_owner_view_detail")}
      </button>
      <button type="button" onClick={onOpenChat} className={BTN_CHAT}>
        {t("store_owner_open_chat_btn")}
      </button>
    </div>
  );
}
