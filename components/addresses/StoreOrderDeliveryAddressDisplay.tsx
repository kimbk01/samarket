"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatStoreOrderDeliveryAddressParts } from "@/lib/addresses/store-order-delivery-address-display";
import { ADDR_BODY } from "@/lib/ui/address-flow-viber";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

const ADDR_LIST_ADDRESS_TEXT = `${ADDR_BODY} text-[12px] leading-snug text-sam-muted`;

/**
 * 저장된 주문 배달지(`delivery_address_summary` + `detail`) — 주소 관리 PH 카드·장바구니와 동일 표기.
 */
export function StoreOrderDeliveryAddressDisplay(props: {
  summary?: string | null;
  detail?: string | null;
  /** 픽업 등 주소 없을 때 */
  emptyFallback?: string;
  className?: string;
  /** 비PH 레거시 상세에 「상세주소」 라벨 */
  showDetailLabel?: boolean;
}) {
  const { t } = useI18n();
  const { summary, detail, emptyFallback, className = "", showDetailLabel = true } = props;
  const { gatePrefix, streetBody, detailLine } = formatStoreOrderDeliveryAddressParts({
    summary,
    detail,
  });

  const hasBody = Boolean(gatePrefix || streetBody || detailLine);
  if (!hasBody) {
    return emptyFallback ? (
      <p className={`whitespace-pre-wrap sam-text-helper text-sam-fg ${className}`.trim()}>{emptyFallback}</p>
    ) : null;
  }

  const phCardLine = gatePrefix && streetBody;

  return (
    <div className={className}>
      <div className={`flex gap-2 ${ADDR_LIST_ADDRESS_TEXT}`}>
        <AddressKindHeadPin kind="general" className="pt-0.5" />
        <div className="min-w-0 flex-1">
          {phCardLine ? (
            <>
              <strong className="font-bold text-sam-fg">{gatePrefix}</strong>
              <span className="text-sam-fg">, </span>
              <span className="text-sam-fg">{streetBody}</span>
            </>
          ) : streetBody ? (
            <span className="text-sam-fg">{streetBody}</span>
          ) : gatePrefix ? (
            <strong className="font-bold text-sam-fg">{gatePrefix}</strong>
          ) : (
            "—"
          )}
        </div>
      </div>
      {showDetailLabel && detailLine && !phCardLine ? (
        <div className="mt-2 flex min-w-0 max-w-full flex-nowrap items-end gap-2">
          <span className="shrink-0 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sam-primary">
            {t("addr_ui_detail_address_label")}
          </span>
          <span
            className="min-w-0 flex-1 border-b border-sam-primary-border/55 pb-0.5 text-left text-[12px] font-bold text-sam-fg"
            translate="no"
          >
            {detailLine}
          </span>
        </div>
      ) : null}
    </div>
  );
}
