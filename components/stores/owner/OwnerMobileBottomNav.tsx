"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  PackageX,
  UtensilsCrossed,
} from "lucide-react";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { BOTTOM_NAV_SHELL } from "@/lib/main-menu/bottom-nav-config";
import { OWNER_MOBILE_BOTTOM_NAV_Z_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type NavVariant = "hub" | "orders";

const HUB_ITEMS = [
  { id: "orders", label: "주문관리", icon: ClipboardList, href: (id: string) => OwnerRoutes.orders(id) },
  { id: "menu", label: "메뉴관리", icon: UtensilsCrossed, href: (id: string) => OwnerRoutes.menu(id) },
  {
    id: "soldout",
    label: "품절처리",
    icon: PackageX,
    href: (id: string) => {
      const base = OwnerRoutes.products(id);
      return `${base}${base.includes("?") ? "&" : "?"}status=sold_out`;
    },
  },
  { id: "chat", label: "채팅", icon: MessageCircle, href: (id: string) => OwnerRoutes.inquiries(id) },
  { id: "sales", label: "매출보기", icon: BarChart3, href: (id: string) => OwnerRoutes.settlements(id) },
] as const;

const ORDERS_ITEMS = [
  { id: "hub", label: "대시보드", icon: LayoutGrid, href: (id: string) => OwnerRoutes.hub(id) },
  { id: "orders", label: "주문관리", icon: ClipboardList, href: (id: string) => OwnerRoutes.orders(id) },
  { id: "menu", label: "메뉴관리", icon: UtensilsCrossed, href: (id: string) => OwnerRoutes.menu(id) },
  { id: "chat", label: "채팅", icon: MessageCircle, href: (id: string) => OwnerRoutes.inquiries(id) },
  { id: "more", label: "더보기", icon: MoreHorizontal, href: (id: string) => OwnerRoutes.settings(id) },
] as const;

function isActivePath(pathname: string, href: string, id: string): boolean {
  const pathOnly = href.split("?")[0] ?? href;
  const norm = pathname.replace(/\/+$/, "") || "/";
  if (id === "hub") return norm === "/stores/owner";
  if (id === "orders") return norm.includes("/stores/owner/orders");
  if (id === "soldout") return pathname.includes("/products") && href.includes("sold_out");
  if (id === "more") return pathname.includes("/stores/owner/settings");
  return norm === pathOnly || norm.startsWith(`${pathOnly}/`);
}

/** 하단 고정 — 라벨 숨김, 메인 앱 `app-bottom-nav-*` 활성 아이콘 형태 */
export function OwnerMobileBottomNav({
  storeId,
  variant,
  chatBadge,
}: {
  storeId: string;
  variant: NavVariant;
  chatBadge?: number;
}) {
  const pathname = usePathname() ?? "";
  const items = variant === "hub" ? HUB_ITEMS : ORDERS_ITEMS;

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 border-t border-[#E5E7EB] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]",
        OWNER_MOBILE_BOTTOM_NAV_Z_CLASS,
        BOTTOM_NAV_SHELL.outerClassName
      )}
      aria-label={variant === "hub" ? "빠른 운영 메뉴" : "매장 운영 메뉴"}
    >
      <div className={cn(BOTTOM_NAV_SHELL.innerBarClassName, BOTTOM_NAV_SHELL.heightClass, "mx-auto max-w-lg")}>
        <div className="app-bottom-nav-grid">
          {items.map((a) => {
            const href = a.href(storeId);
            const active = isActivePath(pathname, href, a.id);
            const Icon = a.icon;
            const showChatBadge = a.id === "chat" && (chatBadge ?? 0) > 0;
            return (
              <Link
                key={a.id}
                href={href}
                prefetch={false}
                data-active={active ? "true" : "false"}
                aria-label={a.label}
                className="app-bottom-nav-item group"
              >
                <div className="app-bottom-nav-icon-slot">
                  <span className="app-bottom-nav-inline-icon" key={active ? "on" : "off"}>
                    <Icon className="app-bottom-nav-icon-svg" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    {showChatBadge ? (
                      <span className="bottom-nav-hub-badge absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#FF4D4F] px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                        {(chatBadge ?? 0) > 99 ? "9+" : chatBadge}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="sr-only">{a.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
