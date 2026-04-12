"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { Product } from "@/lib/types/product";
import type { ProductStatus } from "@/lib/types/product";
import {
  SELLER_LISTING_LABEL,
  normalizeSellerListingState,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import { SELLER_CANCEL_SALE_CONFIRM_MESSAGE } from "@/lib/posts/seller-cancel-sale-ui";

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
    if (confirm(`이 상품을 "${newStatus === "active" ? "판매중" : newStatus === "reserved" ? "예약중" : newStatus === "sold" ? "판매완료" : "숨김"}"으로 변경할까요?`)) {
      onStatusChange(product.id, newStatus);
      setOpen(false);
    }
  };

  const handleBump = () => {
    onBump(product.id);
    setOpen(false);
  };

  const handleDelete = () => {
    if (confirm("이 상품을 삭제할까요? 삭제된 상품은 복구할 수 없어요.")) {
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
        aria-label="더보기"
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-ui-rect border border-sam-border bg-sam-surface py-1">
          <Link
            href={`/products/${product.id}/edit`}
            className="block px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app"
            onClick={() => setOpen(false)}
          >
            수정
          </Link>
          {product.status === "active" && (
            <button
              type="button"
              onClick={handleBump}
              className="w-full px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app"
            >
              끌올
            </button>
          )}
          {product.status === "hidden" ? (
            <button
              type="button"
              onClick={() => handleStatusChange("active")}
              className="w-full px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app"
            >
              다시 판매중으로
            </button>
          ) : (
            <>
              <div className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-sam-meta">
                거래 상태
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
                    className={`w-full px-4 py-2.5 text-left text-[14px] hover:bg-sam-app ${
                      isCurrent
                        ? "cursor-default bg-signature/5 font-semibold text-signature"
                        : "text-sam-fg"
                    } disabled:opacity-50`}
                  >
                    {SELLER_LISTING_LABEL[state]}
                    {isCurrent ? " · 현재" : ""}
                  </button>
                );
              })}
            </>
          )}
          {product.status !== "hidden" && product.status !== "sold" && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(SELLER_CANCEL_SALE_CONFIRM_MESSAGE)) return;
                onStatusChange(product.id, "hidden");
                setOpen(false);
              }}
              className="w-full px-4 py-2.5 text-left text-[14px] text-red-700 hover:bg-red-50"
            >
              물품 판매 취소
            </button>
          )}
          {product.status !== "hidden" && (
            <button
              type="button"
              onClick={() => handleStatusChange("hidden")}
              className="w-full px-4 py-2.5 text-left text-[14px] text-sam-fg hover:bg-sam-app"
            >
              숨기기
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="w-full px-4 py-2.5 text-left text-[14px] text-red-600 hover:bg-red-50"
          >
            삭제
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
