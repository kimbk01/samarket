"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types/product";
import type { ProductStatus } from "@/lib/types/product";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";
import { tradeListingPostFromProduct } from "@/components/post/TradeListingStatusBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { productStatusLabel } from "@/lib/mypage/seller-listing-i18n";

interface MyProductActionsProps {
  product: Product;
  onStatusChange: (productId: string, newStatus: ProductStatus) => void;
  onDelete: (productId: string) => void;
}

export function MyProductActions({
  product,
  onStatusChange,
  onDelete,
}: MyProductActionsProps) {
  const { t, safeT } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listingPost = tradeListingPostFromProduct(product);
  const isSold = resolveMarketplacePublicListingStatus(listingPost) === "sold";
  const isHidden = product.status === "hidden" || product.status === "blinded";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const handleStatusChange = async (newStatus: ProductStatus) => {
    const statusLabel = productStatusLabel(t, newStatus);
    const ok = await dibayConfirm({
      title: t("mypage_comp_product_status_confirm", { status: statusLabel }),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_confirm"),
    });
    if (ok) {
      onStatusChange(product.id, newStatus);
      setOpen(false);
    }
  };

  const handleDelete = async () => {
    const ok = await dibayConfirm({
      title: t("mypage_comp_product_delete_confirm"),
      cancelLabel: t("common_cancel"),
      confirmLabel: t("common_delete"),
      confirmTone: "destructive",
    });
    if (ok) {
      onDelete(product.id);
      setOpen(false);
    }
  };

  const promoteLabel = safeT("trade_promo_detail_cta", {
    fallbackKo: "더 알리기",
    fallbackEn: "Promote more",
  });

  return (
    <div className="relative shrink-0 self-start" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
        aria-label={t("mypage_comp_more_aria")}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface py-1 shadow-sm">
          <Link
            href={`/products/${product.id}/edit`}
            className="block px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            onClick={() => setOpen(false)}
          >
            {t("mypage_comp_product_edit")}
          </Link>
          {product.status === "active" && !isSold ? (
            <Link
              href={`/mypage/points/promotions?postId=${encodeURIComponent(product.id)}`}
              className="block px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
              onClick={() => setOpen(false)}
            >
              {promoteLabel}
            </Link>
          ) : null}
          {isHidden ? (
            <button
              type="button"
              onClick={() => handleStatusChange("active")}
              className="w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_product_relist_active")}
            </button>
          ) : !isSold ? (
            <button
              type="button"
              onClick={() => handleStatusChange("hidden")}
              className="w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_product_hide")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            className="w-full px-4 py-2.5 text-left sam-text-body text-red-600 hover:bg-red-50"
          >
            {t("mypage_comp_product_delete")}
          </button>
        </div>
      )}
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
