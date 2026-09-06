"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { coerceBusinessHoursRecord } from "@/lib/stores/coerce-business-hours-json";
import { formatStoreDetailDeliveryFeeValue, parseCommerceExtrasFromHoursJson } from "@/lib/stores/store-commerce-extras";
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
import { openGoogleMapsDrivingDirectionsFromUserTo } from "@/lib/stores/google-maps-store-links";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay, parsePhMobileInput, telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import {
  fetchStoreNoticesDeduped,
  fetchStorePublicBySlugDeduped,
} from "@/lib/stores/store-delivery-api-client";
import type { StoreNoticePublicRow } from "@/lib/stores/store-banners-notices-public";
import { StoreOwnerNoticeCards } from "@/components/stores/StoreOwnerNoticeCards";

const STORE_GALLERY_DISPLAY_MAX = 16;

export type StoreInfoRow = {
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

function slugMatchesApiStore(slugParam: string, row: StoreInfoRow): boolean {
  let a = slugParam.trim();
  try {
    a = decodeURIComponent(a);
  } catch {
    /* noop */
  }
  const b = (row.slug || "").trim();
  return a === b || a.toLowerCase() === b.toLowerCase();
}

export function StoreDetailInfoPublic({
  slug,
  prefetchedStore = null,
  prefetchedRecentOrderCount,
  layoutVariant = "page",
}: {
  slug: string;
  /** 매장 메뉴 탭 등 동일 응답 재사용 — 슬러그 일치 시 초기 로딩 스킵 */
  prefetchedStore?: StoreInfoRow | null;
  prefetchedRecentOrderCount?: number;
  layoutVariant?: "page" | "embedded";
}) {
  const { t, language } = useI18n();
  const prefetchHit =
    !!prefetchedStore && slugMatchesApiStore(slug, prefetchedStore);

  const [store, setStore] = useState<StoreInfoRow | null>(() =>
    prefetchHit ? prefetchedStore : null
  );
  const [recentOrderCount, setRecentOrderCount] = useState(() =>
    prefetchHit ? Number(prefetchedRecentOrderCount) || 0 : 0
  );
  const [loading, setLoading] = useState(() => !prefetchHit);
  const [infoTabNotices, setInfoTabNotices] = useState<StoreNoticePublicRow[]>([]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
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
    },
    [slug]
  );

  useEffect(() => {
    void load({ silent: prefetchHit });
  }, [load, prefetchHit]);

  useEffect(() => {
    const s = store?.slug?.trim();
    if (!s) {
      setInfoTabNotices([]);
      return;
    }
    void (async () => {
      const { status, json } = await fetchStoreNoticesDeduped(s);
      const j = json as { ok?: boolean; notices?: StoreNoticePublicRow[] };
      if (status !== 200 || !j?.ok || !Array.isArray(j.notices)) {
        setInfoTabNotices([]);
        return;
      }
      setInfoTabNotices(j.notices.filter((n) => n.placement === "info_tab"));
    })();
  }, [store?.slug]);

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

  const bhSatFieldKeys = useMemo(
    () => ["sat_hours", "saturday_hours", "sat", "토요일", "Saturday"] as const,
    []
  );
  const bhSunFieldKeys = useMemo(
    () => ["sun_hours", "sunday_hours", "sun", "일요일", "Sunday"] as const,
    []
  );
  const bhHolidayFieldKeys = useMemo(
    () => ["holidays", "holiday", "closed_days", "휴무", "note"] as const,
    []
  );

  const satHours = strFromRecord(bhRecord, [...bhSatFieldKeys]);
  const sunHours = strFromRecord(bhRecord, [...bhSunFieldKeys]);
  const holidayLine = strFromRecord(bhRecord, [...bhHolidayFieldKeys]) ?? "—";

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
    /** 필리핀 표기: 상세(동·호) → 가로·district → 동네 → 메트로·지역 */
    const parts = [addressDetailOnly, addressStreetDisplay, neighborhoodLabel, regionLabel]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
    return parts.join(" · ");
  }, [regionLabel, neighborhoodLabel, addressStreetDisplay, addressDetailOnly]);

  const canOpenDirections = useMemo(() => {
    if (!store) return false;
    const la = typeof store.lat === "number" ? store.lat : Number(store.lat);
    const ln = typeof store.lng === "number" ? store.lng : Number(store.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) return true;
    return clipboardAddress.trim().length > 0;
  }, [store, clipboardAddress]);

  const copyAddress = () => {
    if (!clipboardAddress) return;
    void navigator.clipboard.writeText(clipboardAddress);
  };

  const openDirections = useCallback(() => {
    if (!store) return;
    const la = typeof store.lat === "number" ? store.lat : Number(store.lat);
    const ln = typeof store.lng === "number" ? store.lng : Number(store.lng);
    if (Number.isFinite(la) && Number.isFinite(ln)) {
      openGoogleMapsDrivingDirectionsFromUserTo({ kind: "coords", lat: la, lng: ln });
      return;
    }
    if (clipboardAddress.trim())
      openGoogleMapsDrivingDirectionsFromUserTo({ kind: "query", text: clipboardAddress.trim() });
  }, [store, clipboardAddress]);

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
          <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">{t("store_shop_info_title")}</h2>
        </div>
        <p className="py-16 text-center text-sm text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-sam-surface">
        <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
          <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">{t("store_shop_info_title")}</h2>
        </div>
        <div className="px-4 py-12 text-center text-sm text-sam-muted">
          {t("store_not_found_short")}
          <Link href="/stores" className="mt-4 block text-signature">
            {t("store_browse_stores")}
          </Link>
        </div>
      </div>
    );
  }

  const telHref =
    store.phone != null
      ? telHrefFromLoosePhPhone(store.phone) ?? `tel:${String(store.phone).replace(/\s/g, "")}`
      : null;

  const headerTitle =
    layoutVariant === "embedded" ? null : (
      <div className={`${STORE_DETAIL_SUBHEADER_STICKY} px-4 py-2.5`}>
        <h2 className="text-center sam-text-body-lg font-bold text-sam-fg">{t("store_shop_info_title")}</h2>
      </div>
    );

  const outerCls =
    layoutVariant === "embedded" ? "min-h-0 bg-white pb-8 pt-2" : "min-h-screen bg-sam-surface pb-10";

  const infoHrefBase = `/stores/${encodeURIComponent(store.slug)}/info`;

  return (
    <div className={outerCls}>
      {headerTitle}

      {infoTabNotices.length > 0 ? (
        <div className="px-4 pt-3">
          <StoreOwnerNoticeCards notices={infoTabNotices} infoHrefBase={infoHrefBase} />
        </div>
      ) : null}

      {ownerManagementHref ? (
        <p className="border-b border-sam-border-soft px-4 py-2.5 text-center">
          <Link
            href={ownerManagementHref}
            className="sam-text-body-secondary font-semibold text-signature underline decoration-signature/30 underline-offset-2"
          >
            {t("store_manage_my_shop")}
          </Link>
        </p>
      ) : null}

      {mapEmbedSrc ? (
        <div className="w-full overflow-hidden bg-sam-surface-muted">
          <iframe
            title={t("store_location_map_title", { store: store.store_name })}
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
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_weekday")}</dt>
            <dd className="min-w-0 flex-1 sam-text-body font-medium leading-snug text-sam-fg">
              {deliveryMeta.weekdaysLine || deliveryMeta.deliveryHoursLine || "—"}
            </dd>
          </div>
          {satHours ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_saturday")}</dt>
              <dd className="min-w-0 flex-1 sam-text-body font-medium text-sam-fg">{satHours}</dd>
            </div>
          ) : null}
          {sunHours ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_sunday")}</dt>
              <dd className="min-w-0 flex-1 sam-text-body font-medium text-sam-fg">{sunHours}</dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_closed_days")}</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">{holidayLine}</dd>
          </div>
          {store.phone ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft py-3.5">
              <dt className="w-full sam-text-body-secondary text-sam-meta sm:w-[100px] sm:shrink-0">{t("store_phone_number")}</dt>
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
                    {t("store_phone_menu_call")}
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_location")}</dt>
            <dd className="min-w-0 flex-1 space-y-2 sam-text-body leading-relaxed text-sam-fg">
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="w-[7rem] shrink-0 pt-0.5 sam-text-helper leading-snug text-sam-meta">
                    {t("store_public_address_detail_label")}
                  </span>
                  <span className="min-w-0">
                    {addressDetailOnly ? addressDetailOnly : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="w-[7rem] shrink-0 pt-0.5 sam-text-helper leading-snug text-sam-meta">
                    {t("store_public_address_street_label")}
                  </span>
                  <span className="min-w-0">
                    {addressStreetDisplay ? addressStreetDisplay : "—"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">{t("store_neighborhood")}</span>
                  <span className="min-w-0 font-medium">{neighborhoodLabel ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">{t("store_region_label")}</span>
                  <span className="min-w-0 font-medium">{regionLabel ?? "—"}</span>
                </div>
              </div>
              {clipboardAddress || canOpenDirections ? (
                <div className="flex flex-wrap gap-2">
                  {clipboardAddress ? (
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-semibold text-sam-fg active:bg-sam-surface-muted"
                    >
                      {t("store_copy_address_btn")}
                    </button>
                  ) : null}
                  {canOpenDirections ? (
                    <button
                      type="button"
                      onClick={openDirections}
                      className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-semibold text-sam-fg active:bg-sam-surface-muted"
                    >
                      {t("store_directions_btn")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_pickup")}</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {deliveryAvailable ? t("store_delivery_yes_short") : t("store_delivery_no_short")} ·{" "}
              {pickupAvailable ? t("store_pickup_yes_short") : t("store_pickup_no_short")}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_time")}</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {compactStoreHoursRangeForDisplay(deliveryMeta.deliveryHoursLine.trim() || "—")}
            </dd>
          </div>
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_label_payment")}</dt>
            <dd className="min-w-0 flex-1 sam-text-body text-sam-fg">
              {deliveryMeta.paymentMethodsLine}
            </dd>
          </div>
          {commerceExtras.minOrderPhp != null && commerceExtras.minOrderPhp > 0 ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_min_order_short")}</dt>
              <dd className="sam-text-body font-semibold text-sam-fg">
                {formatMoneyPhp(commerceExtras.minOrderPhp)}
              </dd>
            </div>
          ) : null}
          {deliveryAvailable ? (
            <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
              <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_fee_notice")}</dt>
              <dd className="sam-text-body font-semibold text-sam-fg">
                {commerceExtras.deliveryFeeMode === "self_free_promo" ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[color:var(--delivery-primary)]">{t("store_free_delivery_applied")}</span>
                    {commerceExtras.deliveryFeeStrikeReferencePhp != null &&
                    commerceExtras.deliveryFeeStrikeReferencePhp > 0 ? (
                      <span className="font-medium text-sam-meta line-through">
                        {formatMoneyPhp(commerceExtras.deliveryFeeStrikeReferencePhp)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  formatStoreDetailDeliveryFeeValue(commerceExtras, { deliveryAvailable: true }, language)
                )}
              </dd>
            </div>
          ) : null}
          {deliveryMeta.deliveryNotice ? (
            <div className="border-b border-sam-border-soft py-3.5">
              <dt className="sam-text-body-secondary text-sam-meta">{t("store_delivery_region_guide")}</dt>
              <dd className="mt-2 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
                {deliveryMeta.deliveryNotice}
              </dd>
            </div>
          ) : null}
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_registered_updated")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {formatTs(store.created_at)} · {formatTs(store.updated_at)}
            </dd>
          </div>
        </dl>
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_intro_benefits_title")}</h3>
        <StorePublicNoticesList lines={deliveryMeta.publicNotices} className="mt-3" />
        {store.description?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap sam-text-body leading-relaxed text-sam-fg">
            {store.description.trim()}
          </p>
        ) : deliveryMeta.publicNotices.length === 0 ? (
          <p className="mt-3 sam-text-body text-sam-meta">{t("store_no_intro")}</p>
        ) : null}
      </section>

      <SectionDivider />

      <section className="px-4 py-4">
        <h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_stats_title")}</h3>
        <dl className="mt-2 border-t border-sam-border">
          <div className="flex gap-3 border-b border-sam-border-soft py-3.5">
            <dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">{t("store_order_count_label")}</dt>
            <dd className="sam-text-body font-semibold tabular-nums text-sam-fg">
              {recentOrderCount.toLocaleString("en-PH")}
              <span className="ml-1 sam-text-helper font-normal text-sam-muted">{t("store_recent_90_days")}</span>
            </dd>
          </div>
          <div className="flex gap-3 py-3.5">
            <dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">{t("store_review_count_label")}</dt>
            <dd className="sam-text-body font-semibold tabular-nums text-sam-fg">
              {(store.review_count ?? 0).toLocaleString("en-PH")}
              {store.rating_avg != null ? (
                <span className="ml-2 sam-text-body-secondary font-normal text-sam-muted">
                  {t("store_avg_rating_label", { rating: Number(store.rating_avg).toFixed(2) })}
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
            <h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_flyer_intro_title")}</h3>
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
