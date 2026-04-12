"use client";

import type { Product } from "@/lib/types/product";
import { ProductCard } from "@/components/product/ProductCard";

interface SearchResultListProps {
  products: Product[];
}

export function SearchResultList({ products }: SearchResultListProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[14px] text-sam-muted">검색 결과가 없어요</p>
        <p className="mt-1 text-[12px] text-sam-meta">
          다른 키워드나 필터를 시도해 보세요.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2 px-4 py-3">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
