"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  formatPhMobileDisplay,
  isCompletePhMobile,
  normalizePhMobileDb,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
import { getLocationLabel } from "@/lib/products/form-options";
import { useRestaurantDeliveryCart } from "@/contexts/RestaurantDeliveryCartContext";
import { computeLineTotal, summarizeOptions } from "@/lib/stores/delivery-mock/cart-math";
import { persistSimulatedOrder } from "@/lib/stores/delivery-mock/simulated-order-storage";
import { hasRestaurantDeliveryCatalog } from "@/lib/stores/delivery-mock/mock-restaurant-catalog";
import { allowSampleRestaurantDeliveryFlow } from "@/lib/config/deploy-surface";
import { formatMoneyPhp } from "@/lib/utils/format";
import type {
  DeliveryFulfillmentMode,
  SimulatedDeliveryOrder,
  SimulatedDeliveryOrderLine,
} from "@/lib/stores/delivery-mock/types";

function newOrderId() {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 주문번호 표시용 — 컴포넌트 본문에서 Date.now() 중복 호출(순수성 검사) 방지 */
function orderNoFromSimId(id: string): string {
  const m = /^sim_(\d+)_/.exec(id);
  const ts = m?.[1] ?? "";
  return ts.length >= 10 ? `SIM-${ts.slice(-10)}` : `SIM-${id.slice(-10)}`;
}

function simOrderCreatedAtIso(): string {
  return new Date().toISOString();
}

export function RestaurantCheckoutPageClient({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const cart = useRestaurantDeliveryCart();
  const [mode, setMode] = useState<DeliveryFulfillmentMode>("delivery");
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const addressSummary =
    regionId && cityId ? getLocationLabel(regionId, cityId) : "";
  const [phoneDigits, setPhoneDigits] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [handoff, setHandoff] = useState<"door" | "direct">("door");
  const [pickupTimeNote, setPickupTimeNote] = useState("30분 후 방문 예정");

  const empty = cart.lines.length === 0 || cart.storeSlug !== storeSlug;

  const deliveryFee = cart.deliveryFeeApplied(mode);
  const total = cart.grandTotalFor(mode);

  const canSubmit = useMemo(() => {
    if (empty || !cart.meetsMinOrder) return false;
    if (mode === "delivery") {
      if (!cart.profile?.deliveryAvailable) return false;
      return (
        regionId.length > 0 && cityId.length > 0 && isCompletePhMobile(phoneDigits)
      );
    }
    if (!cart.profile?.pickupAvailable) return false;
    return true;
  }, [empty, cart, mode, regionId, cityId, phoneDigits]);

  if (!allowSampleRestaurantDeliveryFlow()) {
    return (
      <div>
        <h1
          className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5 text-center text-base font-semibold text-gray-900`}
        >
          주문서
        </h1>
        <div className="px-4 py-8">
          <p className="text-sm text-gray-600">
            샘플 배달 주문서는 로컬·staging 전용입니다. 실매장 주문은 상품·장바구니에서 진행해 주세요.
          </p>
          <Link
            href={`/stores/${encodeURIComponent(storeSlug)}`}
            className="mt-4 inline-block text-sm font-medium text-signature underline"
          >
            매장으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  if (empty) {
    const demo = hasRestaurantDeliveryCatalog(storeSlug);
    return (
      <div>
        <h1 className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5 text-center text-base font-semibold text-gray-900`}>
          주문서
        </h1>
        <div className="px-4 py-8">
        {demo ? (
          <p className="text-sm text-gray-600">장바구니가 비어 있습니다.</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              이 주문서 화면은 샘플 배달 매장 전용입니다. 실제 등록 매장은 상품 상세에서 바로 주문하고, 내역은 마이페이지의
              &quot;매장 주문&quot;에서 확인할 수 있습니다.
            </p>
            <Link
              href="/mypage/store-orders"
              className="mt-3 inline-block text-sm font-medium text-signature underline"
            >
              매장 주문 내역
            </Link>
          </>
        )}
        <Link
          href={`/stores/${encodeURIComponent(storeSlug)}`}
          className="mt-4 block text-sm font-medium text-signature"
        >
          매장으로 돌아가기
        </Link>
        </div>
      </div>
    );
  }

  function submit() {
    if (!canSubmit || !cart.storeNameKo || !cart.profile) return;

    const lines: SimulatedDeliveryOrderLine[] = cart.lines.map((l) => ({
      menuName: l.menuName,
      quantity: l.quantity,
      optionSummary: summarizeOptions(l),
      lineTotal: computeLineTotal(l),
    }));

    const id = newOrderId();
    const orderNo = orderNoFromSimId(id);

    const order: SimulatedDeliveryOrder = {
      id,
      orderNo,
      storeSlug,
      storeNameKo: cart.storeNameKo,
      mode,
      status: mode === "delivery" ? "received" : "received",
      lines,
      subtotal: cart.subtotal,
      deliveryFee,
      total,
      addressLine: mode === "delivery" ? addressSummary : undefined,
      addressDetail: mode === "delivery" ? addressDetail.trim() || undefined : undefined,
      contactPhone: normalizePhMobileDb(phoneDigits) ?? undefined,
      requestNote: requestNote.trim() || undefined,
      handoffNote:
        mode === "delivery"
          ? handoff === "door"
            ? "문 앞 배달"
            : "직접 전달"
          : undefined,
      pickupTimeNote: mode === "pickup" ? pickupTimeNote.trim() || undefined : undefined,
      createdAt: simOrderCreatedAtIso(),
      etaLabel: cart.profile.estPrepTimeLabel,
      timelineIndex: mode === "delivery" ? 2 : 2,
    };

    persistSimulatedOrder(order);
    cart.clearCart();
    router.push(`/stores/${encodeURIComponent(storeSlug)}/order/complete?orderId=${encodeURIComponent(id)}`);
  }

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-32">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="text-center text-[16px] font-semibold text-gray-900">주문서</h1>
      </header>

      <div className="space-y-4 px-4 pt-4">
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">주문 방식</h2>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!cart.profile?.deliveryAvailable}
              onClick={() => setMode("delivery")}
              className={`flex-1 rounded-xl border py-3 text-sm font-semibold ${
                mode === "delivery"
                  ? "border-signature bg-signature text-white"
                  : "border-gray-200 bg-white text-gray-800"
              } disabled:opacity-40`}
            >
              배달 주문
            </button>
            <button
              type="button"
              disabled={!cart.profile?.pickupAvailable}
              onClick={() => setMode("pickup")}
              className={`flex-1 rounded-xl border py-3 text-sm font-semibold ${
                mode === "pickup"
                  ? "border-signature bg-signature text-white"
                  : "border-gray-200 bg-white text-gray-800"
              } disabled:opacity-40`}
            >
              포장 주문
            </button>
          </div>
        </section>

        {mode === "delivery" ? (
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">배달 주소</h2>
            <LocationSelector
              embedded
              className="mt-2"
              region={regionId}
              city={cityId}
              onRegionChange={(id) => {
                setRegionId(id);
                setCityId("");
              }}
              onCityChange={setCityId}
              label="지역 · 동네"
              showRequired
            />
            <label className="mt-2 block text-xs text-gray-500">상세 주소 (동·호수·도로명 등)</label>
            <input
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="예: 101동 1202호"
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <label className="mt-2 block text-xs text-gray-500">연락처</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={formatPhMobileDisplay(phoneDigits)}
              onChange={(e) => setPhoneDigits(parsePhMobileInput(e.target.value))}
              placeholder={PH_LOCAL_09_PLACEHOLDER}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <p className="mt-3 text-xs font-semibold text-gray-700">전달 방식</p>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setHandoff("door")}
                className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                  handoff === "door" ? "border-signature bg-signature/10 text-signature" : "border-gray-200"
                }`}
              >
                문 앞 배달
              </button>
              <button
                type="button"
                onClick={() => setHandoff("direct")}
                className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                  handoff === "direct" ? "border-signature bg-signature/10 text-signature" : "border-gray-200"
                }`}
              >
                직접 전달
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900">포장 · 픽업</h2>
            <label className="mt-2 block text-xs text-gray-500">방문 예정 시간</label>
            <input
              value={pickupTimeNote}
              onChange={(e) => setPickupTimeNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </section>
        )}

        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">요청사항</h2>
          <textarea
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            rows={3}
            placeholder="수저·포크, 양념 적게 등"
            className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </section>

        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">주문 요약</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-700">
            {cart.lines.map((l) => (
              <li key={l.lineId} className="flex justify-between gap-2">
                <span className="truncate">
                  {l.menuName} ×{l.quantity}
                </span>
                <span className="shrink-0">{formatMoneyPhp(computeLineTotal(l))}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">상품 금액</span>
              <span>{formatMoneyPhp(cart.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">배달비</span>
              <span>{mode === "delivery" ? formatMoneyPhp(deliveryFee) : formatMoneyPhp(0)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-gray-900">
              <span>총 주문금액</span>
              <span>{formatMoneyPhp(total)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-1/2 z-30 w-full max-w-lg -translate-x-1/2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="pointer-events-auto w-full rounded-2xl bg-signature py-4 text-center text-sm font-bold text-white shadow-lg disabled:bg-gray-300"
        >
          주문하기 (시뮬 접수)
        </button>
      </div>
    </div>
  );
}
