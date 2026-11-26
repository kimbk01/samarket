"use client";

import { Gift, LayoutGrid, Phone, ShoppingBag, type LucideIcon } from "lucide-react";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";
import type { HomeServiceKey } from "@/lib/home/home-layout-contract";

/**
 * 홈 서비스 칸 아이콘 — 시안 v2 §3-4 (Owner 「v2대로 구현」 2026-11-26). 홈 서비스 칸에서만 쓴다(하단 탭·다른 화면 그대로).
 * - 휴대폰: 두 색 그림 아이콘 (초록 + 노랑) — `HomeServiceIconDuo`
 * - 태블릿: 연초록 동그라미 안 진초록 선·채움 아이콘 — `HomeServiceIconLine`
 */
export type HomeTileKey = HomeServiceKey | "rate_calc" | "all";

const G = "#0A5A2B";
const Y = "#FFC933";
const W = "#FFFFFF";

type DuoProps = { className?: string };

function Svg({ className, children }: DuoProps & { children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** 정보 공유 — 말풍선 2개 (뒤 노랑 · 앞 초록 테두리) */
function DuoPhilife(p: DuoProps) {
  return (
    <Svg {...p}>
      <path d="M7 4h11a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-7l-4 3.2V17a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill={Y} stroke={G} strokeWidth="1.6" />
      <path d="M14 12h11a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4v3.2L21 25h-7a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4z" fill={W} stroke={G} strokeWidth="2.2" />
      <path d="M15 17.5h9M15 21h6" stroke={G} strokeWidth="2" />
    </Svg>
  );
}

/** 마켓 — 노랑 쇼핑백 */
function DuoTrade(p: DuoProps) {
  return (
    <Svg {...p}>
      <path d="M6.5 11h19l-1.3 15a2.2 2.2 0 0 1-2.2 2H10a2.2 2.2 0 0 1-2.2-2z" fill={Y} stroke={G} strokeWidth="2" />
      <path d="M11.5 14v-4a4.5 4.5 0 0 1 9 0v4" stroke={G} strokeWidth="2.2" />
    </Svg>
  );
}

/** 모임 — 사람 3 (가운데 노랑) */
function DuoMoim(p: DuoProps) {
  return (
    <Svg {...p}>
      <circle cx="7.5" cy="11.5" r="3.2" fill={G} />
      <circle cx="24.5" cy="11.5" r="3.2" fill={G} />
      <path d="M2 25a5.5 5.5 0 0 1 11 0zM19 25a5.5 5.5 0 0 1 11 0z" fill={G} />
      <circle cx="16" cy="9.5" r="4.2" fill={Y} stroke={G} strokeWidth="1.6" />
      <path d="M8.8 27a7.2 7.2 0 0 1 14.4 0z" fill={Y} stroke={G} strokeWidth="1.6" />
    </Svg>
  );
}

/** DIPICK — 노랑 배달 상자 + 초록 스쿠터 */
function DuoStores(p: DuoProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="8.5" width="11" height="9" rx="1.6" fill={Y} stroke={G} strokeWidth="1.8" />
      <path d="M8 24h9.5l3.5-9h3.5l3.5 9" stroke={G} strokeWidth="2.2" />
      <path d="M21.5 9h3.5l1.5 6" stroke={G} strokeWidth="2.2" />
      <circle cx="8" cy="24" r="3.6" fill={W} stroke={G} strokeWidth="2.2" />
      <circle cx="25.5" cy="24" r="3.6" fill={W} stroke={G} strokeWidth="2.2" />
    </Svg>
  );
}

/** telRING — 초록 전화 + 노랑 신호 */
function DuoChat(p: DuoProps) {
  return (
    <Svg {...p}>
      <path
        d="M24.5 21.6v3.1a2.1 2.1 0 0 1-2.3 2.1A20.8 20.8 0 0 1 4.3 8.8 2.1 2.1 0 0 1 6.4 6.5h3.1a2.1 2.1 0 0 1 2.1 1.8c.1 1 .4 2 .7 2.9a2.1 2.1 0 0 1-.5 2.2l-1.3 1.3a16.8 16.8 0 0 0 6.3 6.3l1.3-1.3a2.1 2.1 0 0 1 2.2-.5c.9.3 1.9.6 2.9.7a2.1 2.1 0 0 1 1.8 2.1z"
        fill="#E3F1E7"
        stroke={G}
        strokeWidth="2"
      />
      <path d="M19 4a9 9 0 0 1 9 9" stroke={Y} strokeWidth="2.6" />
      <path d="M19 8.6a4.4 4.4 0 0 1 4.4 4.4" stroke={Y} strokeWidth="2.6" />
    </Svg>
  );
}

/** 이벤트 — 노랑 선물 */
function DuoEvents(p: DuoProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="14" width="22" height="13.5" rx="1.6" fill={Y} stroke={G} strokeWidth="1.8" />
      <rect x="3.5" y="9.5" width="25" height="5.5" rx="1.4" fill={Y} stroke={G} strokeWidth="1.8" />
      <path d="M16 9.5v18" stroke={G} strokeWidth="2.6" />
      <path d="M16 9.5c-1.5-3.6-6.5-4.6-6.5-1.6 0 1.4 2.4 1.6 6.5 1.6zM16 9.5c1.5-3.6 6.5-4.6 6.5-1.6 0 1.4-2.4 1.6-6.5 1.6z" stroke={G} strokeWidth="1.8" />
    </Svg>
  );
}

/** 환율 계산 — ₱ 노랑 동전 · ₩ 흰 동전 · 초록 화살표 */
function DuoRate(p: DuoProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="12" r="7.6" fill={Y} stroke={G} strokeWidth="1.6" />
      <text x="11" y="15.6" textAnchor="middle" fontSize="10" fontWeight="800" fill={G}>
        ₱
      </text>
      <circle cx="22" cy="21" r="7" fill={W} stroke={G} strokeWidth="1.8" />
      <text x="22" y="24.4" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={G}>
        ₩
      </text>
      <path d="M20.5 4.5a8 8 0 0 1 7 6M25.6 9.6l1.9 1 .5-2.1" stroke={G} strokeWidth="1.6" />
      <path d="M11.5 27.5a8 8 0 0 1-7-6M6.4 22.4l-1.9-1-.5 2.1" stroke={G} strokeWidth="1.6" />
    </Svg>
  );
}

/** 전체 — 네모 4 (오른쪽 아래 노랑) */
function DuoAll(p: DuoProps) {
  return (
    <Svg {...p}>
      <rect x="4.5" y="4.5" width="9.5" height="9.5" rx="2" stroke={G} strokeWidth="2.2" />
      <rect x="18" y="4.5" width="9.5" height="9.5" rx="2" stroke={G} strokeWidth="2.2" />
      <rect x="4.5" y="18" width="9.5" height="9.5" rx="2" stroke={G} strokeWidth="2.2" />
      <rect x="18" y="18" width="9.5" height="9.5" rx="2" fill={Y} stroke={G} strokeWidth="2.2" />
    </Svg>
  );
}

const DUO: Record<HomeTileKey, (p: DuoProps) => React.JSX.Element> = {
  philife: DuoPhilife,
  trade: DuoTrade,
  moim: DuoMoim,
  stores: DuoStores,
  chat: DuoChat,
  events: DuoEvents,
  rate_calc: DuoRate,
  all: DuoAll,
  orders: DuoAll,
  points: DuoAll,
  favorites: DuoAll,
  support: DuoAll,
};

export function HomeServiceIconDuo({ tile, className }: { tile: HomeTileKey; className?: string }) {
  const I = DUO[tile];
  return <I className={className} />;
}

/** 태블릿 ₱⇄₩ 선 아이콘 */
function LineRate({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="9" r="5.2" />
      <text x="8" y="11.6" textAnchor="middle" fontSize="7" fontWeight="800" fill="currentColor" stroke="none">
        ₱
      </text>
      <circle cx="16.5" cy="15.5" r="5" />
      <text x="16.5" y="18" textAnchor="middle" fontSize="6.6" fontWeight="800" fill="currentColor" stroke="none">
        ₩
      </text>
      <path d="M15 3.5a6 6 0 0 1 5 4.2M18.8 7.3l1.3.6.4-1.5M9 20.5a6 6 0 0 1-5-4.2M5.2 16.7l-1.3-.6-.4 1.5" />
    </svg>
  );
}

const LINE_LUCIDE: Partial<Record<HomeTileKey, LucideIcon>> = {
  trade: ShoppingBag,
  chat: Phone,
  events: Gift,
  all: LayoutGrid,
};

export function HomeServiceIconLine({ tile, className }: { tile: HomeTileKey; className?: string }) {
  if (tile === "philife") return <ServiceBrandIcon brand="FEED" className={className} />;
  if (tile === "moim") return <ServiceBrandIcon brand="CREW" className={className} />;
  if (tile === "stores") return <ServiceBrandIcon brand="DIPICK" className={className} />;
  if (tile === "rate_calc") return <LineRate className={className} />;
  const L = LINE_LUCIDE[tile] ?? LayoutGrid;
  return <L className={className} strokeWidth={1.9} aria-hidden />;
}
