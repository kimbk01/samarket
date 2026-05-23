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
}: {
  src: string;
  alt?: string;
  /** 어드민 Storage URL — cover 로 꽉 채움 */
  isUploaded: boolean;
  dimmed?: boolean;
  frameClassName?: string;
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
        className={storeTaxonomyThumbImgClass(isUploaded)}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
