"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

const ITEMS = [
  { href: "/mypage/trade/purchases", label: "구매 내역" },
  { href: "/mypage/trade/sales", label: "판매 내역" },
  { href: MYPAGE_TRADE_FAVORITES_HREF, label: "찜 목록" },
  { href: "/mypage/trade/reviews", label: "후기" },
  { href: "/mypage/trade/chat", label: "채팅" },
] as const;

/** 탭 라벨이 좁은 칸에서도 본문 컬럼 안에만 머물도록 (flex min-width:auto 방지) */
const tabLinkBase = "min-w-0 max-w-full break-words [overflow-wrap:anywhere]";

export function TradeHubTopTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="거래 허브 메뉴" className="mt-0 w-full min-w-0 max-w-full">
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <ul className="flex min-w-0 w-full border-b border-ig-border bg-[var(--sub-bg)]">
          {ITEMS.map((item) => {
            const active =
              item.href === "/mypage/trade/chat"
                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                : pathname === item.href;
            return (
              <li key={item.href} className="flex min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={[
                    tabLinkBase,
                    active
                      ? "relative flex min-h-[52px] w-full items-center justify-center bg-gradient-to-b from-[#FAFAFA] to-white px-0.5 py-2 text-center text-[12px] font-bold leading-tight text-[#262626] transition-colors after:pointer-events-none after:absolute after:bottom-0 after:left-[12%] after:right-[12%] after:z-[1] after:h-[2px] after:rounded-full after:bg-gradient-to-r after:from-[#feda75] after:via-[#fd5949] after:to-[#962fbf] sm:min-h-[50px] sm:px-1 sm:text-[14px] md:text-[15px]"
                      : "flex min-h-[52px] w-full items-center justify-center px-0.5 py-2 text-center text-[12px] font-semibold leading-tight text-[#8E8E8E] transition-colors hover:text-[#262626] sm:min-h-[50px] sm:px-1 sm:text-[14px] md:text-[15px]",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
