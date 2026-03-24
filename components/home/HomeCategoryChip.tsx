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
  appearance?: "pill" | "inline-text";
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
              decodedPath.startsWith(`${decodedHref}/`))
          );
        })();
  const isActive = isActiveProp ?? activeFromPath;

  const pillCls = `${APP_TOP_MENU_ROW1_BASE} ${isActive ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE}`;
  const textCls = `${APP_MARKET_MENU_TEXT_BASE} ${isActive ? APP_MARKET_MENU_TEXT_ACTIVE : APP_MARKET_MENU_TEXT_INACTIVE}`;

  return (
    <Link href={href} className={appearance === "inline-text" ? textCls : pillCls}>
      {category.name}
    </Link>
  );
}
