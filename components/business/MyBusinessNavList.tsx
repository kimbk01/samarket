"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type {
  MyBusinessNavGroup,
  MyBusinessNavIcon,
  MyBusinessNavItem,
} from "@/lib/business/my-business-nav";

type Props = {
  groups: MyBusinessNavGroup[];
  className?: string;
  /** 링크 이동 직전(예: 오버레이·드로어 닫기) */
  onNavigate?: () => void;
};

const NAV_ICONS: Record<MyBusinessNavIcon, ReactNode> = {
  identity: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  ),
  building: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
  ops_status: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  external: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  ),
  orders: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  ),
  inquiry: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  ),
  settlement: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m4-4h.01M15 16h.01"
      />
    </svg>
  ),
  product: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  ),
  category: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
  ),
  menu_board: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h7"
      />
    </svg>
  ),
  staff: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  ),
  review: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
      />
    </svg>
  ),
  promo: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13a3 3 0 001.17-5.764m.5-3.228a3 3 0 00-5.614-.614"
      />
    </svg>
  ),
  settings: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

export function MyBusinessNavList({ groups, className = "", onNavigate }: Props) {
  return (
    <section
      className={`grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3 ${className}`.trim()}
      aria-label="매장 관리 메뉴"
    >
      {groups.map((group, gi) => (
        <div
          key={group.title}
          className="h-full rounded-ui-rect border border-ig-border bg-white p-2 shadow-[0_6px_24px_rgba(15,23,42,0.05)]"
        >
          <h2 className={`px-3 text-[13px] font-medium text-gray-500 ${gi === 0 ? "pt-2" : "pt-2"}`}>
            {group.title}
          </h2>
          <ul className="mt-2 space-y-1">
            {group.items.map((item, i) => (
              <li key={`${group.title}-${item.label}`}>
                <NavRow item={item} isMuted={item.disabled} onNavigate={onNavigate} />
                {i < group.items.length - 1 ? <hr className="mx-3 border-gray-100" /> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function NavRow({
  item,
  isMuted,
  onNavigate,
}: {
  item: MyBusinessNavItem;
  isMuted?: boolean;
  onNavigate?: () => void;
}) {
  const iconTone = isMuted ? "text-gray-400" : "text-gray-700";
  const icon = (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5F6F8] ${iconTone}`} aria-hidden>
      {NAV_ICONS[item.icon]}
    </span>
  );

  const textBlock = (
    <span className="min-w-0 flex-1">
      <span className={`block text-[14px] font-medium ${isMuted ? "text-gray-400" : "text-gray-900"}`}>
        {item.label}
      </span>
      {item.hint ? (
        <span className="mt-0.5 block text-[12px] leading-relaxed text-gray-500">{item.hint}</span>
      ) : null}
    </span>
  );

  const trail = (
    <span className="flex shrink-0 items-center gap-2">
      {item.badge != null && item.badge > 0 ? (
        <span className="inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[12px] font-bold text-white">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      ) : null}
      <ChevronRight muted={isMuted} />
    </span>
  );

  const rowClass =
    "flex items-center gap-3 rounded-ui-rect px-3 py-3 text-left active:bg-gray-50 " +
    (isMuted ? "" : "text-gray-800");

  if (item.disabled) {
    return (
      <div className={rowClass}>
        {icon}
        {textBlock}
        {trail}
      </div>
    );
  }

  if (item.hash) {
    return (
      <a
        href={`#${item.hash}`}
        className={rowClass}
        onClick={() => {
          onNavigate?.();
        }}
      >
        {icon}
        {textBlock}
        {trail}
      </a>
    );
  }

  if (!item.href) {
    return (
      <div className={rowClass}>
        {icon}
        {textBlock}
        {trail}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={rowClass}
      onClick={() => {
        onNavigate?.();
      }}
    >
      {icon}
      {textBlock}
      {trail}
    </Link>
  );
}

function ChevronRight({ muted }: { muted?: boolean }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${muted ? "text-gray-300" : "text-gray-400"}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
