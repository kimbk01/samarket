"use client";

import Link from "next/link";
import type { MyServiceRow } from "@/lib/my/types";

const ICON_MAP: Record<string, React.ReactNode> = {
  box: <BoxIcon />,
  store: <StoreIcon />,
  megaphone: <MegaphoneIcon />,
  coin: <CoinIcon />,
  gift: <GiftIcon />,
  star: <StarIcon />,
  map: <MapIcon />,
  block: <BlockIcon />,
  default: <BoxIcon />,
};

export interface MyServiceGridProps {
  services: MyServiceRow[];
}

/** 2열 x 4행 (최대 8개) */
export function MyServiceGrid({ services }: MyServiceGridProps) {
  const items = services.slice(0, 8);
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((s) => (
        <Link
          key={s.code}
          href={s.href}
          className="flex flex-col items-center justify-center rounded-xl bg-white py-4 shadow-sm"
        >
          <span className="mb-2 flex h-10 w-10 items-center justify-center text-gray-600">
            {ICON_MAP[s.icon_key] ?? ICON_MAP.default}
          </span>
          <span className="text-[13px] font-medium text-gray-900">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}

function BoxIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function StoreIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l18-5v12L3 14v-3z" />
      <path d="M11 6l7 2" />
    </svg>
  );
}
function CoinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v12M15 9a3 3 0 1 0 0 6M9 9a3 3 0 0 1 0 6" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
function BlockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}
