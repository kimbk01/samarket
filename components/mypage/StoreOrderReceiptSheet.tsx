"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { Sam } from "@/lib/ui/sam-component-classes";
import { formatMoneyPhp } from "@/lib/utils/format";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { renderReceiptImage, shareOrSaveReceiptImage } from "@/lib/mypage/store-order-receipt-image";

export type StoreOrderReceiptLine = { id: string; title: string; qty: number; subtotal: number };

export type StoreOrderReceiptData = {
  storeName: string;
  storeAddressLines: string[];
  orderNo: string;
  orderedAt: string;
  lines: StoreOrderReceiptLine[];
  itemsSubtotal: number;
  discount: number;
  giftUsed: number;
  deliveryFee: number;
  paymentMethod: string;
  paymentAmount: number;
};

/**
 * 주문 내역서 (v2.1 S32 · PR-2c) — 주문 상세 응답만으로 그린다(추가 조회 없음).
 * 매장 사업자번호가 없어 법정 영수증이 아님을 화면·공유 문구에 함께 표시한다.
 * S2-04·S2-06 — 오버레이 SSOT `DibayBottomSheet`: 하단 탭 위 레이어·dvh 최대 높이·스크롤 잠금·
 * Android 뒤로(back stack) 를 공용 primitive 에서 받는다 (자체 z-50 고정 레이어 금지).
 */
export function StoreOrderReceiptSheet({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: StoreOrderReceiptData;
}) {
  const { t } = useI18n();

  const rows: Array<[string, string]> = [
    [t("mypage_comp_items_subtotal"), formatMoneyPhp(data.itemsSubtotal)],
    ...(data.discount > 0 ? [[t("store_owner_order_coupon_discount"), `−${formatMoneyPhp(data.discount)}`] as [string, string]] : []),
    ...(data.giftUsed > 0 ? [[t("mypage_receipt_gift_used"), `−${formatMoneyPhp(data.giftUsed)}`] as [string, string]] : []),
    [t("mypage_comp_delivery_fee"), formatMoneyPhp(data.deliveryFee)],
    [t("mypage_comp_payment_method_section"), data.paymentMethod],
  ];

  const shareText = [
    t("mypage_receipt_title"),
    data.storeName,
    ...data.storeAddressLines,
    `${t("mypage_receipt_order_no")}: ${data.orderNo}`,
    `${t("mypage_receipt_ordered_at")}: ${data.orderedAt}`,
    "",
    ...data.lines.map((l) => `${l.title} ×${l.qty}  ${formatMoneyPhp(l.subtotal)}`),
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `${t("mypage_comp_grand_total")}: ${formatMoneyPhp(data.paymentAmount)}`,
    "",
    t("mypage_receipt_not_tax_receipt"),
  ].join("\n");

  /** 이미지(파일 공유 지원 시 공유 시트) → 파일 공유 미지원 + 글 공유 지원(앱 WebView 등)이면 글 → 그 외 PNG 내려받기 */
  const share = async () => {
    try {
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      const blob = await renderReceiptImage([
        { kind: "title", text: t("mypage_receipt_title") },
        { kind: "text", text: data.storeName },
        ...data.storeAddressLines.map((line) => ({ kind: "text" as const, text: line, muted: true })),
        { kind: "text", text: `${t("mypage_receipt_order_no")} ${data.orderNo}`, muted: true },
        { kind: "text", text: `${t("mypage_receipt_ordered_at")} ${data.orderedAt}`, muted: true },
        { kind: "divider" },
        ...data.lines.map((l) => ({ kind: "row" as const, left: `${l.title} ×${l.qty}`, right: formatMoneyPhp(l.subtotal) })),
        { kind: "divider" },
        ...rows.map(([k, v]) => ({ kind: "row" as const, left: k, right: v })),
        { kind: "row", left: t("mypage_comp_grand_total"), right: formatMoneyPhp(data.paymentAmount), bold: true },
        { kind: "gap" },
        { kind: "text", text: t("mypage_receipt_not_tax_receipt"), muted: true },
      ]);
      const fileName = `dibay-order-${data.orderNo.replace(/[^A-Za-z0-9_-]/g, "") || "receipt"}.png`;
      const probe = new File([blob], fileName, { type: "image/png" });
      if (typeof nav.share === "function" && !nav.canShare?.({ files: [probe] })) {
        await nav.share({ title: t("mypage_receipt_title"), text: shareText });
        return;
      }
      const how = await shareOrSaveReceiptImage(blob, fileName, t("mypage_receipt_title"));
      if (how === "saved") showMypageToast(t("mypage_receipt_saved"));
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      showMypageToast(t("mypage_receipt_share_failed"), "error");
    }
  };

  return (
    <DibayBottomSheet
      open={open}
      onClose={onClose}
      title={t("mypage_receipt_title")}
      ariaLabel={t("mypage_receipt_title")}
      footer={
        <div className="flex gap-2 border-t border-sam-border-soft px-5 py-3">
          <button type="button" onClick={onClose} className="sam-btn sam-btn--secondary flex-1">
            {t("common_close")}
          </button>
          <button type="button" onClick={() => void share()} className={`${Sam.btn.primaryCombo} flex-1`}>
            {t("mypage_receipt_share")}
          </button>
        </div>
      }
    >
      <div className="px-5 pb-4 pt-1" data-store-order-receipt="1">
        <div className="border-b border-dashed border-sam-border pb-3">
          <p className="sam-text-body font-semibold text-sam-fg">{data.storeName}</p>
          {data.storeAddressLines.map((line, i) => (
            <p key={i} className="sam-text-helper text-sam-muted">{line}</p>
          ))}
          <p className="mt-2 sam-text-helper text-sam-muted">
            {t("mypage_receipt_order_no")} {data.orderNo}
          </p>
          <p className="sam-text-helper text-sam-muted">
            {t("mypage_receipt_ordered_at")} {data.orderedAt}
          </p>
        </div>
        <ul className="space-y-1.5 border-b border-dashed border-sam-border py-3 text-sm">
          {data.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 text-sam-fg">
              <span className="min-w-0 break-words">
                {l.title} ×{l.qty}
              </span>
              <span className="shrink-0">{formatMoneyPhp(l.subtotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 py-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-sam-muted">{k}</dt>
              <dd className="min-w-0 break-words text-right text-sam-fg">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-sam-border pt-2 text-base font-bold text-sam-fg">
            <dt>{t("mypage_comp_grand_total")}</dt>
            <dd>{formatMoneyPhp(data.paymentAmount)}</dd>
          </div>
        </dl>
        <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 sam-text-helper text-sam-muted">
          {t("mypage_receipt_not_tax_receipt")}
        </p>
      </div>
    </DibayBottomSheet>
  );
}
