"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import Link from "next/link";
import { WriteScreenTier1Sync } from "./WriteScreenTier1Sync";

interface FeatureWriteBlockProps {
  category: CategoryWithSettings;
}

/**
 * feature 타입: 글쓰기 불가, 안내만 표시
 */
export function FeatureWriteBlock({ category }: FeatureWriteBlockProps) {
  const backHref = getCategoryHref(category);

  return (
    <div className="min-h-screen bg-gray-50">
      <WriteScreenTier1Sync title={`${category.name} · 글쓰기`} backHref={backHref} />
      <div className="mx-auto max-w-[480px] px-4 py-12 text-center">
        <p className="text-[15px] font-medium text-gray-700">
          이 카테고리는 글쓰기를 지원하지 않습니다.
        </p>
        <p className="mt-2 text-[13px] text-gray-500">
          혜택·기능 페이지는 별도 안내를 확인해 주세요.
        </p>
        <Link
          href={backHref}
          className="mt-6 inline-block rounded-ui-rect bg-signature px-4 py-2.5 text-[14px] font-medium text-white"
        >
          카테고리로 돌아가기
        </Link>
      </div>
    </div>
  );
}
