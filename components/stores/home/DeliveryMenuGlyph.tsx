/**
 * 배달 메뉴 기본 아이콘 — 직접 그린 컬러 그림(외부 파일 없음). 스타벅스 녹색 바탕(#00704A) 위 실제 모양 일러스트.
 * - 메뉴 slug 별 그림. 어드민이 그림을 올리면(`icon_url`) 그 그림이 우선, 지우면 다시 이 그림.
 * - 그림이 없는 slug(어드민이 새로 만든 메뉴)는 같은 바탕에 이름 첫 글자.
 * Owner 2026-10-30: 「텍스트로만 된 부분을 이미지로 · 다운로드보다 직접 구현 · 녹색 바탕에 실제 해당 이미지를 컬러로」.
 */

import type { ReactNode } from "react";

export const DELIVERY_MENU_ICON_BG = "#00704A";

/* 일러스트 색 */
const OUT = "#3B2412";
const CREAM = "#FFF4DC";
const WHITE = "#FFFFFF";
const RED = "#E5483B";
const ORANGE = "#F29A2E";
const YELLOW = "#F7C548";
const BROWN = "#B86B33";
const DARK = "#7A4219";
const LEAF = "#8BD17C";
const PINK = "#F7A8B8";
const BLUE = "#6BB6F0";
const GRAY = "#D8DDE3";
const STEEL = "#9AA4B1";
const GOLD = "#F3C969";
const BOWL = "#F5F0E6";

const o = { stroke: OUT, strokeWidth: 1.4, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/** 48×48 viewBox — 컬러 일러스트 (바탕 없음, 타일이 녹색) */
const GLYPHS: Record<string, ReactNode> = {
  /* ── 음식배달 ── */
  korean: (
    <>
      <path {...o} fill={BOWL} d="M7 24h34a17 14 0 0 1-34 0z" />
      <path {...o} fill="#F2E5C9" d="M16 37.5h16l-1.5 4h-13z" />
      <ellipse cx="24" cy="24" rx="17" ry="3.5" fill={WHITE} {...o} />
      <path fill={RED} d="M12.5 22.5c2-2.6 5-3.2 7-1.8l-1.6 2.8z" />
      <path fill={LEAF} d="M21 20.5c2-1.6 4.5-1.6 6 .2l-2 2.6z" />
      <path fill={ORANGE} d="M28 21c2.2-1.6 5-1.2 7 1.5l-3.5 1z" />
      <circle cx="24" cy="21.5" r="3.4" fill={YELLOW} {...o} />
      <path {...o} stroke={DARK} strokeWidth={2.2} d="M30 6 23 18M35 7 27 18.5" />
    </>
  ),
  chinese: (
    <>
      <path {...o} fill={RED} d="M7 25h34a17 13 0 0 1-34 0z" />
      <path fill={GOLD} d="M10 30h28l-1 2.5H11z" />
      <ellipse cx="24" cy="25" rx="17" ry="3.5" fill="#3A1F12" {...o} />
      <path fill="none" stroke={YELLOW} strokeWidth={2} strokeLinecap="round" d="M13 24.5c2-3 3.5-4 5-2.5s2.5 3 4 .5 3-4 4.5-1.5 2.5 3 4 0 2.5-2.5 4 .5" />
      <path {...o} stroke={DARK} strokeWidth={2.2} d="M27 5 20 21M33 6 24.5 21.5" />
    </>
  ),
  western: (
    <>
      <circle cx="24" cy="26" r="15" fill={WHITE} {...o} />
      <path {...o} fill={BROWN} d="M14 26c1-4.5 5-7 10-6.6 5.6.4 9.6 3.4 9.6 7.4 0 3.4-4 5.6-9.4 5.6S13.2 30 14 26z" />
      <path fill="none" stroke={DARK} strokeWidth={1.4} strokeLinecap="round" d="M18 24.5l3 3M22.5 23.5l3 3M27 23.5l3 3" />
      <circle cx="31" cy="33" r="2.4" fill={LEAF} {...o} />
      <path {...o} stroke={STEEL} strokeWidth={2} d="M5 8v8.5a2.5 2.5 0 0 0 5 0V8M7.5 17v24" />
      <path {...o} fill={GRAY} d="M43 8c-3 0-4.4 4-4.4 9.5H43z" />
      <path {...o} stroke={STEEL} strokeWidth={2} d="M42 17.5V41" />
    </>
  ),
  snack: (
    <>
      <path {...o} fill={BOWL} d="M6 25h36a18 13 0 0 1-36 0z" />
      <ellipse cx="24" cy="25" rx="18" ry="3.8" fill={RED} {...o} />
      <rect x="12" y="17" width="10" height="5" rx="2.5" fill="#F7E4C2" {...o} transform="rotate(-14 17 19.5)" />
      <rect x="23" y="15" width="10" height="5" rx="2.5" fill="#F7E4C2" {...o} transform="rotate(12 28 17.5)" />
      <rect x="18" y="20.5" width="10" height="4.6" rx="2.3" fill="#F7E4C2" {...o} />
      <circle cx="33.5" cy="22" r="2.6" fill={WHITE} {...o} />
      <circle cx="33.5" cy="22" r="1.2" fill={YELLOW} />
      <path fill={LEAF} d="M10.5 23.5 13 21l1 2.5z" />
    </>
  ),
  chicken: (
    <>
      <path {...o} fill={ORANGE} d="M28 6c7.5 0 13 5.5 13 12.4 0 7.8-7 11.6-13 11.6-2.6 0-4.4.7-6 2.4l-3 3-6.4-6.4 3-3c1.6-1.6 2.2-3.4 2.2-6C17.8 12 21.6 6 28 6z" />
      <path fill={YELLOW} d="M25 11c3-1.6 7-1 9 1.4-3.2-.4-6 0-9 2z" />
      <path {...o} fill={CREAM} d="m12.5 29.4 6 6-1.4 1.4a3.4 3.4 0 1 1-4.6 4.8 3.4 3.4 0 1 1-4.8-4.6 3.4 3.4 0 1 1 4.8-4.6z" />
    </>
  ),
  pizza: (
    <>
      <path {...o} fill={YELLOW} d="M24 43 7 12a30 30 0 0 1 34 0z" />
      <path {...o} fill={BROWN} d="M7 12a30 30 0 0 1 34 0l-2.6 4.6a25 25 0 0 0-28.8 0z" />
      <circle cx="19" cy="21" r="3" fill={RED} {...o} />
      <circle cx="28" cy="22" r="3" fill={RED} {...o} />
      <circle cx="24" cy="30" r="2.6" fill={RED} {...o} />
      <path fill={LEAF} d="M21 26l2-2 1.4 2.2zM28.5 28l1.6-1.8 1 2z" />
    </>
  ),
  stew: (
    <>
      <path {...o} fill="#4A4F57" d="M7 20h34v10a10 10 0 0 1-10 10H17A10 10 0 0 1 7 30z" />
      <path {...o} fill="#5E646D" d="M4 21h4M40 21h4" />
      <ellipse cx="24" cy="20" rx="17" ry="4" fill={RED} {...o} />
      <circle cx="18" cy="19.5" r="2.2" fill={WHITE} />
      <path fill={LEAF} d="M24 18.5l3-1.5.6 2.5z" />
      <circle cx="30" cy="20" r="1.8" fill={YELLOW} />
      <path fill="none" stroke={WHITE} strokeWidth={2} strokeLinecap="round" d="M16 13c-1.4-1.6 1.4-3 0-5M24 12c-1.4-1.6 1.4-3.2 0-5.4M32 13c-1.4-1.6 1.4-3 0-5" />
    </>
  ),
  "late-night": (
    <>
      <path {...o} fill={GOLD} d="M36 30a14 14 0 1 1-15.6-20A11.5 11.5 0 0 0 36 30z" />
      <path fill={WHITE} d="m35 7 1.2 2.8L39 11l-2.8 1.2L35 15l-1.2-2.8L31 11l2.8-1.2zM40 19l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" />
      <path {...o} fill={ORANGE} d="M30 30c4 0 7 3 7 6.5S34.5 42 31 42c-1.2 0-2-.3-2.8-1l-2.4 2.4-2.6-2.6 2.4-2.4c-.6-.8-.9-1.6-.9-2.8 0-3.4 2.6-5.6 5.3-5.6z" />
    </>
  ),
  "cafe-dessert": (
    <>
      <path {...o} fill={PINK} d="M10 24h28l-3.4 17H13.4z" />
      <path fill="none" stroke="#E07C96" strokeWidth={1.4} d="M17 24l-1 17M24 24v17M31 24l1 17" />
      <path {...o} fill={WHITE} d="M10 24a5.5 5.5 0 0 1 3.6-9.4A8 8 0 0 1 24 9a8 8 0 0 1 10.4 5.6A5.5 5.5 0 0 1 38 24z" />
      <circle cx="24" cy="8" r="3" fill={RED} {...o} />
      <path fill="none" stroke={LEAF} strokeWidth={1.6} strokeLinecap="round" d="M24 5c1-1.6 2.6-2 3.6-1.6" />
    </>
  ),
  /* ── 픽업 ── */
  "p-coffee": (
    <>
      <path {...o} fill={WHITE} d="M12 15h24l-2.6 27H14.6z" />
      <path {...o} fill={BROWN} d="M13.2 26h21.6l-1.2 9H14.4z" />
      <circle cx="24" cy="30.5" r="3" fill={WHITE} {...o} />
      <path {...o} fill={GRAY} d="M10 10h28v5H10z" />
      <path {...o} fill={STEEL} d="M16 6h16l2 4H14z" />
    </>
  ),
  "p-bakery": (
    <>
      <path {...o} fill={ORANGE} d="M5 30c0-8.4 8.6-15 19-15s19 6.6 19 15c0 4-3 7-7 7H12c-4 0-7-3-7-7z" />
      <path fill="none" stroke={DARK} strokeWidth={1.6} strokeLinecap="round" d="M15 17l3 9M24 15.5V26M33 17l-3 9" />
      <path fill={YELLOW} d="M9 27c3-5 7-7.5 11-8-2.6 2-4.4 4.6-5 8z" />
    </>
  ),
  "p-meal": (
    <>
      <path {...o} fill={BOWL} d="M7 24h34a17 14 0 0 1-34 0z" />
      <path {...o} fill={WHITE} d="M11 24c0-5.6 5.8-10 13-10s13 4.4 13 10z" />
      <path fill="none" stroke="#E9E2D2" strokeWidth={1.4} strokeLinecap="round" d="M17 19l1.6.6M23 17l1.6.6M29 19.5l1.6.6M20 22l1.6.6M27 22l1.6.6" />
      <path {...o} fill="#F2E5C9" d="M16 37.5h16l-1.5 4h-13z" />
    </>
  ),
  /* ── 장보기·쇼핑 ── */
  "k-mart": (
    <>
      <path {...o} fill={ORANGE} d="M6 18h36l-3.6 22H9.6z" />
      <path fill="none" stroke={DARK} strokeWidth={1.4} d="M12 25h24M11 32h26" />
      <path {...o} fill="none" stroke={OUT} strokeWidth={2.2} d="M15 18l6-10M33 18l-6-10" />
      <circle cx="17" cy="14" r="4" fill={LEAF} {...o} />
      <path {...o} fill={RED} d="M27 15a4 4 0 0 1 8 0c0 3-4 5-4 5s-4-2-4-5z" />
      <rect x="19" y="21" width="10" height="6" rx="1" fill={WHITE} {...o} />
      <path fill={RED} d="M22 22.5h1.4v3H22zM24.6 22.5h1.4v3h-1.4z" />
    </>
  ),
  "local-mart": (
    <>
      <path {...o} fill="none" stroke={OUT} strokeWidth={2.4} d="M4 8h5l4.5 22h22l3.5-16H11" />
      <path {...o} fill={YELLOW} d="M12 14h27.5l-3 13H14.5z" />
      <circle cx="20" cy="20" r="3" fill={RED} {...o} />
      <path {...o} fill={LEAF} d="M26 22c0-3 2-5 4.5-5S35 19 35 22z" />
      <circle cx="17" cy="37" r="3" fill={WHITE} {...o} />
      <circle cx="32" cy="37" r="3" fill={WHITE} {...o} />
    </>
  ),
  meat: (
    <>
      <path {...o} fill={RED} d="M31 7c6 2 9.6 8 7.6 15-2.4 8.4-11.2 15.2-20 13.6C12 34.4 8.2 28.8 9.4 22.8 11 14.8 18.2 12.2 22.6 9.6 25.6 7.8 27.8 6 31 7z" />
      <path fill="none" stroke={PINK} strokeWidth={1.8} strokeLinecap="round" d="M14 24c4-1 7-4 9-8M17 30c5-1 10-6 12-12" />
      <circle cx="29" cy="20" r="4" fill={CREAM} {...o} />
      <path {...o} fill={WHITE} d="M8 38l7-7 3 3-7 7a2 2 0 1 1-3-3z" />
    </>
  ),
  seafood: (
    <>
      <path {...o} fill={BLUE} d="M5 24c6-9 16-12 24-7l8-7v28l-8-7C21 36 11 33 5 24z" />
      <path {...o} fill="#9DD0F5" d="M10 24c4-4 10-5.4 15-3.4-2 2.4-2 4.4 0 6.8-5 2-11 .6-15-3.4z" />
      <circle cx="13" cy="22" r="1.8" fill={OUT} />
      <path fill="none" stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" d="M20 18.5c1.4 3.4 1.4 7.6 0 11" />
    </>
  ),
  "side-dish": (
    <>
      <path {...o} fill={BOWL} d="M3 21h17a8.5 6 0 0 1-17 0z" />
      <path {...o} fill={BOWL} d="M28 21h17a8.5 6 0 0 1-17 0z" />
      <path {...o} fill={BOWL} d="M15 32h18a9 6.5 0 0 1-18 0z" />
      <path fill={RED} d="M5 21c1.6-3 5-4.4 8-3 2 .8 3.6 1.6 5 3z" />
      <path fill={LEAF} d="M30 21c1.4-3 4.6-4.2 7.4-3.2 2.2.8 4 1.8 5.6 3.2z" />
      <path fill={YELLOW} d="M17 32c1.8-3 5-4.2 8-3.4 3 .8 5 2 6.6 3.4z" />
    </>
  ),
  fruit: (
    <>
      <path {...o} fill={RED} d="M24 15c-5-3.6-15-2.4-15 9 0 8.4 6 17 10.8 17 2 0 2.6-1 4.2-1s2.2 1 4.2 1C33 41 39 32.4 39 24c0-11.4-10-12.6-15-9z" />
      <path fill="#FF8478" d="M14 22c.6-3 2.6-4.6 5-4.8-1.6 1.4-2.4 3-2.6 5z" />
      <path {...o} fill="none" stroke={DARK} strokeWidth={2} d="M24 15c0-4 1.6-7 5-9" />
      <path {...o} fill={LEAF} d="M24.6 11c3.2-3.6 7.6-3.6 9.4-2.6-.8 3.6-5.2 5.4-9.4 2.6z" />
    </>
  ),
  tools: (
    <>
      <path {...o} fill={STEEL} d="M30 12a8 8 0 0 0-10.6 10.6L8 34a3.8 3.8 0 0 0 5.4 5.4l11.4-11.4A8 8 0 0 0 35.4 17.4l-4.8 4.8-4.2-1.2-1.2-4.2z" />
      <path {...o} fill={YELLOW} d="M7.5 34.5 12 39l-1.6 1.6a3.2 3.2 0 0 1-4.6-4.6z" />
      <path {...o} fill={RED} d="M34 30l6 6-3.6 3.6-6-6z" />
      <path {...o} fill={GRAY} d="M27 23l7 7-2 2-7-7z" />
    </>
  ),
  pet: (
    <>
      <ellipse cx="24" cy="31" rx="9" ry="7.6" fill={WHITE} {...o} />
      <ellipse cx="12" cy="20" rx="3.6" ry="4.2" fill={WHITE} {...o} />
      <ellipse cx="19" cy="12.6" rx="3.6" ry="4.2" fill={WHITE} {...o} />
      <ellipse cx="29" cy="12.6" rx="3.6" ry="4.2" fill={WHITE} {...o} />
      <ellipse cx="36" cy="20" rx="3.6" ry="4.2" fill={WHITE} {...o} />
      <ellipse cx="24" cy="32" rx="5" ry="4" fill={PINK} />
    </>
  ),
  "pet-care": (
    <>
      <path {...o} fill={PINK} d="M24 41S9 32 9 21.6A8 8 0 0 1 24 17a8 8 0 0 1 15 4.6C39 32 24 41 24 41z" />
      <path fill={WHITE} d="M22 22h4v4h4v4h-4v4h-4v-4h-4v-4h4z" />
      <circle cx="38" cy="10" r="3" fill={WHITE} {...o} />
      <circle cx="33" cy="6.5" r="2" fill={WHITE} {...o} />
      <circle cx="42.5" cy="6.5" r="2" fill={WHITE} {...o} />
    </>
  ),
  beauty: (
    <>
      <rect x="11" y="24" width="10" height="17" rx="1.6" fill={GOLD} {...o} />
      <path {...o} fill={RED} d="M12.5 24V14l7-5v15z" />
      <rect x="27" y="17" width="11" height="24" rx="3" fill={PINK} {...o} />
      <rect x="29" y="11" width="7" height="6" rx="1" fill={WHITE} {...o} />
      <path fill={WHITE} d="M30 22h5v2h-5z" />
    </>
  ),
  academy: (
    <>
      <path {...o} fill="#2F3540" d="M4 18 24 9l20 9-20 9z" />
      <path {...o} fill="#4A5260" d="M12 22v9c3 3 7.4 4.4 12 4.4S33 34 36 31v-9l-12 5.4z" />
      <path {...o} fill="none" stroke={GOLD} strokeWidth={2} d="M44 18v11" />
      <circle cx="44" cy="31" r="2.2" fill={GOLD} {...o} />
      <rect x="9" y="37" width="14" height="6" rx="1" fill={BLUE} {...o} />
      <rect x="25" y="37" width="14" height="6" rx="1" fill={ORANGE} {...o} />
    </>
  ),
  cleaning: (
    <>
      <path {...o} fill={BLUE} d="M14 20h14l2 22H12z" />
      <path {...o} fill={WHITE} d="M17 20v-6h7l5-3v7l-5-1h-3v3z" />
      <path fill={WHITE} d="M15 28h12v6H15z" opacity={0.8} />
      <circle cx="36" cy="12" r="2.2" fill="#BFE3FF" />
      <circle cx="40" cy="18" r="1.6" fill="#BFE3FF" />
      <circle cx="36" cy="22" r="1.3" fill="#BFE3FF" />
    </>
  ),
  laundry: (
    <>
      <rect x="9" y="6" width="30" height="36" rx="4" fill={WHITE} {...o} />
      <path fill={GRAY} d="M9.7 14h28.6v1H9.7z" />
      <circle cx="15" cy="10.4" r="1.6" fill={RED} />
      <circle cx="20" cy="10.4" r="1.6" fill={LEAF} />
      <circle cx="24" cy="27" r="9" fill={STEEL} {...o} />
      <circle cx="24" cy="27" r="6.6" fill={BLUE} />
      <path fill="none" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" d="M19.5 28c1.6-1.6 3-1.6 4.5 0s3 1.6 4.5 0" />
    </>
  ),
  repair: (
    <>
      <path {...o} fill={WHITE} d="M8 22 24 9l16 13v19H8z" />
      <path {...o} fill={RED} d="M5 23 24 7l19 16-2.6 2.6L24 12 7.6 25.6z" />
      <rect x="19" y="29" width="10" height="12" fill={BROWN} {...o} />
      <path {...o} fill={STEEL} d="m33 25 8 8-2.6 2.6-8-8z" />
      <path {...o} fill={YELLOW} d="m29 21 5 5-2.4 2.4-5-5z" />
    </>
  ),
  /* ── 선물하기 ── */
  "gift-mall": (
    <>
      <rect x="7" y="17" width="34" height="8" rx="1.6" fill={RED} {...o} />
      <path {...o} fill={RED} d="M10 25h28v16H10z" />
      <path fill={GOLD} d="M21.5 17h5v24h-5z" />
      <path {...o} fill={GOLD} d="M24 17c-5 0-10-1.4-10-5.2 0-2.6 2-4.2 4.4-3.8 3.2.6 5.6 4.8 5.6 9zM24 17c5 0 10-1.4 10-5.2 0-2.6-2-4.2-4.4-3.8-3.2.6-5.6 4.8-5.6 9z" />
    </>
  ),
  "gift-dibay": (
    <>
      <rect x="4" y="12" width="40" height="24" rx="4" fill={GOLD} {...o} />
      <path fill="#0B421A" d="M4.7 17h38.6v4H4.7z" />
      <path fill="#0B421A" d="M12 25h4.4a4.6 4.6 0 0 1 0 9.2H12zm2.6 2.6v4h1.8a2 2 0 0 0 0-4z" />
      <path fill={WHITE} d="M26 27h12v2H26zM26 31h8v2h-8z" />
    </>
  ),
  "gift-store": (
    <>
      <path {...o} fill={WHITE} d="M8 22h32v19H8z" />
      <path {...o} fill={RED} d="M6 22 9 10h30l3 12z" />
      <path fill={WHITE} d="M13 10h4l-1.4 12h-4zM22 10h4v12h-4zM31 10h4l1.4 12h-4z" opacity={0.9} />
      <rect x="20" y="30" width="8" height="11" fill={BROWN} {...o} />
      <rect x="12" y="27" width="6" height="6" fill={BLUE} {...o} />
      <rect x="30" y="27" width="6" height="6" fill={BLUE} {...o} />
    </>
  ),
  "gift-owned": (
    <>
      <path {...o} fill={ORANGE} d="M7 17 24 9l17 8v17l-17 8-17-8z" />
      <path {...o} fill="#D9822A" d="M7 17l17 8 17-8v17l-17 8-17-8z" />
      <path {...o} fill="none" stroke={OUT} d="M24 25v17" />
      <path fill={GOLD} d="m15.5 13 17 8 .1 4-3.4-1.6-.1-1.6-17-8z" />
      <circle cx="36" cy="34" r="7" fill={LEAF} {...o} />
      <path fill="none" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" d="m32.6 34 2.4 2.4 4-4.4" />
    </>
  ),
  "gift-received": (
    <>
      <rect x="8" y="22" width="32" height="19" rx="2" fill={PINK} {...o} />
      <path fill={WHITE} d="M21.5 22h5v19h-5zM8.7 29.5h30.6v4H8.7z" />
      <path {...o} fill={GOLD} d="M24 4v12" stroke={GOLD} strokeWidth={4} />
      <path {...o} fill={GOLD} d="m16 12 8 9 8-9z" />
    </>
  ),
  "gift-sent": (
    <>
      <path {...o} fill={WHITE} d="M43 6 5 21l14 5.6z" />
      <path {...o} fill={GRAY} d="M43 6 19 26.6 21 42l6-9z" />
      <path {...o} fill={BLUE} d="M43 6 27 33l9 4.4z" />
    </>
  ),
  /* ── 혜택모아보기 ── */
  coupons: (
    <>
      <path {...o} fill={YELLOW} d="M5 14h38v7a3.6 3.6 0 0 0 0 6v7H5v-7a3.6 3.6 0 0 0 0-6z" />
      <path fill="none" stroke={OUT} strokeWidth={1.4} strokeDasharray="2 2.4" d="M31 15v18" />
      <path fill="none" stroke={RED} strokeWidth={2.4} strokeLinecap="round" d="m12 29 10-10" />
      <circle cx="13" cy="19.5" r="2.4" fill={RED} />
      <circle cx="21" cy="28.5" r="2.4" fill={RED} />
      <path fill={WHITE} d="M34 20h5v2h-5zM34 26h5v2h-5z" />
    </>
  ),
  points: (
    <>
      <circle cx="24" cy="25" r="16" fill="#D9A32F" {...o} />
      <circle cx="24" cy="23" r="16" fill={GOLD} {...o} />
      <circle cx="24" cy="23" r="12" fill="none" stroke="#E8B54A" strokeWidth={1.6} />
      <path fill={DARK} d="M19.6 15.5h6a5 5 0 0 1 0 10h-2.6v5.5h-3.4zm3.4 3v4h2.6a2 2 0 0 0 0-4z" />
    </>
  ),
  events: (
    <>
      <path {...o} fill={YELLOW} d="M6 42 15 18l15 15z" />
      <path fill={RED} d="M10.6 30 13 23.5l7 7-6.6 2.4zM8 37l1.4-3.6 4 4-3.6 1.4z" />
      <path fill="none" stroke={BLUE} strokeWidth={2.2} strokeLinecap="round" d="M26 8c1.6 2.4 1.2 5-1 7" />
      <path fill="none" stroke={PINK} strokeWidth={2.2} strokeLinecap="round" d="M34 13c2.8-.8 5.2.4 6 3" />
      <path fill="none" stroke={LEAF} strokeWidth={2.2} strokeLinecap="round" d="M31 21c3-1.2 6-.6 8 1.6" />
      <circle cx="33" cy="6" r="2" fill={WHITE} />
      <circle cx="41" cy="27" r="2" fill={GOLD} />
      <circle cx="22" cy="5" r="1.4" fill={WHITE} />
    </>
  ),
  "member-benefits": (
    <>
      <path {...o} fill={GOLD} d="M6 16 15 24l9-14 9 14 9-8-3.6 22H9.6z" />
      <circle cx="6" cy="15" r="2.6" fill={GOLD} {...o} />
      <circle cx="24" cy="9" r="2.6" fill={GOLD} {...o} />
      <circle cx="42" cy="15" r="2.6" fill={GOLD} {...o} />
      <circle cx="17" cy="31" r="2.2" fill={RED} />
      <circle cx="24" cy="31" r="2.2" fill={BLUE} />
      <circle cx="31" cy="31" r="2.2" fill={LEAF} />
      <rect x="9" y="38" width="30" height="4" rx="1" fill="#D9A32F" {...o} />
    </>
  ),
  /* ── 더보기 ── */
  __more: (
    <>
      <rect x="7" y="7" width="15" height="15" rx="4" fill={YELLOW} {...o} />
      <rect x="26" y="7" width="15" height="15" rx="4" fill={RED} {...o} />
      <rect x="7" y="26" width="15" height="15" rx="4" fill={BLUE} {...o} />
      <rect x="26" y="26" width="15" height="15" rx="4" fill={WHITE} {...o} />
      <path fill="none" stroke={OUT} strokeWidth={2.2} strokeLinecap="round" d="M33.5 29.5v8M29.5 33.5h8" />
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
export function DeliveryMenuGlyph({ slug, className = "h-[78%] w-[78%]" }: { slug: string; className?: string }) {
  const key = ALIASES[slug] ?? slug;
  const glyph = GLYPHS[key];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden data-delivery-menu-glyph={key}>
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
