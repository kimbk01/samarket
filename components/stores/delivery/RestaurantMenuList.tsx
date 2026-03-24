"use client";

import type { DeliveryMenuCategory, DeliveryMenuItem } from "@/lib/stores/delivery-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

export function RestaurantMenuList({
  categories,
  onPick,
}: {
  categories: DeliveryMenuCategory[];
  onPick: (item: DeliveryMenuItem) => void;
}) {
  return (
    <div className="mx-4 mt-4 space-y-6 pb-4">
      {categories.map((cat) => (
        <section key={cat.id}>
          <h3 className="mb-2 text-sm font-bold text-gray-900">{cat.nameKo}</h3>
          <ul className="space-y-2">
            {cat.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="flex w-full gap-3 rounded-xl border border-stone-300 bg-white p-3 text-left shadow-sm active:bg-gray-50"
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 text-2xl text-gray-400">
                    🍽️
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-semibold text-gray-900">{item.name}</span>
                      {item.isRecommended ? (
                        <span className="rounded bg-signature/10 px-1.5 py-0.5 text-[10px] font-semibold text-signature">
                          대표
                        </span>
                      ) : null}
                      {item.isPopular ? (
                        <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          인기
                        </span>
                      ) : null}
                      {item.isSoldOut ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          품절
                        </span>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.description}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-bold text-gray-900">{formatMoneyPhp(item.price)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
