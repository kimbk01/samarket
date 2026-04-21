"use client";

import Link from "next/link";
import type { BusinessProduct } from "@/lib/types/business";

interface BusinessProductListProps {
  products: BusinessProduct[];
  shopSlug: string;
  emptyMessage?: string;
  /** 없으면 `/products/:id` */
  productHref?: (p: BusinessProduct) => string;
}

export function BusinessProductList({
  products,
  shopSlug: _shopSlug,
  emptyMessage = "등록된 상품이 없습니다.",
  productHref,
}: BusinessProductListProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface p-8 text-center sam-text-body text-sam-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {products.map((p) => {
        const href = productHref ? productHref(p) : `/products/${p.id}`;
        return (
        <Link
          key={p.id}
          href={href}
          className="block overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
        >
          <div className="aspect-square w-full bg-sam-surface-muted">
            {p.thumbnail ? (
              <img
                src={p.thumbnail}
                alt={p.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center sam-text-helper text-sam-meta">
                이미지 없음
              </div>
            )}
          </div>
          <div className="p-2">
            <div className="mb-0.5 flex flex-wrap gap-1">
              {p.isFeatured ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 sam-text-xxs font-semibold text-amber-900">
                  대표
                </span>
              ) : null}
              {p.menuGroupName ? (
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">
                  {p.menuGroupName}
                </span>
              ) : null}
            </div>
            <p className="truncate sam-text-body-secondary font-medium text-sam-fg">
              {p.title}
            </p>
            <p className="sam-text-body font-semibold text-sam-fg">
              ₩{p.price.toLocaleString()}
            </p>
          </div>
        </Link>
      );
      })}
    </div>
  );
}
