"use client";

import { ChevronRight } from "lucide-react";

/** 홈 칸 제목 줄 — 네이버 홈 비율(16 · 600). 홈은 요약만 보이므로 「더보기 ›」 는 쓰지 않는다 (Owner 2026-11-09) */
export function HomeSectionHead({
  title,
  moreLabel,
  onMore,
}: {
  title: string;
  moreLabel?: string;
  onMore?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-[18px]">
      <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#141a16]">{title}</h2>
      {onMore && moreLabel ? (
        <button type="button" onClick={onMore} className="flex items-center text-[13px] text-[#767676] active:opacity-60">
          {moreLabel}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * 홈 줄 제목 — 시안 R3 (계획서 C~E): 제목(서비스 이름 초록) · 한 줄 설명 · 「전체보기 ›」.
 * 제목 문구는 `{brand}` 자리에 서비스 이름이 들어가는 카탈로그 키 하나로 쓴다(언어별 어순 유지).
 */
export function HomeShelfHead({
  title,
  brand,
  sub,
  allLabel,
  onAll,
}: {
  /** `{brand}` 를 품은 완성 문구 — `t(key, { brand: HOME_SHELF_BRAND_MARK })` */
  title: string;
  brand: string;
  sub?: string;
  allLabel: string;
  onAll: () => void;
}) {
  const [pre, post] = title.split(HOME_SHELF_BRAND_MARK);
  return (
    <div className="home-shelf-head">
      <div className="min-w-0">
        <h2 className="home-shelf-title">
          {post === undefined ? (
            title
          ) : (
            <>
              {pre}
              <em>{brand}</em>
              {post}
            </>
          )}
        </h2>
        {sub ? <p className="home-shelf-sub">{sub}</p> : null}
      </div>
      <button type="button" onClick={onAll} className="home-shelf-all">
        {allLabel}
        <ChevronRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

/** 제목 문구 안 서비스 이름 자리 표시 (화면에 그대로 나오지 않음) */
export const HOME_SHELF_BRAND_MARK = "\u0001";
