"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
import { StorePublicNoticesList } from "@/components/stores/StorePublicNoticesList";
import {
  compactStoreHoursRangeForDisplay,
  parseStoreDeliveryMeta,
  readWeekdaysLineFromJson,
} from "@/lib/stores/store-detail-meta";
import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";
import { useOwnerManagementHref } from "@/lib/stores/use-owner-management-href";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import {
  formatStoreDetailAddressLine,
  resolveStoreRegionCityLabels,
} from "@/lib/stores/store-location-label";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";

const STORE_GALLERY_DISPLAY_MAX = 16;

type StoreInfoRow = {
  id: string;
  store_name: string;
  slug: string;
  business_type: string | null;
  description: string | null;
  phone: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  address_line1: string | null;
  address_line2: string | null;
  lat: number | null;
  lng: number | null;
  business_hours_json: unknown;
  profile_image_url: string | null;
  gallery_images_json: unknown;
  is_open: boolean | null;
  delivery_available?: boolean | null;
  pickup_available?: boolean | null;
  rating_avg?: number | null;
  review_count?: number | null;
  created_at?: string;
  updated_at?: string;
};

function SectionDivider() {
  return <div className="h-2.5 bg-stone-100" aria-hidden />;
}

function strFromRecord(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function formatTs(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ko-KR");
}

export function StoreDetailInfoPublic({ slug }: { slug: string }) {
  const [store, setStore] = useState<StoreInfoRow | null>(null);
  const [recentOrderCount, setRecentOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && json.store) {
        setStore(json.store as StoreInfoRow);
        setRecentOrderCount(Number(json.meta?.recent_order_count) || 0);
      } else {
        if (!silent) {
          setStore(null);
          setRecentOrderCount(0);
        }
      }
    } catch {
      if (!silent) {
        setStore(null);
        setRecentOrderCount(0);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const weekdaysFallback = useMemo(
    () => readWeekdaysLineFromJson(store?.business_hours_json),
    [store?.business_hours_json]
  );
  const deliveryMeta = useMemo(
    () => parseStoreDeliveryMeta(store?.business_hours_json, weekdaysFallback),
    [store?.business_hours_json, weekdaysFallback]
  );
  const commerceExtras = useMemo(
    () => parseCommerceExtrasFromHoursJson(store?.business_hours_json),
    [store?.business_hours_json]
  );

  const bhRecord = useMemo(
    () => coerceBusinessHoursRecord(store?.business_hours_json),
    [store?.business_hours_json]
  );

  const satHours = strFromRecord(bhRecord, [
    "sat_hours",
    "saturday_hours",
    "sat",
    "토",
    "토요일",
  ]);
  const sunHours = strFromRecord(bhRecord, [
    "sun_hours",
    "sunday_hours",
    "sun",
    "일",
    "일요일",
  ]);
  const holidayLine =
    strFromRecord(bhRecord, ["holidays", "holiday", "closed_days", "휴무"]) ?? "—";

  const deliveryAvailable = store?.delivery_available === true;
  const pickupAvailable = store?.pickup_available !== false;

  const { regionLabel, neighborhoodLabel } = useMemo(
    () =>
      store
        ? resolveStoreRegionCityLabels(store)
        : { regionLabel: null as string | null, neighborhoodLabel: null as string | null },
    [store]
  );

  const detailAddressLine = useMemo(
    () => (store ? formatStoreDetailAddressLine(store) : ""),
    [store]
  );

  const clipboardAddress = useMemo(() => {
    const parts = [regionLabel, neighborhoodLabel, detailAddressLine]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return parts.join(" · ");
  }, [regionLabel, neighborhoodLabel, detailAddressLine]);

  const copyAddress = () => {
    if (!clipboardAddress) return;
    void navigator.clipboard.writeText(clipboardAddress);
  };

  const mapsHref = useMemo(() => {
    if (!store?.lat || !store?.lng) return null;
    const la = Number(store.lat);
    const ln = Number(store.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}`;
  }, [store?.lat, store?.lng]);

  const mapEmbedSrc = useMemo(() => {
    if (!store?.lat || !store?.lng) return null;
    const la = Number(store.lat);
    const ln = Number(store.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    return `https://maps.google.com/maps?q=${la},${ln}&z=16&output=embed&hl=ko`;
  }, [store?.lat, store?.lng]);

  const flyers = useMemo(
    () =>
      store ? parseMediaUrlsJson(store.gallery_images_json, STORE_GALLERY_DISPLAY_MAX) : [],
    [store]
  );

  const ownerManagementHref = useOwnerManagementHref(store);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
          <h2 className="text-center text-[16px] font-bold text-stone-900">가게 정보</h2>
        </div>
        <p className="py-16 text-center text-sm text-gray-500">불러오는 중…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-white">
        <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
          <h2 className="text-center text-[16px] font-bold text-stone-900">가게 정보</h2>
        </div>
        <div className="px-4 py-12 text-center text-sm text-gray-600">
          매장을 찾을 수 없습니다.
          <Link href="/stores" className="mt-4 block text-signature">
            매장 목록
          </Link>
        </div>
      </div>
    );
  }

  const telHref =
    store.phone != null
      ? telHrefFromLoosePhPhone(store.phone) ?? `tel:${String(store.phone).replace(/\s/g, "")}`
      : null;

  return (
    <div className="min-h-screen bg-white pb-10">
      <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
        <h2 className="text-center text-[16px] font-bold text-stone-900">가게 정보</h2>
      </div>

      {ownerManagementHref ? (
        <p className="border-b border-stone-100 px-4 py-2.5 text-center">
          <Link
            href={ownerManagementHref}
            className="text-[13px] font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            내 상점 관리
          </Link>
        </p>
      ) : null}

      {mapEmbedSrc ? (
        <div className="w-full overflow-hidden bg-stone-100">
          <iframe
            title={`${store.store_name} 위치`}
            src={mapEmbedSrc}
            className="h-[200px] w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      ) : null}

      <section className="px-4 pb-1 pt-4">
        <h2 className="text-[22px] font-bold leading-tight text-stone-900">{store.store_name}</h2>
        {store.business_type ? (
          <p className="mt-1 text-[13px] text-stone-500">{store.business_type}</p>
        ) : null}

        <dl className="mt-2 border-t border-stone-200">
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">영업시간</dt>
            <dd className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-stone-900">
              {deliveryMeta.weekdaysLine || deliveryMeta.deliveryHoursLine || "—"}
            </dd>
          </div>
          {satHours ? (
            <div className="flex gap-3 border-b border-stone-100 py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">토 영업시간</dt>
              <dd className="min-w-0 flex-1 text-[14px] font-medium text-stone-900">{satHours}</dd>
            </div>
          ) : null}
          {sunHours ? (
            <div className="flex gap-3 border-b border-stone-100 py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">일 영업시간</dt>
              <dd className="min-w-0 flex-1 text-[14px] font-medium text-stone-900">{sunHours}</dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">휴무일</dt>
            <dd className="min-w-0 flex-1 text-[14px] text-stone-900">{holidayLine}</dd>
          </div>
          {store.phone ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 py-3.5">
              <dt className="w-full text-[13px] text-stone-400 sm:w-[100px] sm:shrink-0">전화번호</dt>
              <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[15px] font-medium text-stone-900">
                  {formatPhMobileDisplay(store.phone)}
                </span>
                {telHref ? (
                  <a
                    href={telHref}
                    className="inline-flex shrink-0 rounded-full bg-orange-50 px-3 py-1.5 text-[12px] font-bold text-orange-600 active:bg-orange-100/90"
                  >
                    전화
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">위치</dt>
            <dd className="min-w-0 flex-1 space-y-2 text-[14px] leading-relaxed text-stone-900">
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 text-[13px] text-stone-400">지역</span>
                  <span className="min-w-0 font-medium">{regionLabel ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 text-[13px] text-stone-400">동네</span>
                  <span className="min-w-0 font-medium">{neighborhoodLabel ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 text-[13px] text-stone-400">세부</span>
                  <span className="min-w-0">{detailAddressLine ? detailAddressLine : "—"}</span>
                </div>
              </div>
              {clipboardAddress ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[12px] font-semibold text-stone-800 active:bg-stone-100"
                  >
                    주소 복사
                  </button>
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[12px] font-semibold text-stone-800 active:bg-stone-100"
                    >
                      길찾기
                    </a>
                  ) : null}
                </div>
              ) : null}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">배달·픽업</dt>
            <dd className="min-w-0 flex-1 text-[14px] text-stone-900">
              {deliveryAvailable ? "배달 가능" : "배달 불가"} ·{" "}
              {pickupAvailable ? "포장·픽업 가능" : "픽업 불가"}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">배달 시간</dt>
            <dd className="min-w-0 flex-1 text-[14px] text-stone-900">
              {compactStoreHoursRangeForDisplay(deliveryMeta.deliveryHoursLine.trim() || "—")}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">결제</dt>
            <dd className="min-w-0 flex-1 text-[14px] text-stone-900">
              {deliveryMeta.paymentMethodsLine}
            </dd>
          </div>
          {commerceExtras.minOrderPhp != null && commerceExtras.minOrderPhp > 0 ? (
            <div className="flex gap-3 border-b border-stone-100 py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">최소주문</dt>
              <dd className="text-[14px] font-semibold text-stone-900">
                {formatMoneyPhp(commerceExtras.minOrderPhp)}
              </dd>
            </div>
          ) : null}
          {deliveryAvailable &&
          commerceExtras.deliveryFeePhp != null &&
          commerceExtras.deliveryFeePhp >= 0 ? (
            <div className="flex gap-3 border-b border-stone-100 py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">배달비(안내)</dt>
              <dd className="text-[14px] font-semibold text-stone-900">
                {formatMoneyPhp(commerceExtras.deliveryFeePhp)}
              </dd>
            </div>
          ) : null}
          {deliveryMeta.deliveryNotice ? (
            <div className="border-b border-stone-100 py-3.5">
              <dt className="text-[13px] text-stone-400">배달·지역 안내</dt>
              <dd className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-stone-800">
                {deliveryMeta.deliveryNotice}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 text-[13px] text-stone-400">등록·수정</dt>
            <dd className="text-[13px] text-stone-600">
              {formatTs(store.created_at)} · {formatTs(store.updated_at)}
            </dd>
          </div>
        </dl>
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="text-[16px] font-bold text-stone-900">소개글 및 혜택</h3>
        <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />
        {store.description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-stone-800">
            {store.description.trim()}
          </p>
        ) : deliveryMeta.publicNotices.length === 0 ? (
          <p className="mt-3 text-[14px] text-stone-400">등록된 소개글이 없습니다.</p>
        ) : null}
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="text-[16px] font-bold text-stone-900">매장 통계</h3>
        <dl className="mt-2 border-t border-stone-200">
          <div className="flex gap-3 border-b border-stone-100 py-3.5">
            <dt className="w-[100px] shrink-0 text-[13px] text-stone-400">주문수</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-stone-900">
              {recentOrderCount.toLocaleString("en-PH")}
              <span className="ml-1 text-[12px] font-normal text-stone-500">(최근 90일)</span>
            </dd>
          </div>
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 text-[13px] text-stone-400">리뷰수</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-stone-900">
              {(store.review_count ?? 0).toLocaleString("en-PH")}
              {store.rating_avg != null ? (
                <span className="ml-2 text-[13px] font-normal text-stone-600">
                  평균 ★ {Number(store.rating_avg).toFixed(2)}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      {flyers.length > 0 ? (
        <>
          <SectionDivider />
          <section className="px-4 py-4">
            <h3 className="text-[16px] font-bold text-stone-900">전단지·소개</h3>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {flyers.map((u, i) => (
                <li key={`${u}-${i}`}>
                  { }
                  <img
                    src={u}
                    alt=""
                    className="aspect-[3/4] w-full rounded-lg border border-stone-200 object-cover"
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
