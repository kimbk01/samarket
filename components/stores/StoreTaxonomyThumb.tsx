"use client";

import {
  STORE_TAXONOMY_THUMB_FRAME,
  storeTaxonomyThumbImgClass,
} from "@/lib/stores/store-taxonomy-thumbnail-ui";

/** 업종 taxonomy 아이콘 — 대분류 탭·세부 카드·browse 칩 공통 */
export function StoreTaxonomyThumb({
  src,
  alt = "",
  isUploaded,
  dimmed,
  frameClassName = "",
  imgSize = "tab",
  loading = "lazy",
}: {
  src: string;
  alt?: string;
  /** 어드민 Storage URL — cover 로 꽉 채움 */
  isUploaded: boolean;
  dimmed?: boolean;
  frameClassName?: string;
  /** `fill` — 홈 1차 업종 그리드 등 큰 프레임 */
  imgSize?: "tab" | "fill";
  /** 상단 고정·above-the-fold — lazy 금지 */
  loading?: "lazy" | "eager";
}) {
  return (
    <span
      className={[STORE_TAXONOMY_THUMB_FRAME, frameClassName, dimmed ? "opacity-90" : "opacity-100"]
        .filter(Boolean)
        .join(" ")}
      aria-hidden={!alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={storeTaxonomyThumbImgClass(isUploaded, imgSize)}
        loading={loading}
        decoding="async"
      />
    </span>
  );
}
