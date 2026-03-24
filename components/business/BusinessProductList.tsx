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
      <div className="rounded-lg bg-white p-8 text-center text-[14px] text-gray-500">
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
          className="block overflow-hidden rounded-lg border border-gray-100 bg-white"
        >
          <div className="aspect-square w-full bg-gray-100">
            {p.thumbnail ? (
              <img
                src={p.thumbnail}
                alt={p.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-gray-400">
                이미지 없음
              </div>
            )}
          </div>
          <div className="p-2">
            <div className="mb-0.5 flex flex-wrap gap-1">
              {p.isFeatured ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  대표
                </span>
              ) : null}
              {p.menuGroupName ? (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {p.menuGroupName}
                </span>
              ) : null}
            </div>
            <p className="truncate text-[13px] font-medium text-gray-900">
              {p.title}
            </p>
            <p className="text-[14px] font-semibold text-gray-900">
              ₩{p.price.toLocaleString()}
            </p>
          </div>
        </Link>
      );
      })}
    </div>
  );
}
