"use client";

import type { ReactNode } from "react";

const DEFAULT_ICON_CLASS = "h-6 w-6 shrink-0";

interface CategoryIconProps {
  iconKey: string;
  /** SVG에 전달 (크기·색은 currentColor) */
  className?: string;
}

type IconFn = (p: { className: string }) => ReactNode;

const ICON_MAP: Record<string, IconFn> = {
  market: BoxIcon,
  general: BoxIcon,
  box: BoxIcon,
  all: BoxIcon,
  community: ChatIcon,
  basic: ChatIcon,
  gallery: GalleryIcon,
  magazine: MagazineIcon,
  service: WrenchIcon,
  job: BriefcaseIcon,
  jobs: BriefcaseIcon,
  car: CarIcon,
  "used-car": CarIcon,
  usedcar: CarIcon,
  realty: HomeIcon,
  "real-estate": HomeIcon,
  realestate: HomeIcon,
  exchange: ExchangeIcon,
  default: BoxIcon,
};

export function CategoryIcon({ iconKey, className }: CategoryIconProps) {
  const key = (iconKey?.trim() || "default").toLowerCase();
  const Icon = ICON_MAP[key] ?? ICON_MAP.default;
  const cn = className ?? DEFAULT_ICON_CLASS;
  return <Icon className={cn} />;
}

function BoxIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.27 6.96 12 12.01 20.73 6.96" />
      <path d="M12 22.08V12" />
    </svg>
  );
}

function ChatIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.3-3.96A8.5 8.5 0 0 1 3.5 9.9a8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function WrenchIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94L5.26 9.3a6 6 0 0 1 7.94-7.94l3.5 3.5" />
    </svg>
  );
}

function BriefcaseIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="7" width="18" height="14" rx="2.5" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
    </svg>
  );
}

function CarIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17h10l1-4v-2l-2-3h-8L6 11v2l1 4Z" />
      <circle cx="7.5" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="17" r="1.5" fill="currentColor" stroke="none" />
      <path d="M5 11h14" />
    </svg>
  );
}

function HomeIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

function GalleryIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.35" />
      <path d="M21 15l-4-4-3 3-2.5-2.5L3 17" />
    </svg>
  );
}

function MagazineIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 8h8M8 11.5h6M8 15h8" />
    </svg>
  );
}

/** 환전 등 환율·교환 느낌의 심플 마크 */
function ExchangeIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="3.25" />
      <circle cx="16" cy="16" r="3.25" />
      <path d="M13.5 6.5 17 3M17 3v3.5M17 3h-3.5M10.5 17.5 7 21M7 21v-3.5M7 21h3.5" />
    </svg>
  );
}
