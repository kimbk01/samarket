"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types/product";
import type { ProductStatus } from "@/lib/types/product";
import {
  normalizeSellerListingState,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { productStatusLabel, sellerListingLabel } from "@/lib/mypage/seller-listing-i18n";

const LISTING_MENU_ORDER: SellerListingState[] = [
  "inquiry",
  "negotiating",
  "reserved",
  "completed",
];

interface MyProductActionsProps {
  product: Product;
  onStatusChange: (productId: string, newStatus: ProductStatus) => void;
  onSellerListingStateChange: (productId: string, state: SellerListingState) => void;
  listingSaving?: boolean;
  onBump: (productId: string) => void;
  onDelete: (productId: string) => void;
}

export function MyProductActions({
  product,
  onStatusChange,
  onSellerListingStateChange,
  listingSaving = false,
  onBump,
  onDelete,
}: MyProductActionsProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentListing = normalizeSellerListingState(
    product.sellerListingState,
    product.status
  );

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

  const handleStatusChange = (newStatus: ProductStatus) => {
    const statusLabel = productStatusLabel(t, newStatus);
    if (confirm(t("mypage_comp_product_status_confirm", { status: statusLabel }))) {
      onStatusChange(product.id, newStatus);
      setOpen(false);
    }
  };

  const handleBump = () => {
    onBump(product.id);
    setOpen(false);
  };

  const handleDelete = () => {
    if (confirm(t("mypage_comp_product_delete_confirm"))) {
      onDelete(product.id);
      setOpen(false);
    }
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-sam-muted hover:bg-sam-surface-muted"
        aria-label={t("mypage_comp_more_aria")}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface py-1">
          <Link
            href={`/products/${product.id}/edit`}
            className="block px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            onClick={() => setOpen(false)}
          >
            {t("mypage_comp_product_edit")}
          </Link>
          {product.status === "active" && (
            <Link
              href={`/mypage/points/promotions?postId=${encodeURIComponent(product.id)}`}
              className="block px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
              onClick={() => setOpen(false)}
            >
              {t("mypage_comp_product_go_promotion")}
            </Link>
          )}
          {product.status === "active" && (
            <button
              type="button"
              onClick={handleBump}
              className="w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_product_bump")}
            </button>
          )}
          {product.status === "hidden" ? (
            <button
              type="button"
              onClick={() => handleStatusChange("active")}
              className="w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_product_relist_active")}
            </button>
          ) : (
            <>
              <div className="px-4 py-1.5 sam-text-xxs font-medium uppercase tracking-wide text-sam-meta">
                {t("mypage_comp_product_listing_section")}
              </div>
              {LISTING_MENU_ORDER.map((state) => {
                const isCurrent = state === currentListing;
                return (
                  <button
                    key={state}
                    type="button"
                    disabled={listingSaving || isCurrent}
                    onClick={() => {
                      onSellerListingStateChange(product.id, state);
                      setOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left sam-text-body hover:bg-sam-app ${
                      isCurrent
                        ? "cursor-default bg-signature/5 font-semibold text-signature"
                        : "text-sam-fg"
                    } disabled:opacity-50`}
                  >
                    {sellerListingLabel(t, state)}
                    {isCurrent ? t("mypage_comp_listing_current_suffix") : ""}
                  </button>
                );
              })}
            </>
          )}
          {product.status !== "hidden" && product.status !== "sold" && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t("mypage_comp_product_cancel_sale_confirm"))) return;
                onStatusChange(product.id, "hidden");
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left sam-text-body text-red-700 hover:bg-red-50"
            >
              {t("mypage_comp_product_cancel_sale")}
            </button>
          )}
          {product.status !== "hidden" && (
            <button
              type="button"
              onClick={() => handleStatusChange("hidden")}
              className="w-full px-4 py-2.5 text-left sam-text-body text-sam-fg hover:bg-sam-app"
            >
              {t("mypage_comp_product_hide")}
            </button>
          )}
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
