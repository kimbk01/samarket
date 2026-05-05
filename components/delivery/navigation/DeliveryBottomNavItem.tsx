"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { Circle, Home, ReceiptText, ShoppingCart, Store, User } from "lucide-react";
import type { DeliveryBottomNavItem } from "@/lib/delivery/load-delivery-bottom-nav-items-server";

const ITEM_TOUCH_CLASS =
  "touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.98]";

export function DeliveryBottomNavItem({
  item,
  effectiveHref,
  isCenter,
  variant = "default",
}: {
  item: DeliveryBottomNavItem;
  effectiveHref: string;
  isCenter: boolean;
  /** `on-brand`: #1C8DB8 배경 위 밝은 아이콘·캡션 (배달 틸 바) */
  variant?: "default" | "on-brand";
}) {
  const pathname = usePathname();
  const isActive = useMemo(() => {
    const p = (pathname ?? "").split("?")[0] ?? "";
    const t = (effectiveHref ?? "").split("?")[0] ?? "";
    if (!p || !t) return false;
    if (t === "/") return p === "/";
    return p === t || p.startsWith(`${t}/`);
  }, [pathname, effectiveHref]);

  const activeColor = item.color || "#1C8DB8";

  if (isCenter) return null;

  const onBrand = variant === "on-brand";
  const inactiveFg = onBrand ? "rgba(255,255,255,0.82)" : "#666";
  const activeFg = onBrand ? "#ffffff" : activeColor;

  return (
    <Link
      href={effectiveHref}
      scroll={false}
      className={[
        "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 py-0.5",
        "rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        onBrand
          ? "focus-visible:outline-white/70"
          : "focus-visible:outline-[color:rgba(28,141,184,0.35)]",
        ITEM_TOUCH_CLASS,
        onBrand
          ? isActive
            ? "bg-white/18"
            : "active:bg-white/12"
          : isActive
            ? "bg-[rgba(28,141,184,0.10)]"
            : "active:bg-black/5",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center [@media(max-height:420px)]:h-5 [@media(max-height:420px)]:w-5"
        style={{ color: isActive ? activeFg : inactiveFg }}
        aria-hidden
      >
        <DeliveryBottomNavIcon iconKey={item.icon_key} className="h-[18px] w-[18px]" />
      </span>
      <span
        className="max-w-[4.25rem] truncate text-center text-[10px] font-medium leading-[1.1] [@media(max-height:420px)]:hidden"
        style={{ color: isActive ? activeFg : inactiveFg }}
        suppressHydrationWarning
      >
        {item.label}
      </span>
    </Link>
  );
}

export function DeliveryBottomNavIcon({ iconKey, className = "h-[18px] w-[18px]" }: { iconKey: string; className?: string }) {
  const Icon =
    iconKey === "orders"
      ? ReceiptText
      : iconKey === "cart"
        ? ShoppingCart
        : iconKey === "home"
          ? Home
          : iconKey === "store"
            ? Store
            : iconKey === "user"
              ? User
              : Circle;

  return <Icon className={className} aria-hidden strokeWidth={1.85} />;
}

