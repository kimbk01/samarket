"use client";

import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import Link from "next/link";
import { WriteScreenTier1Sync } from "./WriteScreenTier1Sync";
import { useWriteScreenEmbeddedTier1 } from "./useWriteScreenEmbeddedTier1";

interface FeatureWriteBlockProps {
  category: CategoryWithSettings;
  /** `/write` 시트에서 닫기와 동일하게 동작 */
  onCancel?: () => void;
  suppressTier1Chrome?: boolean;
}

/**
 * feature 타입: 글쓰기 불가, 안내만 표시
 */
export function FeatureWriteBlock({
  category,
  onCancel,
  suppressTier1Chrome = false,
}: FeatureWriteBlockProps) {
  const backHref = getCategoryHref(category);
  const embeddedTier1 = useWriteScreenEmbeddedTier1();

  return (
    <div
      className={
        embeddedTier1 || suppressTier1Chrome
          ? "flex w-full min-w-0 flex-col bg-sam-app"
          : "min-h-screen bg-sam-app"
      }
    >
      {!suppressTier1Chrome ? (
        <WriteScreenTier1Sync
          tier1Mode={embeddedTier1 ? "embedded" : "global"}
          title={`${category.name} · 글쓰기`}
          backHref={backHref}
          onRequestClose={onCancel}
        />
      ) : null}
      <div className="mx-auto w-full max-w-[480px] px-4 py-12 text-center md:max-w-2xl lg:max-w-3xl">
        <p className="sam-text-body font-medium text-sam-fg">이 카테고리는 글쓰기를 지원하지 않습니다.</p>
        <p className="mt-2 sam-text-body-secondary text-sam-muted">혜택·기능 페이지는 별도 안내를 확인해 주세요.</p>
        <Link
          href={backHref}
          className="mt-6 inline-block rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white"
        >
          카테고리로 돌아가기
        </Link>
      </div>
    </div>
  );
}
