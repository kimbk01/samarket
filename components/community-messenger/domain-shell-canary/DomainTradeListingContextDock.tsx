"use client";

import { MessengerTradeProductDockRow } from "@/components/community-messenger/room/phase2/MessengerTradeProductDockRow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

export type DomainTradeListingContextDockProps = {
  itemId: string | null;
  productTitle: string;
  productImageUrl: string | null;
  /** deleted / no access */
  unavailable?: boolean;
  keyboardCompact?: boolean;
};

/**
 * Domain-seeded Trade product Context Dock.
 * Ready as soon as listing title/id exist — never stuck on "loading trade info".
 * Full TradeFlowBanner still requires a real product_chats id via TradeProcessSection.
 */
export function DomainTradeListingContextDock({
  itemId,
  productTitle,
  productImageUrl,
  unavailable = false,
  keyboardCompact = false,
}: DomainTradeListingContextDockProps) {
  const { t, language } = useI18n();
  const title = productTitle.trim() || t("nav_trade_product_fallback");
  const id = itemId?.trim() || "";

  if (keyboardCompact) return null;

  if (unavailable || !id) {
    return (
      <div
        className={`mx-auto w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} border-t border-[color:var(--cm-room-divider)] bg-sam-app px-3 py-2`}
        data-domain-trade-listing-dock="unavailable"
      >
        <p className="sam-text-xxs text-[color:var(--cm-room-text-muted)]">
          {language === "en" ? "Listing unavailable" : "상품 정보를 확인할 수 없습니다"}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} border-t border-[color:var(--cm-room-divider)] bg-sam-app px-3 py-2`}
      data-domain-trade-listing-dock="ready"
      data-item-id={id}
    >
      <MessengerTradeProductDockRow
        thumbnailUrl={productImageUrl}
        line1={title}
        line2={t("nav_trade_chat_label")}
        detailHref={`/post/${encodeURIComponent(id)}`}
        productLabel={title}
      />
    </div>
  );
}
