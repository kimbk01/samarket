"use client";

import Link from "next/link";
import { useState } from "react";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { useRestaurantDeliveryCart } from "@/contexts/RestaurantDeliveryCartContext";
import type { BrowseMockStore } from "@/lib/stores/browse-mock/types";
import { getRestaurantDeliveryCatalog } from "@/lib/stores/delivery-mock/mock-restaurant-catalog";
import type { DeliveryMenuItem } from "@/lib/stores/delivery-mock/types";
import { MockStoreDetailView } from "@/components/stores/browse/MockStoreDetailView";
import { MenuCustomizeSheet } from "./MenuCustomizeSheet";
import { RestaurantCartFloatingBar } from "./RestaurantCartFloatingBar";
import { RestaurantDeliveryHeader } from "./RestaurantDeliveryHeader";
import { RestaurantMenuList } from "./RestaurantMenuList";

export function RestaurantMockDetailView({ store }: { store: BrowseMockStore }) {
  const catalog = getRestaurantDeliveryCatalog(store.slug);
  const cart = useRestaurantDeliveryCart();
  const [sheetItem, setSheetItem] = useState<DeliveryMenuItem | null>(null);

  if (!catalog) {
    return <MockStoreDetailView store={store} />;
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="truncate text-center text-[16px] font-semibold text-gray-900">{store.nameKo}</h1>
      </header>

      <div className={`relative h-36 w-full bg-gradient-to-br ${store.coverTint}`}>
        <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/90">
          {store.logoEmoji}
        </div>
      </div>

      <RestaurantDeliveryHeader store={store} profile={catalog.profile} />
      <RestaurantMenuList categories={catalog.categories} onPick={setSheetItem} />

      <div className="px-4 pb-2 text-center">
        <Link
          href="/my/business/store-orders"
          className="text-[11px] font-medium text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-violet-700"
        >
          사장님 주문관리 (샘플)
        </Link>
      </div>

      <MenuCustomizeSheet
        item={sheetItem}
        onClose={() => setSheetItem(null)}
        onAddToCart={(quantity, selections) => {
          const item = sheetItem;
          if (!item) return;
          cart.addLine({
            storeSlug: store.slug,
            storeNameKo: store.nameKo,
            storeId: catalog.storeId,
            profile: catalog.profile,
            menuItemId: item.id,
            menuName: item.name,
            basePrice: item.price,
            selections,
            quantity,
          });
        }}
      />

      <RestaurantCartFloatingBar storeSlug={store.slug} />
    </div>
  );
}
