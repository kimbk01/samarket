"use client";

import Link from "next/link";
import { useState } from "react";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { getBrowseMockMenuGroupsByStoreSlug } from "@/lib/stores/browse-mock/mock-store-menus";
import type { BrowseMenuGroup, BrowseMockStore } from "@/lib/stores/browse-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

function statusLabel(status: BrowseMockStore["status"]) {
  if (status === "open") return { text: "영업중", className: "bg-emerald-50 text-emerald-800" };
  if (status === "preparing") return { text: "준비중", className: "bg-amber-50 text-amber-800" };
  return { text: "휴무", className: "bg-gray-100 text-gray-600" };
}

function FulfillmentBadges({ store }: { store: BrowseMockStore }) {
  const items = [
    store.deliveryAvailable ? "배달 가능" : null,
    store.pickupAvailable ? "픽업 가능" : null,
    store.visitAvailable ? "매장 방문" : null,
  ].filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700">
          {t}
        </span>
      ))}
    </div>
  );
}

function MenuAccordion({ groups }: { groups: BrowseMenuGroup[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.id, true]))
  );

  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-gray-100 bg-white px-3 py-4 text-center text-xs text-gray-500">
        등록된 메뉴 그룹 샘플이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const isOpen = open[g.id] ?? false;
        return (
          <div key={g.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [g.id]: !isOpen }))}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-gray-900"
            >
              {g.nameKo}
              <span className="text-gray-400">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen ? (
              <ul className="border-t border-gray-50 px-3 py-2">
                {g.items.map((it) => (
                  <li key={it.name} className="flex justify-between gap-2 py-1.5 text-sm">
                    <span className="text-gray-800">{it.name}</span>
                    <span className="shrink-0 font-medium text-gray-900">{formatMoneyPhp(it.price)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function MockStoreDetailView({ store }: { store: BrowseMockStore }) {
  const groups = getBrowseMockMenuGroupsByStoreSlug(store.slug);
  const st = statusLabel(store.status);
  return (
    <div className="min-h-screen bg-[#F7F7F7] pb-28">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="truncate text-center text-[16px] font-semibold text-gray-900">{store.nameKo}</h1>
      </header>

      <div className={`relative h-40 w-full bg-gradient-to-br ${store.coverTint}`}>
        <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/90">
          {store.logoEmoji}
        </div>
      </div>

      <div className="-mt-8 relative mx-4 flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-signature text-3xl text-white ring-2 ring-white">
          {store.logoEmoji}
        </div>
        <div className="min-w-0 flex-1 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">{store.nameKo}</h2>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${st.className}`}>{st.text}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {store.primaryNameKo} · {store.subNameKo}
          </p>
          <p className="mt-1 text-xs text-gray-600">{store.tagline}</p>
          <p className="mt-1 text-[11px] text-gray-500">{store.regionLabel}</p>
          <div className="mt-2">
            <FulfillmentBadges store={store} />
          </div>
        </div>
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-500">소개</h3>
        <p className="mt-1 text-sm text-gray-800">
          시뮬레이션 업체입니다. 실매장 연동 시 stores.description · 주소 · 영업시간이 표시됩니다.
        </p>
        {store.phone ? (
          <p className="mt-2 text-sm text-signature">
            <a href={`tel:${store.phone}`}>{store.phone}</a>
          </p>
        ) : null}
        {store.addressLine ? <p className="mt-2 text-xs text-gray-600">{store.addressLine}</p> : null}
        {store.hoursSummary ? (
          <p className="mt-1 text-xs text-gray-600">
            <span className="font-medium text-gray-700">영업</span> {store.hoursSummary}
          </p>
        ) : null}
        <p className="mt-2 text-[11px] text-gray-400">
          ★ {store.rating.toFixed(1)} · 리뷰 {store.reviewCount} (샘플)
        </p>
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-amber-100 bg-amber-50/80 p-3">
        <p className="text-[11px] text-amber-950">
          문의·리뷰·실주문은 Supabase 매장 연동 후 동일 슬러그로 활성화됩니다. 아래는 탐색용 UI입니다.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-amber-200 bg-white py-2 text-center text-xs font-medium text-gray-800"
            disabled
          >
            문의 (준비)
          </button>
          <Link
            href="/my/business"
            className="flex-1 rounded-lg border border-gray-200 bg-white py-2 text-center text-xs font-medium text-signature"
          >
            사업자 입점
          </Link>
        </div>
      </div>

      <div className="mx-4 mt-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">대표 메뉴</h3>
        <ul className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          {store.featuredItems.map((it) => (
            <li key={it.name} className="flex justify-between gap-2 border-b border-gray-50 py-2 text-sm last:border-0">
              <span>{it.name}</span>
              <span className="font-medium">{formatMoneyPhp(it.price)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-4 mt-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">전체 메뉴 · 상품</h3>
        <MenuAccordion groups={groups} />
      </div>

      <div className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 border-t border-stone-200 bg-stone-50/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur safe-area-pb">
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            disabled
            className="flex-1 rounded-lg border border-gray-200 bg-gray-100 py-3 text-sm font-semibold text-gray-400"
          >
            장바구니 (시뮬)
          </button>
          <button
            type="button"
            disabled
            className="flex-[1.2] rounded-lg bg-signature/40 py-3 text-sm font-semibold text-white"
          >
            주문하기 (연동 예정)
          </button>
        </div>
      </div>
    </div>
  );
}
