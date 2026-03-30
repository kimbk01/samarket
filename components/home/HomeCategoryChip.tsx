"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { isTradeMarketRouteActive } from "@/lib/categories/tradeMarketPath";
import {
  APP_MARKET_MENU_TEXT_ACTIVE,
  APP_MARKET_MENU_TEXT_BASE,
  APP_MARKET_MENU_TEXT_INACTIVE,
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

interface HomeCategoryChipProps {
  category: CategoryWithSettings;
  /** 지정 시 경로 비교 대신 이 값으로 활성 스타일 */
  isActive?: boolean;
  /** 마켓 리스트: 메타 텍스트 톤·무박스 */
  /** `feed-chip`: 필라이프 피드 주제 칩과 동일 (px-3 py-1.5 text-[12px]) */
  appearance?: "pill" | "inline-text" | "orders-tab" | "feed-chip";
}

export function HomeCategoryChip({
  category,
  isActive: isActiveProp,
  appearance = "pill",
}: HomeCategoryChipProps) {
  const pathname = usePathname();
  const href = getCategoryHref(category);
  const pathNoQuery = pathname.split("?")[0] ?? "";
  const safeDec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const activeFromPath =
    category.type === "trade"
      ? isTradeMarketRouteActive(pathname, category)
      : (() => {
          const decodedPath = safeDec(pathNoQuery);
          const decodedHref = safeDec(href.split("?")[0] ?? "");
          return (
            decodedPath === decodedHref ||
            (decodedHref !== "/home" &&
              decodedHref !== "/community" &&
              decodedHref !== "/philife" &&
              decodedPath.startsWith(`${decodedHref}/`))
          );
        })();
  const isActive = isActiveProp ?? activeFromPath;

  const pillCls = `${APP_TOP_MENU_ROW1_BASE} ${isActive ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`;
  const textCls = `${APP_MARKET_MENU_TEXT_BASE} ${isActive ? APP_MARKET_MENU_TEXT_ACTIVE : APP_MARKET_MENU_TEXT_INACTIVE}`;
  const ordersTabCls = [
    "flex h-[55px] shrink-0 items-center justify-center whitespace-nowrap px-1 text-center text-[14px] leading-snug transition-colors duration-200 sm:px-1.5 sm:text-[15px]",
    isActive ? "font-semibold text-gray-900" : "font-medium text-gray-500 hover:text-gray-700",
  ].join(" ");

  const feedChipCls = [
    "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
    isActive ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600",
  ].join(" ");

  return (
    <Link
      href={href}
      className={
        appearance === "inline-text"
          ? textCls
          : appearance === "orders-tab"
            ? ordersTabCls
            : appearance === "feed-chip"
              ? feedChipCls
              : pillCls
      }
    >
      {category.name}
    </Link>
  );
}
