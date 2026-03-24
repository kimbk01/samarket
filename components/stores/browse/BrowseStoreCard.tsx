"use client";

import Link from "next/link";
import type { BrowseMockStore } from "@/lib/stores/browse-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

function statusBadge(status: BrowseMockStore["status"]) {
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

export function BrowseStoreCard({ store }: { store: BrowseMockStore }) {
  const flags = [
    store.deliveryAvailable ? "배달" : null,
    store.pickupAvailable ? "픽업" : null,
    store.visitAvailable ? "방문" : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        href={`/stores/${encodeURIComponent(store.slug)}`}
        className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm active:bg-gray-50"
      >
        <div
          className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-2xl text-white ${store.coverTint}`}
        >
          {store.logoEmoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-gray-900">{store.nameKo}</span>
            {statusBadge(store.status)}
          </div>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {store.primaryNameKo} · {store.subNameKo}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{store.tagline}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{store.regionLabel}</p>
          <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-400">
            <span>★ {store.rating.toFixed(1)}</span>
            <span>리뷰 {store.reviewCount}</span>
            {flags.length > 0 ? <span>{flags.join(" · ")}</span> : null}
          </div>
          <ul className="mt-1.5 space-y-0.5 border-t border-gray-50 pt-1.5">
            {store.featuredItems.slice(0, 2).map((it) => (
              <li key={it.name} className="flex justify-between gap-2 text-[11px] text-gray-700">
                <span className="truncate">{it.name}</span>
                <span className="shrink-0 font-medium text-gray-900">{formatMoneyPhp(it.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Link>
    </li>
  );
}
