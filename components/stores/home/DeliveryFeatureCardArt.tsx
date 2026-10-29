/**
 * 배달 홈 상단 탭 「대표 카드」 배경 — 직접 그린 그림(외부 파일 없음).
 * 스타벅스 녹색 그라데이션 바탕 + 장식 원 + 탭별 컬러 일러스트(오른쪽 아래). 글씨는 카드가 위에 얹는다.
 * - pickup: 종이 쇼핑백 + 테이크아웃 커피 · gift: 리본 선물상자 · benefit: 쿠폰 + 포인트 동전 · 그 외: 반짝이 별
 * - `accent`(어드민 대표 카드 색) = 그림 뒤 원 색. 어드민이 그림을 올리면(feature_image_url) 이 그림 대신 사진.
 * Owner 2026-10-30: 「대표 카드 어색 — 배경 이미지를 생성해서 정확한 형태의 세련된 이미지」.
 */

import type { ReactNode } from "react";

const OUT = "#3B2412";
const o = { stroke: OUT, strokeWidth: 1.3, strokeLinejoin: "round", strokeLinecap: "round" } as const;

const ART: Record<string, ReactNode> = {
  pickup: (
    <>
      <path {...o} fill="#C98A4B" d="M40 40h34l3 38H37z" />
      <path {...o} fill="#B3743A" d="M74 40l9 6 2 32h-8z" />
      <path fill="none" stroke={OUT} strokeWidth={2} strokeLinecap="round" d="M48 46c0-9 4-13 9-13s9 4 9 13" />
      <rect x="48" y="55" width="18" height="9" rx="2" fill="#0B421A" />
      <path fill="#F3C969" d="M51 58h12v3H51z" />
      <path {...o} fill="#FFFFFF" d="M20 56h16l-2.2 24H22.2z" />
      <path {...o} fill="#6F4A2C" d="M21.2 66h13.6l-.9 8H22.1z" />
      <path {...o} fill="#D8DDE3" d="M18.5 51.5h19v4.5h-19z" />
      <path {...o} fill="#9AA4B1" d="M22 48h12l1.5 3.5h-15z" />
      <path fill="none" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.85} d="M25 44c-1.2-1.6 1.2-2.6 0-4.4M30 43c-1.2-1.6 1.2-2.6 0-4.4" />
    </>
  ),
  gift: (
    <>
      <rect {...o} x="28" y="48" width="48" height="11" rx="2.5" fill="#E5483B" />
      <path {...o} fill="#C93A2E" d="M32 59h40v21H32z" />
      <path fill="#F3C969" d="M48.5 48h7v32h-7zM32.6 66h38.8v6H32.6z" />
      <path {...o} fill="#F3C969" d="M52 48c-7 0-14-2-14-7.2 0-3.6 2.8-5.6 6-5 4.4.8 8 6.4 8 12.2zM52 48c7 0 14-2 14-7.2 0-3.6-2.8-5.6-6-5-4.4.8-8 6.4-8 12.2z" />
      <path fill="#FFFFFF" d="m20 50 1.6 3.6 3.6 1.6-3.6 1.6L20 60.4l-1.6-3.6-3.6-1.6 3.6-1.6zM84 34l1.1 2.5 2.5 1.1-2.5 1.1L84 41.2l-1.1-2.5-2.5-1.1 2.5-1.1z" />
      <circle cx="80" cy="56" r="2" fill="#FFF4DC" />
    </>
  ),
  benefit: (
    <>
      <g transform="rotate(-14 50 58)">
        <path {...o} fill="#F7C548" d="M22 46h50v8a4 4 0 0 0 0 8v8H22v-8a4 4 0 0 0 0-8z" />
        <path fill="none" stroke={OUT} strokeWidth={1.2} strokeDasharray="2 2.2" d="M56 47v22" />
        <path fill="none" stroke="#E5483B" strokeWidth={2.6} strokeLinecap="round" d="m31 64 12-12" />
        <circle cx="32" cy="53" r="2.6" fill="#E5483B" />
        <circle cx="42" cy="63" r="2.6" fill="#E5483B" />
      </g>
      <circle {...o} cx="76" cy="70" r="13" fill="#D9A32F" />
      <circle {...o} cx="76" cy="68" r="13" fill="#F3C969" />
      <path fill="#7A4219" d="M72.6 61.5h5a4.2 4.2 0 0 1 0 8.4h-2.2v4.6h-2.8zm2.8 2.5v3.4h2.2a1.7 1.7 0 0 0 0-3.4z" />
      <path fill="#FFFFFF" d="m86 40 1.3 2.9 2.9 1.3-2.9 1.3L86 48.4l-1.3-2.9-2.9-1.3 2.9-1.3z" />
    </>
  ),
};

const DEFAULT_ART: ReactNode = (
  <>
    <path fill="#F3C969" d="m58 40 5.6 12.6L76 58l-12.4 5.4L58 76l-5.6-12.6L40 58l12.4-5.4z" />
    <path fill="#FFFFFF" d="m80 36 1.4 3.2 3.2 1.4-3.2 1.4L80 45.2l-1.4-3.2-3.2-1.4 3.2-1.4zM34 64l1.1 2.5 2.5 1.1-2.5 1.1L34 71.2l-1.1-2.5-2.5-1.1 2.5-1.1z" />
  </>
);

/** 카드 전체를 채우는 배경 그림 (96×124 비율, `preserveAspectRatio` 로 넘치는 부분 잘림) */
export function DeliveryFeatureCardArt({ rootSlug, accent }: { rootSlug: string; accent?: string | null }) {
  const id = `fc-${rootSlug.replace(/[^a-z0-9-]/g, "")}`;
  const ring = accent && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#F3C969";
  return (
    <svg
      viewBox="0 0 96 124"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
      data-delivery-feature-art={rootSlug}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00754A" />
          <stop offset="1" stopColor="#1E3932" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.75" cy="0.78" r="0.55">
          <stop offset="0" stopColor={ring} stopOpacity="0.55" />
          <stop offset="1" stopColor={ring} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="96" height="124" fill={`url(#${id}-bg)`} />
      <circle cx="88" cy="10" r="26" fill="#FFFFFF" opacity="0.06" />
      <circle cx="-6" cy="70" r="22" fill="#FFFFFF" opacity="0.05" />
      <rect width="96" height="124" fill={`url(#${id}-glow)`} />
      <g transform="translate(0 34)">{ART[rootSlug] ?? DEFAULT_ART}</g>
    </svg>
  );
}
