"use client";

import { DibayActionSheet, dibayConfirm, type DibayActionSheetItem } from "@/components/ui/dibay-overlay";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types/product";
import type { ProductStatus } from "@/lib/types/product";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";
import { tradeListingPostFromProduct } from "@/components/post/TradeListingStatusBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { productStatusLabel } from "@/lib/mypage/seller-listing-i18n";
import { withTradeBoostListingNote } from "@/lib/promotion/trade-boost-listing-notice";

/** 숨김·다시 보이기(`hidden`/`active`) + 판매완료(`sold`, 한 방향 — 거래 B Owner 2026-10-28) */
export type MyProductStatusChange = ProductStatus;

interface MyProductActionsProps {
  product: Product;
  onStatusChange: (productId: string, newStatus: MyProductStatusChange) => void;
  onDelete: (productId: string) => void;
  /** Opens CUT F promote sheet on listing card. */
  onPromoteClick?: () => void;
}

export function MyProductActions({
  product,
  onStatusChange,
  onDelete,
  onPromoteClick,
}: MyProductActionsProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const listingPost = tradeListingPostFromProduct(product);
  const isSold = resolveMarketplacePublicListingStatus(listingPost) === "sold";
  const isHidden = product.status === "hidden" || product.status === "blinded";

  const handleStatusChange = async (newStatus: MyProductStatusChange) => {
    const statusLabel = productStatusLabel(t, newStatus);
    /** 판매완료는 되돌릴 수 없다 — 거래 공통 확인 문구(채팅방·상세와 같음) */
    /** 광고 중인 글: 판매완료 = 광고 종료(환급 0) · 숨김 = 광고 일시정지 안내 (DB 트리거와 같은 규칙) */
    const ok = await dibayConfirm(
      newStatus === "sold"
        ? {
            title: t("popup_q_mark_sold"),
            description: await withTradeBoostListingNote(t, product.id, "sold", t("popup_note_sold_final")),
            cancelLabel: t("common_cancel"),
            confirmLabel: t("popup_btn_mark_sold"),
          }
        : {
            title: t("popup_q_change_item_status_named", { status: statusLabel }),
            description:
              newStatus === "hidden" ? await withTradeBoostListingNote(t, product.id, "hide") : undefined,
            cancelLabel: t("common_cancel"),
            confirmLabel: t("popup_cta_change"),
          }
    );
    if (ok) onStatusChange(product.id, newStatus);
  };

  const handleDelete = async () => {
    const ok = await dibayConfirm({
      title: t("popup_product_delete_title"),
      description: await withTradeBoostListingNote(t, product.id, "delete", t("popup_note_cannot_restore")),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (ok) onDelete(product.id);
  };

  const promoteLabel = safeT("trade_ad_cta", {
    fallbackKo: "광고하기",
    fallbackEn: "Advertise",
  });

  /** UI-6 ⋮ 항목·순서·문구 그대로 — 표면만 인라인 드롭다운 → `DibayActionSheet`(최종 설계 S20) */
  /** 판매완료 = 수정·삭제 불가(서버 `allowAnyPostUpdate`·`allowSoftDelete`) — 누르면 확인창 뒤 거절되던 막다른 길 제거 (실기 2026-11-03 F1) */
  const items: DibayActionSheetItem[] = [
    {
      key: "edit",
      label: t("mypage_comp_product_edit"),
      disabled: isSold,
      onClick: () => router.push(`/products/${product.id}/edit`),
    },
  ];
  if (product.status === "active" && !isSold && onPromoteClick) {
    items.push({ key: "promote", label: promoteLabel, onClick: () => onPromoteClick() });
  }
  /** 거래 B·M-2 (Owner 2026-10-28): 판매중 → 판매완료 한 방향만 — 판매완료 글에는 상태 메뉴 없음 */
  if (!isHidden && !isSold) {
    items.push({ key: "sold", label: t("trade_listing_mark_sold"), onClick: () => void handleStatusChange("sold") });
  }
  if (isHidden) {
    items.push({
      key: "relist",
      label: t("mypage_comp_product_relist_active"),
      onClick: () => void handleStatusChange("active"),
    });
  } else if (!isSold) {
    items.push({
      key: "hide",
      label: t("mypage_comp_product_hide"),
      onClick: () => void handleStatusChange("hidden"),
    });
  }
  items.push({
    key: "delete",
    label: t("mypage_comp_product_delete"),
    danger: true,
    disabled: isSold,
    onClick: () => void handleDelete(),
  });

  return (
    <div className="relative shrink-0 self-start">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
        aria-label={t("mypage_comp_more_aria")}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <MoreIcon />
      </button>
      <DibayActionSheet
        open={open}
        onClose={() => setOpen(false)}
        title={product.title || undefined}
        items={items}
        notice={isSold ? t("ui_post_owner_delete_locked_completed") : undefined}
        cancelLabel={t("common_cancel")}
      />
    </div>
  );
}

function MoreIcon() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </svg>
  );
}
