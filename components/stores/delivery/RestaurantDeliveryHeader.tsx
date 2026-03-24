"use client";

import type { BrowseMockStore } from "@/lib/stores/browse-mock/types";
import type { RestaurantDeliveryProfile } from "@/lib/stores/delivery-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

function statusBadge(status: BrowseMockStore["status"]) {
  if (status === "open")
    return <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">영업중</span>;
  if (status === "preparing")
    return <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">준비중</span>;
  return <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">휴무</span>;
}

export function RestaurantDeliveryHeader({
  store,
  profile,
}: {
  store: BrowseMockStore;
  profile: RestaurantDeliveryProfile;
}) {
  return (
    <div className="mx-4 mt-3 space-y-2 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-900">{store.nameKo}</h2>
        {statusBadge(store.status)}
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        {profile.deliveryAvailable ? (
          <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-900">
            배달 가능
          </span>
        ) : (
          <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600">배달 불가</span>
        )}
        {profile.pickupAvailable ? (
          <span className="rounded border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-900">
            포장 가능
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[12px] text-gray-700">
        <dt className="text-gray-500">최소주문</dt>
        <dd className="text-right font-medium">{formatMoneyPhp(profile.minOrderAmount)}</dd>
        <dt className="text-gray-500">배달비</dt>
        <dd className="text-right font-medium">{formatMoneyPhp(profile.deliveryFee)}</dd>
        <dt className="text-gray-500">예상 조리</dt>
        <dd className="text-right font-medium">{profile.estPrepTimeLabel}</dd>
        <dt className="text-gray-500">지역</dt>
        <dd className="text-right">{store.regionLabel}</dd>
      </dl>
      <p className="text-[11px] leading-relaxed text-gray-500">
        배달앱형 주문 시뮬레이션입니다. 결제 없이 흐름만 확인할 수 있어요.
      </p>
    </div>
  );
}
