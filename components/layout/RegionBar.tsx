"use client";

import Link from "next/link";
import { useRegion } from "@/contexts/RegionContext";
import {
  STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME,
  StoreCommerceCartStrokeIcon,
} from "@/components/stores/StoreCommerceCartStrokeIcon";
import { useCommerceCartHeaderLink } from "@/components/layout/use-commerce-cart-header-link";
import { playAlarmSound } from "@/lib/alarm/playAlarmSound";
import { TradePrimaryAppBarShell } from "@/components/layout/TradePrimaryAppBarShell";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

/** @param embedded true면 하단 테두리 없음 — 상위 스택에서 한 덩어리로 묶을 때 */
export function RegionBar({ embedded }: { embedded?: boolean }) {
  const { currentRegion } = useRegion();
  const { cartHref, cartCount } = useCommerceCartHeaderLink();

  return (
    <TradePrimaryAppBarShell embedded={embedded}>
      <div className={`flex h-14 items-center justify-between ${APP_MAIN_HEADER_INNER_CLASS}`}>
        <Link
          href="/my/regions"
          className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 text-[18px] font-bold text-gray-900"
        >
          <LocationPinIcon />
          <span className="truncate">{currentRegion?.label ?? "동네 설정"}</span>
          <ChevronDownIcon />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={cartHref}
            className="relative flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label={cartCount > 0 ? "장바구니" : "매장 목록"}
          >
            <StoreCommerceCartStrokeIcon className="h-5 w-5" />
            {cartCount > 0 ? (
              <span className={`absolute right-0.5 top-0.5 ${STORE_COMMERCE_CART_COUNT_BADGE_CLASSNAME}`}>
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            ) : null}
          </Link>
          <Link
            href="/search"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="검색"
          >
            <SearchIcon />
          </Link>
          <button
            type="button"
            onClick={() => playAlarmSound()}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="알람"
          >
            <BellIcon />
          </button>
          <Link
            href="/services"
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="전체 서비스"
          >
            <HamburgerIcon />
          </Link>
        </div>
      </div>
    </TradePrimaryAppBarShell>
  );
}

function LocationPinIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
