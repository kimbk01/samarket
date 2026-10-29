/**
 * 배달 메뉴 기본 아이콘 — 직접 그린 그림(외부 파일 없음). 스타벅스 녹색 바탕(#00704A) + 흰 선 그림.
 * - 메뉴 slug 별 그림. 어드민이 그림을 올리면(`icon_url`) 그 그림이 우선, 지우면 다시 이 그림.
 * - 그림이 없는 slug(어드민이 새로 만든 메뉴)는 같은 바탕에 이름 첫 글자.
 * Owner 2026-10-30: 「텍스트로만 된 부분을 이미지로, 다운로드보다 직접 구현, 배경 스타벅스 컬러」.
 */

import type { ReactNode } from "react";

export const DELIVERY_MENU_ICON_BG = "#00704A";

const S = { fill: "none", stroke: "#FFFFFF", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const F = { fill: "#FFFFFF" } as const;

/** 24×24 viewBox — 흰 선 그림 */
const GLYPHS: Record<string, ReactNode> = {
  /* ── 음식배달 ── */
  korean: (
    <>
      <path {...S} d="M3.5 12h17a8.5 7 0 0 1-17 0z" />
      <path {...S} d="M8 19.5h8" />
      <circle {...F} cx="12" cy="10" r="1.6" />
      <path {...S} d="M6.5 10.5c1-1.4 2.2-1.9 3.3-1.6M14.2 8.9c1.2-.3 2.4.2 3.3 1.6" />
      <path {...S} d="M15 3.5 11 9M18 3.5 13.5 9" />
    </>
  ),
  chinese: (
    <>
      <path {...S} d="M3.5 12.5h17a8.5 6.5 0 0 1-17 0z" />
      <path {...S} d="M7 12.5c.5-2 1-3 2-3s1.2 1.5 2 1.5 1.2-2.5 2.2-2.5 1.3 1.5 2.3 1.5 1.5-.5 1.8 2.5" />
      <path {...S} d="M14 3 9.5 10M17.5 3.5 12 10.5" />
      <path {...S} d="M9 19.5h6" />
    </>
  ),
  western: (
    <>
      <circle {...S} cx="12" cy="13" r="6" />
      <circle {...S} cx="12" cy="13" r="3" />
      <path {...S} d="M3 4v4.5a1.5 1.5 0 0 0 3 0V4M4.5 9v11" />
      <path {...S} d="M20.5 4c-1.6 0-2.5 2-2.5 5h2.5v11" />
    </>
  ),
  snack: (
    <>
      <path {...S} d="M3.5 12.5h17a8.5 6.5 0 0 1-17 0z" />
      <rect {...S} x="6" y="7.5" width="5.5" height="2.6" rx="1.3" transform="rotate(-12 8.75 8.8)" />
      <rect {...S} x="11.5" y="6.3" width="5.5" height="2.6" rx="1.3" transform="rotate(10 14.25 7.6)" />
      <rect {...S} x="9" y="9.6" width="5.5" height="2.4" rx="1.2" />
      <path {...S} d="M9 19.5h6" />
    </>
  ),
  chicken: (
    <>
      <path {...S} d="M14.5 3.5c3.3 0 6 2.6 6 5.8 0 3.6-3.2 5.4-6 5.4-1.2 0-2 .3-2.8 1.1l-1.4 1.4" />
      <path {...S} d="M14.5 3.5c-3.3 0-5.6 2.6-5.6 5.6 0 1.4.4 2.5 1.2 3.4" />
      <path {...S} d="m10.3 16.6 1.2 1.2a1.8 1.8 0 1 1-2.6 2.5 1.8 1.8 0 1 1-2.5-2.6 1.8 1.8 0 1 1 2.4-1.7z" />
    </>
  ),
  pizza: (
    <>
      <path {...S} d="M12 21 3.5 6.5a14 14 0 0 1 17 0z" />
      <path {...S} d="M5.3 9.4a11 11 0 0 1 13.4 0" />
      <circle {...F} cx="10" cy="11.5" r="1.2" />
      <circle {...F} cx="14" cy="12" r="1.2" />
      <circle {...F} cx="12" cy="15.5" r="1.1" />
    </>
  ),
  stew: (
    <>
      <path {...S} d="M4 11h16v4.5A4.5 4.5 0 0 1 15.5 20h-7A4.5 4.5 0 0 1 4 15.5z" />
      <path {...S} d="M2.5 12.5H4M20 12.5h1.5" />
      <path {...S} d="M8.5 4.5c-.8 1 .8 1.8 0 3M12 3.5c-.8 1.2.8 2 0 3.5M15.5 4.5c-.8 1 .8 1.8 0 3" />
    </>
  ),
  "late-night": (
    <>
      <path {...S} d="M19 14.5A7.5 7.5 0 1 1 10.5 4a6 6 0 0 0 8.5 10.5z" />
      <path {...F} d="m17.5 3.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
    </>
  ),
  "cafe-dessert": (
    <>
      <path {...S} d="M5 12h14l-1.6 8h-10.8z" />
      <path {...S} d="M5 12a3 3 0 0 1 2-4.8A4 4 0 0 1 12 4a4 4 0 0 1 5 3.2A3 3 0 0 1 19 12" />
      <path {...S} d="M9.5 12 9 20M14.5 12l.5 8" />
    </>
  ),
  /* ── 픽업 ── */
  "p-coffee": (
    <>
      <path {...S} d="M6 8h12l-1.4 12.5H7.4z" />
      <path {...S} d="M5 5.5h14V8H5z" />
      <path {...S} d="M8.5 3.5h7" />
      <circle {...S} cx="12" cy="13.5" r="2.4" />
    </>
  ),
  "p-bakery": (
    <>
      <path {...S} d="M3 14c0-4 4-7.5 9-7.5S21 10 21 14c0 2-1.5 3.5-3.5 3.5h-11C4.5 17.5 3 16 3 14z" />
      <path {...S} d="M8 7.5 9.5 12M12 6.5V12M16 7.5 14.5 12" />
    </>
  ),
  "p-meal": (
    <>
      <path {...S} d="M3.5 12h17a8.5 7 0 0 1-17 0z" />
      <path {...S} d="M6.5 12a5.5 4 0 0 1 11 0" />
      <path {...S} d="M8 19.5h8" />
    </>
  ),
  /* ── 장보기·쇼핑 ── */
  "k-mart": (
    <>
      <path {...S} d="M3.5 9.5h17l-1.8 10H5.3z" />
      <path {...S} d="M8 9.5 11 4M16 9.5 13 4" />
      <path {...S} d="M9.5 12.5v4.5M9.5 14.8l3-2.3M9.5 14.8l3 2.2" />
      <path {...S} d="M15 12.5v4.5" />
    </>
  ),
  "local-mart": (
    <>
      <path {...S} d="M2.5 4h2.8l2.2 11h11l1.8-8H6.3" />
      <circle {...S} cx="9" cy="19" r="1.4" />
      <circle {...S} cx="17" cy="19" r="1.4" />
    </>
  ),
  meat: (
    <>
      <path {...S} d="M15.5 4.5c3 1 4.8 4 3.8 7.5-1.2 4.2-5.6 7.6-10 6.8-3.3-.6-5.2-3.4-4.6-6.4.8-4 4.4-5.3 6.6-6.6 1.5-.9 2.6-1.8 4.2-1.3z" />
      <circle {...S} cx="13.5" cy="10.5" r="2.3" />
    </>
  ),
  seafood: (
    <>
      <path {...S} d="M3 12c3-4.5 8-6 12-3.5L19 5v14l-4-3.5C11 18 6 16.5 3 12z" />
      <circle {...F} cx="7.5" cy="11" r="1" />
    </>
  ),
  "side-dish": (
    <>
      <path {...S} d="M2.5 11h8a4 3.5 0 0 1-8 0z" />
      <path {...S} d="M13.5 11h8a4 3.5 0 0 1-8 0z" />
      <path {...S} d="M8 17.5h8a4 3 0 0 1-8 0z" />
      <path {...S} d="M5 9.5c.7-.8 2.3-.8 3 0M16 9.5c.7-.8 2.3-.8 3 0" />
    </>
  ),
  fruit: (
    <>
      <path {...S} d="M12 7.5c-2.5-1.8-7.5-1.2-7.5 4.5 0 4.2 3 8.5 5.4 8.5 1 0 1.3-.5 2.1-.5s1.1.5 2.1.5c2.4 0 5.4-4.3 5.4-8.5 0-5.7-5-6.3-7.5-4.5z" />
      <path {...S} d="M12 7.5c0-2 .8-3.5 2.5-4.5" />
      <path {...S} d="M12.3 5.5c1.6-1.8 3.8-1.8 4.7-1.3-.4 1.8-2.6 2.7-4.7 1.3z" />
    </>
  ),
  tools: (
    <>
      <path {...S} d="M14.5 6.2a4 4 0 0 0-5.3 5.3L3.5 17.2a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.1-.6-.6-2.1z" />
    </>
  ),
  pet: (
    <>
      <ellipse {...S} cx="12" cy="15.5" rx="4.5" ry="3.8" />
      <circle {...S} cx="6" cy="10" r="1.8" />
      <circle {...S} cx="9.5" cy="6.3" r="1.8" />
      <circle {...S} cx="14.5" cy="6.3" r="1.8" />
      <circle {...S} cx="18" cy="10" r="1.8" />
    </>
  ),
  "pet-care": (
    <>
      <path {...S} d="M12 20s-7.5-4.4-7.5-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2.4C19.5 15.6 12 20 12 20z" />
      <path {...S} d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  beauty: (
    <>
      <circle {...S} cx="6.5" cy="17" r="2.7" />
      <circle {...S} cx="17.5" cy="17" r="2.7" />
      <path {...S} d="M8.5 15 18 4M15.5 15 6 4" />
    </>
  ),
  academy: (
    <>
      <path {...S} d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
      <path {...S} d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11" />
      <path {...S} d="M21.5 9v5" />
    </>
  ),
  cleaning: (
    <>
      <path {...S} d="M8 10h6.5l1 10H7z" />
      <path {...S} d="M9.5 10V6.5h3.5L16 5" />
      <path {...S} d="M18 6.5h2.5M18.5 9l2 .8M18.5 4l2-.8" />
    </>
  ),
  laundry: (
    <>
      <rect {...S} x="4.5" y="3" width="15" height="18" rx="2" />
      <circle {...S} cx="12" cy="13.5" r="4.2" />
      <path {...S} d="M7.5 6.3h2M15.5 6.3h1" />
      <path {...S} d="M9.5 14c1-.9 1.8-.9 2.5 0s1.6.9 2.5 0" />
    </>
  ),
  repair: (
    <>
      <path {...S} d="M3.5 11.5 12 4l8.5 7.5" />
      <path {...S} d="M5.5 10v10h13V10" />
      <path {...S} d="m14.8 12.2-4.2 4.2M14 11.5l2 2" />
    </>
  ),
  /* ── 선물하기 ── */
  "gift-mall": (
    <>
      <rect {...S} x="3.5" y="8.5" width="17" height="4" rx="1" />
      <path {...S} d="M5 12.5v8h14v-8M12 8.5v12" />
      <path {...S} d="M12 8.5C9.5 8.5 7 7.8 7 5.9 7 4.6 8 3.8 9.2 4c1.6.3 2.8 2.4 2.8 4.5zM12 8.5c2.5 0 5-.7 5-2.6 0-1.3-1-2.1-2.2-1.9-1.6.3-2.8 2.4-2.8 4.5z" />
    </>
  ),
  "gift-dibay": (
    <>
      <rect {...S} x="2.5" y="6" width="19" height="12" rx="2" />
      <path {...S} d="M8 9.5v5h1.6a2.5 2.5 0 0 0 0-5z" />
      <path {...S} d="M15 9.5h3M15 12h3M15 14.5h2" />
    </>
  ),
  "gift-store": (
    <>
      <path {...S} d="M3.5 9 5 4.5h14L20.5 9" />
      <path {...S} d="M3.5 9a2.8 2.8 0 0 0 5.7 0 2.8 2.8 0 0 0 5.6 0 2.8 2.8 0 0 0 5.7 0" />
      <path {...S} d="M5 11.5V20h14v-8.5" />
      <path {...S} d="M10 20v-4.5h4V20" />
    </>
  ),
  "gift-owned": (
    <>
      <path {...S} d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z" />
      <path {...S} d="M3.5 8.5 12 13l8.5-4.5M12 13v8" />
      <path {...S} d="m7.8 6.2 8.5 4.5" />
    </>
  ),
  "gift-received": (
    <>
      <rect {...S} x="4" y="11" width="16" height="9.5" rx="1" />
      <path {...S} d="M12 11v9.5M4 15h16" />
      <path {...S} d="M12 2.5v6M9 6l3 3 3-3" />
    </>
  ),
  "gift-sent": (
    <>
      <path {...S} d="M21 3 3 10.5l7 2.8L21 3l-7.7 18-3.3-7.7" />
    </>
  ),
  /* ── 혜택모아보기 ── */
  coupons: (
    <>
      <path {...S} d="M3 7.5h18v3a1.8 1.8 0 0 0 0 3v3H3v-3a1.8 1.8 0 0 0 0-3z" />
      <path {...S} d="m9 15 6-6" />
      <circle {...F} cx="9.3" cy="9.5" r="1.1" />
      <circle {...F} cx="14.7" cy="14.5" r="1.1" />
    </>
  ),
  points: (
    <>
      <circle {...S} cx="12" cy="12" r="8.5" />
      <path {...S} d="M10 16.5v-9h2.5a2.6 2.6 0 0 1 0 5.2H10" />
    </>
  ),
  events: (
    <>
      <path {...S} d="M4 20 8.5 8.5l7 7z" />
      <path {...S} d="M13 4.5c.8 1.2.6 2.5-.5 3.5M17 6.5c1.4-.4 2.6.2 3 1.5M15.5 10.5c1.5-.6 3-.3 4 .8" />
      <circle {...F} cx="16.5" cy="3.8" r="1" />
      <circle {...F} cx="20.5" cy="13.8" r="1" />
    </>
  ),
  "member-benefits": (
    <>
      <path {...S} d="M3.5 8 7.5 12 12 5l4.5 7 4-4-1.8 11H5.3z" />
      <path {...S} d="M6 21h12" />
    </>
  ),
  /* ── 더보기 ── */
  __more: (
    <>
      <rect {...S} x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect {...S} x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect {...S} x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <path {...S} d="M16.75 13.5v6.5M13.5 16.75H20" />
    </>
  ),
};

/** 픽업 메뉴는 같은 음식 그림 (p-chicken → chicken …) */
const ALIASES: Record<string, string> = {
  "p-chicken": "chicken",
  "p-snack": "snack",
  "p-pizza": "pizza",
};

export function hasDeliveryMenuGlyph(slug: string): boolean {
  const key = ALIASES[slug] ?? slug;
  return key in GLYPHS;
}

/** 메뉴 기본 그림 (바탕 없음) — 없는 slug 는 null */
export function DeliveryMenuGlyph({ slug, className = "h-[62%] w-[62%]" }: { slug: string; className?: string }) {
  const key = ALIASES[slug] ?? slug;
  const glyph = GLYPHS[key];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden data-delivery-menu-glyph={key}>
      {glyph}
    </svg>
  );
}

/**
 * 아이콘 타일 내용 — 올린 그림이 없을 때: 녹색 바탕 + 기본 그림(없으면 흰 첫 글자).
 * 바탕색은 타일(부모)이 `DELIVERY_MENU_ICON_BG` 로 칠한다.
 */
export function DeliveryMenuGlyphOrInitial({
  slug,
  label,
  className,
}: {
  slug: string;
  label: string;
  className?: string;
}) {
  if (hasDeliveryMenuGlyph(slug)) return <DeliveryMenuGlyph slug={slug} className={className} />;
  return <span className="text-[16px] font-bold text-white">{label.slice(0, 1)}</span>;
}
