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
  formatStoreAddressDetailOnly,
  formatStoreAddressStreetDisplay,
  resolveStoreRegionCityLabels,
} from "@/lib/stores/store-location-label";
import {
  STORE_ADDRESS_DETAIL_LABEL,
  STORE_ADDRESS_STREET_LABEL,
} from "@/lib/stores/store-address-form-ui";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import { fetchStorePublicBySlugDeduped } from "@/lib/stores/store-delivery-api-client";

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
  return <div className="h-2.5 bg-sam-surface-muted" aria-hidden />;
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
    if (!silent) setLoading((prev) => (prev ? prev : true));
    try {
      const { json } = await fetchStorePublicBySlugDeduped(slug);
      const j = json as {
        ok?: boolean;
        store?: StoreInfoRow;
        meta?: { recent_order_count?: unknown };
      };
      if (j?.ok && j.store) {
        setStore(j.store);
        setRecentOrderCount(Number(j.meta?.recent_order_count) || 0);
      } else {
        if (!silent) {
          setStore((prev) => (prev === null ? prev : null));
          setRecentOrderCount(0);
        }
      }
    } catch {
      if (!silent) {
        setStore((prev) => (prev === null ? prev : null));
        setRecentOrderCount(0);
      }
    } finally {
      if (!silent) setLoading((prev) => (prev ? false : prev));
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

  const addressStreetDisplay = useMemo(
    () => (store ? formatStoreAddressStreetDisplay(store) : ""),
    [store]
  );
  const addressDetailOnly = useMemo(
    () => (store ? formatStoreAddressDetailOnly(store.address_line2) : ""),
    [store]
  );

  const clipboardAddress = useMemo(() => {
    const parts = [regionLabel, neighborhoodLabel, addressStreetDisplay, addressDetailOnly]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return parts.join(" · ");
  }, [regionLabel, neighborhoodLabel, addressStreetDisplay, addressDetailOnly]);

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
      <div className="min-h-screen bg-sam-surface">
        <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
          <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">가게 정보</h2>
        </div>
        <p className="py-16 text-center text-sm text-sam-muted">불러오는 중…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-sam-surface">
        <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
          <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">가게 정보</h2>
        </div>
        <div className="px-4 py-12 text-center text-sm text-sam-muted">
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
    <div className="min-h-screen bg-sam-surface pb-10">
      <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
        <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">가게 정보</h2>
      </div>

      {ownerManagementHref ? (
        <p className="border-b border-sam-border-soft px-4 py-2.5 text-center">
          <Link
            href={ownerManagementHref}
            className="sam-text-body-secondary font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            내 상점 관리
          </Link>
        </p>
      ) : null}

      {mapEmbedSrc ? (
        <div className="w-full overflow-hidden bg-sam-surface-muted">
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
        <h2 className="sam-text-hero font-bold leading-tight text-sam-fg">{store.store_name}</h2>
        {store.business_type ? (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{store.business_type}</p>
        ) : null}

        <dl className="mt-2 border-t border-sam-border">
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">영업시간</dt>
            <dd className="min-w-0 flex-1 sam-text-body font-medium leading-snug text-sam-fg">
              {deliveryMeta.weekdaysLine || deliveryMeta.deliveryHoursLine || "—"}
            </dd>
          </div>
          {satHours ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">토 영업시간</dt>
              <dd className="min-w-0 flex-1 sam-text-body font-medium text-sam-fg">{satHours}</dd>
            </div>
          ) : null}
          {sunHours ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">일 영업시간</dt>
              <dd className="min-w-0 flex-1 sam-text-body font-medium text-sam-fg">{sunHours}</dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">휴무일</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">{holidayLine}</dd>
          </div>
          {store.phone ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft py-3.5">
              <dt className="w-full sam-text-body-secondary text-sam-meta sm:w-[100px] sm:shrink-0">전화번호</dt>
              <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="sam-text-body font-medium text-sam-fg">
                  {(() => {
                    const d = parsePhMobileInput(store.phone ?? "");
                    return d.length === 11 ? formatPhMobileDisplay(d) : (store.phone ?? "");
                  })()}
                </span>
                {telHref ? (
                  <a
                    href={telHref}
                    className="inline-flex shrink-0 rounded-full bg-orange-50 px-3 py-1.5 sam-text-helper font-bold text-orange-600 active:bg-orange-100/90"
                  >
                    전화
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">위치</dt>
            <dd className="min-w-0 flex-1 space-y-2 sam-text-body leading-relaxed text-sam-fg">
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">지역</span>
                  <span className="min-w-0 font-medium">{regionLabel ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">동네</span>
                  <span className="min-w-0 font-medium">{neighborhoodLabel ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-[7rem] shrink-0 pt-0.5 sam-text-helper leading-snug text-sam-meta">
                    {STORE_ADDRESS_STREET_LABEL}
                  </span>
                  <span className="min-w-0">
                    {addressStreetDisplay ? addressStreetDisplay : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="w-[7rem] shrink-0 pt-0.5 sam-text-helper leading-snug text-sam-meta">
                    {STORE_ADDRESS_DETAIL_LABEL}
                  </span>
                  <span className="min-w-0">
                    {addressDetailOnly ? addressDetailOnly : "—"}
                  </span>
                </div>
              </div>
              {clipboardAddress ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-semibold text-sam-fg active:bg-sam-surface-muted"
                  >
                    주소 복사
                  </button>
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-semibold text-sam-fg active:bg-sam-surface-muted"
                    >
                      길찾기
                    </a>
                  ) : null}
                </div>
              ) : null}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달·픽업</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {deliveryAvailable ? "배달 가능" : "배달 불가"} ·{" "}
              {pickupAvailable ? "포장·픽업 가능" : "픽업 불가"}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달 시간</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {compactStoreHoursRangeForDisplay(deliveryMeta.deliveryHoursLine.trim() || "—")}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">결제</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {deliveryMeta.paymentMethodsLine}
            </dd>
          </div>
          {commerceExtras.minOrderPhp != null && commerceExtras.minOrderPhp > 0 ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">최소주문</dt>
              <dd className="sam-text-body font-semibold text-sam-fg">
                {formatMoneyPhp(commerceExtras.minOrderPhp)}
              </dd>
            </div>
          ) : null}
          {deliveryAvailable &&
          commerceExtras.deliveryFeePhp != null &&
          commerceExtras.deliveryFeePhp >= 0 ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달비(안내)</dt>
              <dd className="sam-text-body font-semibold text-sam-fg">
                {formatMoneyPhp(commerceExtras.deliveryFeePhp)}
              </dd>
            </div>
          ) : null}
          {deliveryMeta.deliveryNotice ? (
            <div className="border-b border-sam-border-soft py-3.5">
              <dt className="sam-text-body-secondary text-sam-meta">배달·지역 안내</dt>
              <dd className="mt-2 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
                {deliveryMeta.deliveryNotice}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">등록·수정</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {formatTs(store.created_at)} · {formatTs(store.updated_at)}
            </dd>
          </div>
        </dl>
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="sam-text-body-lg font-bold text-sam-fg">소개글 및 혜택</h3>
        <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />
        {store.description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
            {store.description.trim()}
          </p>
        ) : deliveryMeta.publicNotices.length === 0 ? (
          <p className="mt-3 sam-text-body text-sam-meta">등록된 소개글이 없습니다.</p>
        ) : null}
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="sam-text-body-lg font-bold text-sam-fg">매장 통계</h3>
        <dl className="mt-2 border-t border-sam-border">
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">주문수</dt>
            <dd className="sam-text-body font-semibold tabular-nums text-sam-fg">
              {recentOrderCount.toLocaleString("en-PH")}
              <span className="ml-1 sam-text-helper font-normal text-sam-muted">(최근 90일)</span>
            </dd>
          </div>
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">리뷰수</dt>
            <dd className="sam-text-body font-semibold tabular-nums text-sam-fg">
              {(store.review_count ?? 0).toLocaleString("en-PH")}
              {store.rating_avg != null ? (
                <span className="ml-2 sam-text-body-secondary font-normal text-sam-muted">
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
            <h3 className="sam-text-body-lg font-bold text-sam-fg">전단지·소개</h3>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {flyers.map((u, i) => (
                <li key={`${u}-${i}`}>
                  { }
                  <img
                    src={u}
                    alt=""
                    className="aspect-[3/4] w-full rounded-ui-rect border border-sam-border object-cover"
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
