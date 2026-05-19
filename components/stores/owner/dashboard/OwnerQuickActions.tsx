"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, MessageCircle, PackageX, UtensilsCrossed } from "lucide-react";
import { BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { OwnerRoutes } from "@/lib/business/owner-routes";

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const ACTIONS = [
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

export function OwnerQuickActions({ storeId }: { storeId: string }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      className={cn(
        "fixed inset-x-0 z-40 border-t border-[#E5E7EB] bg-white shadow-[0_-1px_0_rgba(0,0,0,0.04)]",
        BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS
      )}
      aria-label="빠른 운영 메뉴"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ACTIONS.map((a) => {
          const href = a.href(storeId);
          const pathOnly = href.split("?")[0] ?? href;
          const active =
            pathname === pathOnly ||
            pathname.startsWith(`${pathOnly}/`) ||
            (a.id === "soldout" && pathname.includes("/products") && href.includes("sold_out"));
          const Icon = a.icon;
          return (
            <Link
              key={a.id}
              href={href}
              prefetch={false}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium leading-tight",
                active ? "text-[#1C8DB8]" : "text-gray-600"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  active ? "bg-[#1C8DB8]/15" : "bg-transparent"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-[#1C8DB8]")} aria-hidden />
              </span>
              <span>{a.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
