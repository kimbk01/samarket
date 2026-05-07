"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useOwnerLitePreferredStoreRow } from "@/lib/stores/use-owner-lite-store";
import {
  DELIVERY_BOTTOM_NAV_OWNER_STORE_ITEM,
  isDeliveryBottomNavBuiltinOwnerStoreItem,
  type DeliveryBottomNavItem,
} from "@/lib/delivery/load-delivery-bottom-nav-items-server";
import { DeliveryBottomNavIcon, DeliveryBottomNavItem as Item } from "./DeliveryBottomNavItem";
import { useDeliveryBottomNavVisibility } from "./useDeliveryBottomNavVisibility";

const BRAND_TEAL = "#1C8DB8";

function resolveEffectiveHref(item: DeliveryBottomNavItem, ownerStore: { id: string; slug: string } | null): string {
  /**
   * 배달(스토어) 전용 하단 탭의 "내정보"는 배달 전용 섹션으로 진입.
   * - default payload: { icon_key: "user", href: "/mypage", label: "내정보" }
   * - DB 커스텀에서도 icon_key/href/label 조합으로 최대한 안전하게 매칭한다.
   */
  const href = String(item.href ?? "").trim();
  const label = String(item.label ?? "").trim();
  if (
    item.icon_key === "user" ||
    href === "/mypage" ||
    href.startsWith("/mypage?") ||
    label === "내정보"
  ) {
    return "/mypage/section/store";
  }

  if (!item.requires_store_id) return item.href;
  if (ownerStore?.id) {
    return "/stores/owner";
  }
  return "/stores/owner/apply";
}

export function DeliveryBottomNav({ initialItems }: { initialItems: DeliveryBottomNavItem[] }) {
  const ownerStoreRow = useOwnerLitePreferredStoreRow();
  const ownerStore = ownerStoreRow ? { id: ownerStoreRow.id, slug: ownerStoreRow.slug } : null;
  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    setPortalToBody(true);
  }, []);

  const ordered = useMemo(() => {
    const active = (initialItems ?? []).filter((i) => i && i.is_active);
    /** DB에 예전 「내매장」 행이 있어도 일반 탭으로 노출되지 않게 제거 — 실제 탭은 아래에서만 합성 */
    const payloadSansOwnerTab = active.filter((i) => !isDeliveryBottomNavBuiltinOwnerStoreItem(i));
    const withoutLegacyRequiresStore = payloadSansOwnerTab.filter((i) => !i.requires_store_id || ownerStore != null);
    const hasRequiresStoreRow = withoutLegacyRequiresStore.some((i) => i.requires_store_id);
    const merged =
      ownerStore && !hasRequiresStoreRow
        ? [...withoutLegacyRequiresStore, { ...DELIVERY_BOTTOM_NAV_OWNER_STORE_ITEM }]
        : withoutLegacyRequiresStore;
    return [...merged].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [initialItems, ownerStore]);

  const centerItem = useMemo(() => ordered.find((i) => i.is_center) ?? null, [ordered]);
  const centerIdx = useMemo(() => ordered.findIndex((i) => i.is_center), [ordered]);

  const leftItems = useMemo(() => {
    if (centerIdx < 0) return [] as DeliveryBottomNavItem[];
    return ordered.slice(0, centerIdx).filter((i) => !i.is_center);
  }, [ordered, centerIdx]);

  const rightItems = useMemo(() => {
    if (centerIdx < 0) return [] as DeliveryBottomNavItem[];
    return ordered.slice(centerIdx + 1).filter((i) => !i.is_center);
  }, [ordered, centerIdx]);

  const sideItemsFlat = useMemo(() => ordered.filter((i) => !i.is_center), [ordered]);

  const { hidden, transitionClass } = useDeliveryBottomNavVisibility();
  const centerHref = centerItem?.href || "/philife";
  const hasCenterSlot = centerIdx >= 0 && centerItem != null;

  const nav = (
    <nav
      aria-label="배달 전용 메뉴"
      className={[
        "fixed bottom-0 left-0 right-0 z-20 pointer-events-none",
        "w-full min-w-0 max-w-none overflow-x-clip",
        "pb-[env(safe-area-inset-bottom,0px)]",
        transitionClass,
        hidden ? "translate-y-full" : "translate-y-0",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "pointer-events-auto relative w-full min-w-0 max-w-none",
          "h-[48px] min-h-[48px] [@media(max-height:420px)]:h-[44px] [@media(max-height:420px)]:min-h-[44px]",
          "shadow-[0_-4px_16px_rgba(0,0,0,0.12)]",
          "rounded-none",
          "border-x-0 border-t border-white/20 border-b-0",
        ].join(" ")}
        style={{ backgroundColor: BRAND_TEAL }}
      >
        {hasCenterSlot ? (
          <div className="flex h-full w-full min-w-0 items-stretch">
            <div className="flex min-w-0 flex-1 items-stretch justify-evenly">
              {leftItems.map((it) => (
                <Item
                  key={it.id}
                  item={it}
                  effectiveHref={resolveEffectiveHref(it, ownerStore)}
                  isCenter={false}
                  variant="on-brand"
                />
              ))}
            </div>

            <div className="relative flex w-[48px] shrink-0 items-center justify-center [@media(max-height:420px)]:w-11">
              <Link
                href={centerHref}
                scroll={false}
                className={[
                  "relative -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white",
                  "text-[color:#1C8DB8]",
                  "shadow-[0_4px_14px_rgba(0,0,0,0.22)] ring-[3px] ring-white/95",
                  "transition-transform duration-150 ease-out active:scale-[0.96]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80",
                  "[-webkit-tap-highlight-color:transparent] touch-manipulation select-none",
                  "[@media(max-height:420px)]:-top-1.5 [@media(max-height:420px)]:h-8 [@media(max-height:420px)]:w-8",
                ].join(" ")}
                aria-label={centerItem?.label ?? "홈"}
              >
                <span className="flex h-[22px] w-[22px] items-center justify-center [@media(max-height:420px)]:h-5 [@media(max-height:420px)]:w-5">
                  <DeliveryBottomNavIcon iconKey={centerItem?.icon_key || "home"} className="h-[19px] w-[19px] [@media(max-height:420px)]:h-[17px] [@media(max-height:420px)]:w-[17px]" />
                </span>
              </Link>
            </div>

            <div className="flex min-w-0 flex-1 items-stretch justify-evenly">
              {rightItems.map((it) => (
                <Item
                  key={it.id}
                  item={it}
                  effectiveHref={resolveEffectiveHref(it, ownerStore)}
                  isCenter={false}
                  variant="on-brand"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full items-stretch justify-around px-1">
            {sideItemsFlat.map((it) => (
              <Item
                key={it.id}
                item={it}
                effectiveHref={resolveEffectiveHref(it, ownerStore)}
                isCenter={false}
                variant="on-brand"
              />
            ))}
          </div>
        )}
      </div>
    </nav>
  );

  if (portalToBody && typeof document !== "undefined") {
    return createPortal(nav, document.body);
  }
  return <>{nav}</>;
}
