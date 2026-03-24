"use client";

import Link from "next/link";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { formatMoneyPhp } from "@/lib/utils/format";

function statusBadge(status: BrowseStoreListItem["status"]) {
  if (status === "open") {
    return (
      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
        영업중
      </span>
    );
  }
  if (status === "preparing") {
    return (
      <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
        준비중
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      휴무
    </span>
  );
}

export function BrowseDbStoreCard({ store }: { store: BrowseStoreListItem }) {
  const flags = [
    store.deliveryAvailable ? "배달" : null,
    store.pickupAvailable ? "픽업" : null,
    store.visitAvailable ? "방문" : null,
  ].filter(Boolean);

  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;

  return (
    <li className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <Link href={storeHref} className="flex gap-3 p-3 active:bg-gray-50">
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {store.profileImageUrl ? (
             
            <img src={store.profileImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-signature/90 to-orange-500/80 text-2xl text-white">
              🏪
            </div>
          )}
          {store.isFeatured && (
            <span className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold text-amber-200">
              추천
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-gray-900">{store.nameKo}</span>
            {statusBadge(store.status)}
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {store.primaryNameKo} · {store.subNameKo}
          </p>
          {store.tagline ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{store.tagline}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-gray-500">{store.regionLabel}</p>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-400">
            <span>★ {store.rating.toFixed(1)}</span>
            <span>리뷰 {store.reviewCount}</span>
            {flags.length > 0 ? <span>{flags.join(" · ")}</span> : null}
          </div>
        </div>
      </Link>
      {store.featuredItems.length > 0 ? (
        <ul className="border-t border-gray-50 px-3 pb-2.5 pt-1.5">
          {store.featuredItems.slice(0, 2).map((it) => (
            <li key={it.productId}>
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/p/${encodeURIComponent(it.productId)}`}
                className="flex justify-between gap-2 rounded-lg py-1.5 text-[11px] text-gray-700 active:bg-gray-50"
              >
                <span className="truncate text-signature">{it.name}</span>
                <span className="shrink-0 font-medium text-gray-900">{formatMoneyPhp(it.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
