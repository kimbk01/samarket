import type { ComponentType } from "react";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import type { DibayServiceBrandId } from "@/lib/brand/dibay-service-brand";
import { serviceBrandIconSlot } from "@/components/brand/ServiceBrandIcon";

export type MainBottomNavIconProps = { className?: string };

/** `/stores` 헤더 우측 운영센터 — 다이얼 6번 슬롯과 동일 */
export function StoreOpsCenterStrokeIcon({ className }: MainBottomNavIconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 9l9-6 9 6v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21V12h6v9" />
    </svg>
  );
}

export function MainBottomNavOrdersIcon({ className }: MainBottomNavIconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

export function MainBottomNavCartIcon({ className }: MainBottomNavIconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
      />
    </svg>
  );
}

export function MainBottomNavFavoritesIcon({ className }: MainBottomNavIconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
      />
    </svg>
  );
}

/**
 * 아이콘 키 → 서비스 브랜드 (Owner 최종 승인 2026-11-13 · `lib/brand/dibay-service-brand.ts`).
 * 같은 브랜드는 하단 탭·FAB·Admin 선택 창 어디서나 같은 대표 아이콘(채움)을 쓴다.
 */
export const BOTTOM_NAV_ICON_KEY_BRAND: Partial<Record<BottomNavIconKey, DibayServiceBrandId>> = {
  home: "HOME",
  community: "LOUNGE",
  trade: "MARKET",
  stores: "DIPICK",
  chat: "LETARING",
  my: "MY",
};

/** BottomNav · FAB · 배달 스위처 공통 아이콘 레지스트리 — 서비스 키 = 브랜드 채움 아이콘(`serviceBrandIconSlot`), 기능 키(주문·장바구니·찜·매장 운영) = 기존 선 아이콘 */
export const MAIN_BOTTOM_NAV_TAB_ICONS: Record<
  BottomNavIconKey,
  ComponentType<MainBottomNavIconProps>
> = {
  home: serviceBrandIconSlot("HOME"),
  trade: serviceBrandIconSlot("MARKET"),
  community: serviceBrandIconSlot("LOUNGE"),
  stores: serviceBrandIconSlot("DIPICK"),
  orders: MainBottomNavOrdersIcon,
  chat: serviceBrandIconSlot("LETARING"),
  my: serviceBrandIconSlot("MY"),
  cart: MainBottomNavCartIcon,
  favorites: MainBottomNavFavoritesIcon,
  owner_hub: StoreOpsCenterStrokeIcon,
};
