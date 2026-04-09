"use client";

import Link from "next/link";
import type { StoreVerticalCardModel } from "@/components/stores/home/StoreVerticalDiscoveryCard";
import { StoreCardFavoriteIcon } from "@/components/stores/home/StoreCardFavoriteIcon";

/** 인스타그램 탐색 느낌 — 고정 폭 가로 타일 (4:5 썸네일) */
export function StoreHorizontalStoreTile({
  store,
  coverEmoji,
}: {
  store: StoreVerticalCardModel;
  /** 썸네일 없을 때(데모 등) */
  coverEmoji?: string;
}) {
  const storeHref = `/stores/${encodeURIComponent(store.slug)}`;
  const distLabel =
    store.distanceKm != null && Number.isFinite(store.distanceKm) ?
      store.distanceKm < 1 ?
        `${Math.round(store.distanceKm * 1000)}m`
      : `${store.distanceKm.toFixed(1)}km`
    : null;

  const openDot =
    store.status === "open" ?
      "bg-emerald-500"
    : store.status === "preparing" ?
      "bg-amber-400"
    : "bg-gray-300";

  return (
    <article className="w-[148px] shrink-0">
      <Link href={storeHref} className="block">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-ig-highlight ring-1 ring-black/[0.06]">
          {store.profileImageUrl ?
            <img src={store.profileImageUrl} alt="" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-neutral-200 to-neutral-300 text-2xl text-white/90">
              {coverEmoji ?
                <span aria-hidden>{coverEmoji}</span>
              : store.nameKo.slice(0, 1)}
            </div>
          }
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/[0.04]" />
          <div className="absolute right-1.5 top-1.5 pointer-events-auto">
            <StoreCardFavoriteIcon slug={store.slug} className="h-8 w-8 bg-black/25" />
          </div>
          {store.isFeatured ?
            <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
              추천
            </span>
          : null}
        </div>
        <div className="mt-2 px-0.5">
          <p className="line-clamp-2 min-h-[2.25rem] text-[13px] font-semibold leading-tight text-neutral-900">
            {store.nameKo}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${openDot}`} aria-hidden />
            <span className="font-medium text-neutral-700">★{store.rating.toFixed(1)}</span>
            {distLabel ?
              <span className="text-neutral-400">· {distLabel}</span>
            : null}
          </div>
          <p className="mt-0.5 truncate text-[10px] text-neutral-400">{store.estPrepLabel}</p>
        </div>
      </Link>
    </article>
  );
}
