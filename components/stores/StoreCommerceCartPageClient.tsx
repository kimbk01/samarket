"use client";

import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { flushSync } from "react-dom";
import { useStoreCommerceCart } from "@/contexts/StoreCommerceCartContext";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { buildStoreDeliveryEtaLabelWithManualRide } from "@/lib/stores/store-delivery-eta-label";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { PH_LOCAL_09_PLACEHOLDER } from "@/lib/constants/philippines-contact";
import {
  getLocationLabelIfValid,
  parseLocationLabelToIds,
} from "@/lib/products/form-options";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveCartLineListUnitPhp } from "@/lib/stores/store-product-pricing";
import {
  formatPhMobileDisplay,
  isCompletePhMobile,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import {
  fetchStorePublicBySlugDeduped,
  fetchStoreDeliveryEtaDeduped,
  fetchStoreSummaryDeduped,
  postMeStoreOrder,
} from "@/lib/stores/store-delivery-api-client";
import { StoreCartClearConfirmDialog } from "@/components/stores/cart/StoreCartClearConfirmDialog";
import { StoreCheckoutSubmitConfirmDialog } from "@/components/stores/cart/StoreCheckoutSubmitConfirmDialog";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  clearLastCheckoutOrderId,
  getLastCheckoutOrderId,
  setLastCheckoutOrderId,
} from "@/lib/store-commerce/last-checkout-order-session";
import {
  clearDeliveryAddressBookStorage,
  loadDeliveryAddressBook,
  parseUserAddressIdFromDeliverySelection,
  PROFILE_DELIVERY_SELECTION_ID,
  userAddressDeliverySelectionId,
} from "@/lib/store-commerce/delivery-address-book";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import {
  dibayPerfOnOrderApiDone,
  dibayPerfOnOrderApiStart,
  dibayPerfRecordOrderIdempotencyExistingHit,
  dibayPerfRecordOrderIdempotencyKeyCreated,
  dibayPerfRecordOrderSubmitClick,
} from "@/lib/dibay/delivery-flow-perf";
import {
  DELIVERY_PERF_TAG_CHECKOUT,
  DELIVERY_PERF_TAG_CHECKOUT_SHELL,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import { deliveryTraceCheckoutShellMs } from "@/lib/dibay/delivery-render-trace";
import { findCommerceCartBucketBySlug } from "@/lib/stores/find-commerce-cart-bucket-by-slug";
import {
  getStoreCommerceCheckoutNavigationMark,
} from "@/lib/stores/store-commerce-checkout-seed-cache";
import type { StoreCommerceCartBucket } from "@/lib/stores/store-commerce-cart-types";
import { generateStoreOrderClientKey } from "@/lib/stores/store-order-client-key";
import {
  buildStoreOrderDetailSeedFromPostSuccess,
  setStoreOrderDetailSeed,
} from "@/lib/stores/store-order-detail-seed-cache";
import { checkoutPaymentOptionsForCart } from "@/lib/stores/payment-methods-config";
import {
  STORE_ADDRESS_STREET_LABEL,
} from "@/lib/stores/store-address-form-ui";
import {
  APP_MAIN_COLUMN_MAX_WIDTH_CLASS,
  APP_TIER1_BAR_INNER_ALIGNED_CLASS,
  APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import {
  readStoreFulfillmentPref,
  writeStoreFulfillmentPref,
} from "@/lib/stores/store-fulfillment-pref";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  getUserAddressDesignationPlainText,
  UserAddressDesignationTitle,
} from "@/components/addresses/UserAddressDesignationTitle";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { formatPhDeliveryBlockForCheckout } from "@/lib/addresses/ph-address-display";
import { fetchMeAddressesListSingleFlight } from "@/lib/addresses/address-list-client-cache";

type Fulfillment = "pickup" | "local_delivery" | "shipping";

type StoreHead = {
  id: string;
  store_name: string;
  slug: string;
  profile_image_url?: string | null;
  business_hours_json: unknown;
  is_open: boolean | null;
  /** false면 포장 픽업 비노출(매장 설정) */
  pickup_available: boolean | null;
  /** false면 배달 비노출(매장 설정) */
  delivery_available: boolean | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
};

function storeHeadFromCartBucket(bucket: StoreCommerceCartBucket): StoreHead {
  return {
    id: bucket.storeId,
    store_name: bucket.storeName,
    slug: bucket.storeSlug,
    business_hours_json: null,
    is_open: true,
    pickup_available: true,
    delivery_available: true,
  };
}

type ProfileContactSnap = {
  userAddressId?: string | null;
  phone: string;
  region: string;
  city: string;
  freeSummaryLine: string;
  addressDetail: string;
};

function StoreCartStoreSummaryCard({
  store,
  frontCommerce,
  subtotalPhp,
  minOrderPhp,
  minShortage,
  meetsMin,
  onBackToStore,
  onRequestClear,
  clearBusy,
}: {
  store: StoreHead;
  frontCommerce: ReturnType<typeof resolveStoreFrontCommerceState> | null;
  subtotalPhp: number;
  minOrderPhp: number;
  minShortage: number;
  meetsMin: boolean;
  onBackToStore: () => void;
  onRequestClear: () => void;
  clearBusy: boolean;
}) {
  const { t } = useI18n();
  const openLabel = frontCommerce
    ? frontCommerce.isOpenForCommerce
      ? t("store_order_accepting")
      : frontCommerce.inBreak
        ? `Break · ${frontCommerce.breakRangeLabel}`
        : t("store_preparing_short")
    : null;
  const deliveryLabel =
    store.delivery_available === false
      ? t("store_delivery_no_short")
      : store.delivery_available === true
        ? t("store_delivery_yes_short")
        : null;

  const thumb = store.profile_image_url?.trim();

  return (
    <section className="mx-3 mt-3 rounded-[14px] border border-sam-border bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
      <p className="sam-text-xxs font-semibold text-sam-muted">{t("store_current_cart")}</p>
      <div className="mt-2 flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-sam-surface-muted to-sam-border-soft text-2xl">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>🍽️</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="sam-text-body-lg font-bold leading-snug text-sam-fg">{store.store_name}</p>
          <p className="mt-0.5 sam-text-helper text-sam-muted">{t("store_cart_summary_hint")}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {openLabel ? (
          <span className="rounded-full bg-sam-surface px-2.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
            {openLabel}
          </span>
        ) : null}
        {deliveryLabel ? (
          <span className="rounded-full bg-sam-surface px-2.5 py-0.5 sam-text-xxs font-medium text-sam-fg">
            {deliveryLabel}
          </span>
        ) : null}
      </div>
      <dl className="mt-3 space-y-1 sam-text-helper text-sam-muted">
        {minOrderPhp > 0 ? (
          <div className="flex justify-between gap-2">
            <dt>{t("store_min_order")}</dt>
            <dd className="font-semibold text-sam-fg">{formatMoneyPhp(minOrderPhp)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2">
          <dt>{t("store_current_items_total")}</dt>
          <dd className="font-semibold tabular-nums text-sam-fg">{formatMoneyPhp(subtotalPhp)}</dd>
        </div>
        {minOrderPhp > 0 && !meetsMin ? (
          <div className="flex justify-between gap-2 text-amber-800">
            <dt>{t("store_shortfall_amount")}</dt>
            <dd className="font-semibold tabular-nums">{formatMoneyPhp(minShortage)}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={clearBusy}
          onClick={onBackToStore}
          className="inline-flex h-10 flex-1 min-w-[8.5rem] items-center justify-center rounded-full border border-sam-border bg-white px-4 sam-text-helper font-semibold text-sam-fg shadow-sm active:bg-sam-app disabled:opacity-50"
        >
          {t("store_back_to_menu")}
        </button>
        <button
          type="button"
          disabled={clearBusy}
          onClick={onRequestClear}
          className="inline-flex h-10 flex-1 min-w-[8.5rem] items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 sam-text-helper font-semibold text-red-800 active:bg-red-100/80 disabled:opacity-50"
        >
          {t("store_clear_cart_btn")}
        </button>
      </div>
    </section>
  );
}

function CartTopBar({
  cartCount,
  onBack,
}: {
  cartCount: number;
  onBack: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
      <div className="w-full border-b border-sam-border-soft bg-sam-surface">
        <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
          <div className="relative flex h-12 items-center">
            <button
              type="button"
              onClick={onBack}
              aria-label={t("nav_back")}
              className="absolute left-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-sam-fg active:bg-black/[0.04]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className="mx-auto text-center sam-text-body-lg font-semibold text-sam-fg">
              {t("store_cart_page_title")}
            </h1>
            <button
              type="button"
              aria-label={t("store_add_friend_aria")}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full text-sam-fg opacity-35 grayscale pointer-events-none"
              disabled
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 8v6M23 11h-6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StoreCommerceCartPageClient({ storeSlug }: { storeSlug: string }) {
  const { t, language } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const cart = useStoreCommerceCart();
  const { patchBucketMeta } = cart;
  const [store, setStore] = useState<StoreHead | null>(null);
  const [storeLoadFailed, setStoreLoadFailed] = useState(false);
  /** 첫 매장 fetch 완료 전에는 !store 만으로 오류 처리하면 안 됨(스티키 헤더와 본문 불일치) */
  const [storeLoading, setStoreLoading] = useState(true);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [buyerNote, setBuyerNote] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  /** 동일 주문 시도 내 재전송·더블탭 멱등 키 (checkout 입력 변경 시 초기화) */
  const clientOrderKeyRef = useRef<string | null>(null);
  const orderSubmitFlightRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [deliveryEtaLabel, setDeliveryEtaLabel] = useState<string | null>(null);
  const [deliveryEtaBusy, setDeliveryEtaBusy] = useState(false);
  const [globalRideTimeSource, setGlobalRideTimeSource] = useState<"store" | "google" | null>(null);
  const deliveryEtaLastOkKeyRef = useRef<string | null>(null);
  const deliveryEtaPreviewAbortRef = useRef<AbortController | null>(null);
  const [hoursTick, setHoursTick] = useState(0);
  const [profileSnap, setProfileSnap] = useState<ProfileContactSnap | null>(null);
  const [checkoutContactReady, setCheckoutContactReady] = useState(false);
  const checkoutContactFetchGenRef = useRef(0);

  const [savedAddresses, setSavedAddresses] = useState<UserAddressDTO[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressBookHydrated, setAddressBookHydrated] = useState(false);
  const [legacyLsNoticeCount, setLegacyLsNoticeCount] = useState(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("cod");
  const [clearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [checkoutConfirmPayload, setCheckoutConfirmPayload] = useState<{
    phoneLabel: string;
    addressLabel: string;
    paymentLabel: string;
  } | null>(null);

  useEffect(() => {
    void router.prefetch("/orders");
    void router.prefetch("/my/store-orders");
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => setHoursTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const loadStore = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      try {
        const { json } = await fetchStorePublicBySlugDeduped(storeSlug);
        const j = json as { ok?: boolean; store?: Record<string, unknown> };
        if (!j?.ok || !j.store) {
          if (!silent) {
            setStoreLoadFailed(true);
            setStore(null);
          }
          return;
        }
        setStoreLoadFailed(false);
        const s = j.store as Record<string, unknown>;
        const head: StoreHead = {
          id: s.id as string,
          store_name: s.store_name as string,
          slug: (s.slug as string) ?? storeSlug,
          profile_image_url:
            typeof s.profile_image_url === "string" && s.profile_image_url.trim()
              ? s.profile_image_url.trim()
              : null,
          business_hours_json: s.business_hours_json,
          is_open: (s.is_open as boolean | null | undefined) ?? null,
          pickup_available: (s.pickup_available as boolean | null | undefined) ?? null,
          delivery_available: (s.delivery_available as boolean | null | undefined) ?? null,
          region: typeof s.region === "string" ? s.region : null,
          city: typeof s.city === "string" ? s.city : null,
          district: typeof s.district === "string" ? s.district : null,
          address_line1: typeof s.address_line1 === "string" ? s.address_line1 : null,
          address_line2: typeof s.address_line2 === "string" ? s.address_line2 : null,
        };
        setStore(head);
        patchBucketMeta(head.id, { storeSlug: head.slug, storeName: head.store_name });
      } catch {
        if (!silent) {
          setStoreLoadFailed(true);
          setStore(null);
        }
      } finally {
        if (!silent) setStoreLoading(false);
      }
    },
    [storeSlug, patchBucketMeta]
  );

  useEffect(() => {
    setStoreLoadFailed(false);
    setStoreLoading(true);
    void loadStore();
  }, [loadStore, storeSlug]);

  /** 수량 변경 등 snapshot 갱신 시 API 재호출 없이 카트 메타만 보강 */
  useEffect(() => {
    const bucket = findCommerceCartBucketBySlug(cart.snapshot, storeSlug);
    if (!bucket) return;
    setStore((prev) => {
      if (prev?.id === bucket.storeId && prev.slug === bucket.storeSlug) {
        if (prev.store_name === bucket.storeName) return prev;
        return { ...prev, store_name: bucket.storeName };
      }
      return storeHeadFromCartBucket(bucket);
    });
  }, [cart.snapshot, storeSlug]);

  useRefetchOnPageShowRestore(() => void loadStore({ silent: true }));

  const cartBucket = useMemo(
    () => findCommerceCartBucketBySlug(cart.snapshot, storeSlug),
    [cart.snapshot, storeSlug]
  );

  const lines = store ? cart.getLinesForStoreId(store.id) : [];
  const subtotalPhp = store ? cart.getSubtotalForStoreId(store.id) : 0;

  const otherBuckets = store ? cart.otherBucketsExcluding(store.id) : [];

  const checkoutShellLoggedRef = useRef(false);
  useLayoutEffect(() => {
    if (!cart.hydrated || lines.length === 0 || checkoutShellLoggedRef.current) return;
    checkoutShellLoggedRef.current = true;
    const navT0 = getStoreCommerceCheckoutNavigationMark();
    const ms =
      navT0 > 0 && typeof performance !== "undefined" ? Math.max(0, performance.now() - navT0) : 0;
    deliveryTraceCheckoutShellMs(storeSlug, ms);
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_CHECKOUT_SHELL, {
      event: "pass1_cart_lines_visible",
      slug: storeSlug,
      line_count: lines.length,
      store_from_api: !!store,
    });
  }, [cart.hydrated, lines.length, storeSlug, store]);

  const commerce = useMemo(
    () => parseCommerceExtrasFromHoursJson(store?.business_hours_json),
    [store?.business_hours_json]
  );

  const storeModeStaticEtaLabel = useMemo(() => {
    if (globalRideTimeSource !== "store") return null;
    return buildStoreDeliveryEtaLabelWithManualRide(
      commerce,
      commerce.deliveryRideDisplayManual,
      language
    );
  }, [globalRideTimeSource, commerce, language]);

  const checkoutPaymentOptions = useMemo(() => {
    if (!store) return [];
    return checkoutPaymentOptionsForCart(store.business_hours_json, language);
  }, [store, language]);

  useEffect(() => {
    if (checkoutPaymentOptions.length === 0) return;
    const ids = checkoutPaymentOptions.map((o) => o.id);
    setSelectedPaymentMethod((prev) =>
      ids.includes(prev as (typeof ids)[number]) ? prev : ids[0]!
    );
  }, [checkoutPaymentOptions]);

  /** undefined(구 장바구니)는 허용 — `every(l => l.pickupAvailable)` 만 쓰면 undefined가 전부 탈락 */
  const canPickup = lines.length > 0 && lines.every((l) => l.pickupAvailable !== false);
  const canDelivery = lines.length > 0 && lines.every((l) => l.localDeliveryAvailable !== false);
  const canShip = lines.length > 0 && lines.every((l) => l.shippingAvailable !== false);

  /**
   * 포장 픽업: 매장 설정 + 담긴 상품 플래그.
   * 배달: 매장 「배달 가능」 또는(택배 전용 상품만 있을 때) 줄 단위 shipping.
   * 화면 라벨은 「배달」 하나 — API 타입은 local_delivery 우선, 없으면 shipping.
   */
  const { offerPickup, offerDelivery, offerShip } = useMemo(() => {
    if (!store || lines.length === 0) {
      return { offerPickup: false, offerDelivery: false, offerShip: false };
    }
    const op = canPickup && store.pickup_available !== false;
    const od = store.delivery_available === true;
    const os = canShip;
    return { offerPickup: op, offerDelivery: od, offerShip: os };
  }, [store, lines.length, canPickup, canShip]);

  const deliveryFulfillmentMode = useMemo((): Fulfillment | null => {
    if (offerDelivery) return "local_delivery";
    if (offerShip) return "shipping";
    return null;
  }, [offerDelivery, offerShip]);

  const needsAddressAndPhone =
    fulfillment === "local_delivery" || fulfillment === "shipping";

  const storePickupLines = useMemo(
    () =>
      store ?
        formatStorePickupAddressLines({
          region: store.region,
          city: store.city,
          district: store.district,
          address_line1: store.address_line1,
          address_line2: store.address_line2,
        })
      : [],
    [store]
  );

  useEffect(() => {
    if (!cart.hydrated || !store) return;
    if (lines.length > 0) {
      clearLastCheckoutOrderId(store.id);
      setLastOrderId(null);
      return;
    }
    setLastOrderId((prev) => {
      const remembered = getLastCheckoutOrderId(store.id);
      return remembered ?? prev;
    });
  }, [cart.hydrated, store?.id, lines.length]);

  useEffect(() => {
    const { entries } = loadDeliveryAddressBook();
    if (entries.length > 0) {
      setLegacyLsNoticeCount(entries.length);
      clearDeliveryAddressBookStorage();
    }
    setAddressBookHydrated(true);
  }, []);

  const loadSavedAddressesForCheckout = useCallback(async () => {
    try {
      const result = await fetchMeAddressesListSingleFlight();
      if (result.ok) setSavedAddresses(result.rows);
    } catch {
      setSavedAddresses([]);
    }
  }, []);

  useEffect(() => {
    void loadSavedAddressesForCheckout();
  }, [loadSavedAddressesForCheckout]);

  const profileAddressSummary = useMemo(() => {
    if (!profileSnap) return "";
    return (
      getLocationLabelIfValid(profileSnap.region, profileSnap.city)?.trim() ||
      profileSnap.freeSummaryLine.trim()
    );
  }, [profileSnap]);

  const profileDeliveryReady = profileAddressSummary.length >= 3;

  /** 카드 본문 표시용 — 지역 ID·한 줄 주소·상세 모두 합쳐서 노출 */
  const profileAddressBodyText = useMemo(() => {
    if (!profileSnap) return "";
    const parts = [
      getLocationLabelIfValid(profileSnap.region, profileSnap.city)?.trim() ?? "",
      profileSnap.freeSummaryLine.trim(),
      profileSnap.addressDetail.trim(),
    ].filter((s) => s.length > 0);
    return parts.join("\n");
  }, [profileSnap]);

  const resolvedDelivery = useMemo(() => {
    if (selectedAddressId === PROFILE_DELIVERY_SELECTION_ID && profileSnap) {
      return {
        region: profileSnap.region,
        city: profileSnap.city,
        freeSummaryLine: profileSnap.freeSummaryLine,
        addressDetail: profileSnap.addressDetail,
      };
    }
    const savedId = parseUserAddressIdFromDeliverySelection(selectedAddressId);
    if (savedId) {
      const row = savedAddresses.find((x) => x.id === savedId);
      if (row) {
        return {
          region: row.appRegionId ?? "",
          city: row.appCityId ?? "",
          freeSummaryLine: row.roadAddress ?? row.formattedAddress ?? row.fullAddress ?? "",
          addressDetail: row.detailAddress ?? row.unitFloorRoom ?? "",
        };
      }
    }
    return null;
  }, [selectedAddressId, profileSnap, savedAddresses]);

  const region = resolvedDelivery?.region ?? "";
  const city = resolvedDelivery?.city ?? "";
  const freeSummaryLine = resolvedDelivery?.freeSummaryLine ?? "";
  const addressDetail = resolvedDelivery?.addressDetail ?? "";

  const summaryForSubmit = useMemo(
    () => getLocationLabelIfValid(region, city)?.trim() || freeSummaryLine.trim(),
    [region, city, freeSummaryLine]
  );

  const deliveryUserAddressIdForSubmit = useMemo(() => {
    if (fulfillment !== "local_delivery") return null;
    if (selectedAddressId === PROFILE_DELIVERY_SELECTION_ID) {
      return profileSnap?.userAddressId?.trim() || null;
    }
    return parseUserAddressIdFromDeliverySelection(selectedAddressId);
  }, [fulfillment, selectedAddressId, profileSnap?.userAddressId]);

  const orderSubmitFingerprint = useMemo(() => {
    if (!store || !cart.snapshot) return "";
    const bucket = Object.values(cart.snapshot.carts).find((b) => b.storeId === store.id);
    const rawLines = bucket?.lines ?? [];
    const lineParts = rawLines.map((l) => {
      const wire = l.modifierWire ?? { pick: { ...l.optionSelections }, qty: {} };
      return {
        product_id: l.productId,
        qty: l.qty,
        modifier_selections: wire,
        line_note: (l.lineNote ?? "").trim(),
      };
    });
    return JSON.stringify({
      store_id: store.id,
      lines: lineParts,
      fulfillment_type: fulfillment,
      buyer_note: buyerNote.trim(),
      buyer_phone: parsePhMobileInput(buyerPhone),
      payment_method: selectedPaymentMethod,
      delivery_address_summary: summaryForSubmit.trim(),
      delivery_address_detail: addressDetail.trim(),
      selected_address_id: selectedAddressId ?? "",
    });
  }, [
    store?.id,
    cart.snapshot,
    fulfillment,
    buyerNote,
    buyerPhone,
    selectedPaymentMethod,
    summaryForSubmit,
    addressDetail,
    selectedAddressId,
  ]);

  useEffect(() => {
    clientOrderKeyRef.current = null;
  }, [orderSubmitFingerprint]);

  useEffect(() => {
    deliveryEtaPreviewAbortRef.current?.abort();
    deliveryEtaPreviewAbortRef.current = null;
    setDeliveryEtaLabel(null);
    setDeliveryEtaBusy(false);
    deliveryEtaLastOkKeyRef.current = null;
  }, [storeSlug, fulfillment, deliveryUserAddressIdForSubmit]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/app/delivery-ride-time-source", { cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; source?: unknown };
        if (cancelled) return;
        setGlobalRideTimeSource(j.source === "google" ? "google" : "store");
      } catch {
        if (!cancelled) setGlobalRideTimeSource("store");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadDeliveryEtaPreview = useCallback(async () => {
    if (!globalRideTimeSource || globalRideTimeSource !== "google") return;
    const slug = storeSlug.trim();
    if (!slug || fulfillment !== "local_delivery") return;
    const aid = deliveryUserAddressIdForSubmit?.trim();
    if (!aid) return;
    const dedupeKey = `${slug}|${aid}`;
    if (deliveryEtaLastOkKeyRef.current === dedupeKey) return;
    deliveryEtaPreviewAbortRef.current?.abort();
    const ac = new AbortController();
    deliveryEtaPreviewAbortRef.current = ac;
    setDeliveryEtaBusy(true);
    try {
      const { status, json } = await fetchStoreDeliveryEtaDeduped(storeSlug, aid, {
        signal: ac.signal,
        trace: {
          component: "StoreCommerceCartPageClient",
          reason: "delivery_eta_preview",
          triggeredBy: "user_click",
        },
      });
      if (ac.signal.aborted) return;
      if (status !== 200) {
        setDeliveryEtaLabel(null);
        return;
      }
      const j = json as { ok?: boolean; etaLabel?: string };
      setDeliveryEtaLabel(typeof j.etaLabel === "string" ? j.etaLabel : null);
      if (j.ok === true) deliveryEtaLastOkKeyRef.current = dedupeKey;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setDeliveryEtaLabel(null);
    } finally {
      if (!ac.signal.aborted) setDeliveryEtaBusy(false);
    }
  }, [storeSlug, fulfillment, deliveryUserAddressIdForSubmit, globalRideTimeSource]);

  /** 배달: 저장 주소 + 프로필 기본 배달만. 장바구니 전용 localStorage 주소는 제거됨 */
  const deliveryAddressReady =
    fulfillment === "local_delivery"
      ? Boolean(deliveryUserAddressIdForSubmit) && summaryForSubmit.trim().length >= 3
      : summaryForSubmit.trim().length >= 3;

  /** 장바구니 카드: 공백 없이 `09000000000` 형태 */
  const formattedPhoneDisplay = useMemo(() => {
    const d = parsePhMobileInput(buyerPhone);
    if (d.length === 0) return "—";
    return d;
  }, [buyerPhone]);

  const fetchCheckoutContact = useCallback(async () => {
    const gen = ++checkoutContactFetchGenRef.current;
    try {
      const res = await runSingleFlight("me:checkout-contact:get", () =>
        fetch("/api/me/checkout-contact", { credentials: "include" })
      );
      const json = (await res.json()) as {
        ok?: boolean;
        contact_phone?: string | null;
        contact_address?: string | null;
        default_delivery?: {
          user_address_id: string;
          phone: string | null;
          app_region_id: string | null;
          app_city_id: string | null;
          summary_line: string;
          address_detail: string;
        } | null;
      };
      if (gen !== checkoutContactFetchGenRef.current) return;
      if (!json.ok) {
        setProfileSnap(null);
        return;
      }
      const dd = json.default_delivery;
      if (dd?.user_address_id) {
        const phoneDigits = parsePhMobileInput(dd.phone ?? json.contact_phone ?? "");
        const snap: ProfileContactSnap = {
          userAddressId: dd.user_address_id,
          phone: phoneDigits,
          region: dd.app_region_id ?? "",
          city: dd.app_city_id ?? "",
          freeSummaryLine: (dd.summary_line ?? "").trim(),
          addressDetail: (dd.address_detail ?? "").trim(),
        };
        if (gen !== checkoutContactFetchGenRef.current) return;
        setProfileSnap(snap);
        setBuyerPhone(snap.phone);
        return;
      }

      const phoneDigits = parsePhMobileInput(json.contact_phone ?? "");
      let nextRegion = "";
      let nextCity = "";
      let nextFree = "";
      let nextDetail = "";
      const raw = json.contact_address?.trim();
      if (raw) {
        const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? "";
        const rest = raw.split(/\r?\n/).slice(1).join("\n").trim();
        const ids = parseLocationLabelToIds(firstLine);
        if (ids) {
          nextRegion = ids.regionId;
          nextCity = ids.cityId;
          nextDetail = rest;
        } else {
          nextFree = firstLine;
          nextDetail = rest;
        }
      }
      const snap: ProfileContactSnap = {
        userAddressId: null,
        phone: phoneDigits,
        region: nextRegion,
        city: nextCity,
        freeSummaryLine: nextFree,
        addressDetail: nextDetail,
      };
      if (gen !== checkoutContactFetchGenRef.current) return;
      setProfileSnap(snap);
      setBuyerPhone(snap.phone);
    } catch {
      if (gen === checkoutContactFetchGenRef.current) setProfileSnap(null);
    } finally {
      if (gen === checkoutContactFetchGenRef.current) setCheckoutContactReady(true);
    }
  }, []);

  useEffect(() => {
    void fetchCheckoutContact();
  }, [fetchCheckoutContact]);

  useEffect(() => {
    const onAddressesUpdated = () => void fetchCheckoutContact();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [fetchCheckoutContact]);

  useEffect(() => {
    const onAddressesUpdated = () => void loadSavedAddressesForCheckout();
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [loadSavedAddressesForCheckout]);

  useEffect(() => {
    if (!addressBookHydrated) return;
    setSelectedAddressId((sel) => {
      if (sel === PROFILE_DELIVERY_SELECTION_ID && profileSnap) return sel;
      if (
        parseUserAddressIdFromDeliverySelection(sel) &&
        savedAddresses.some((x) => userAddressDeliverySelectionId(x.id) === sel)
      ) {
        return sel;
      }
      if (profileDeliveryReady && profileSnap) return PROFILE_DELIVERY_SELECTION_ID;
      const deliveryDefault =
        savedAddresses.find((x) => x.isDefaultDelivery || x.isDefaultMaster) ?? savedAddresses[0];
      if (deliveryDefault?.id) return userAddressDeliverySelectionId(deliveryDefault.id);
      if (profileSnap) return PROFILE_DELIVERY_SELECTION_ID;
      return null;
    });
  }, [addressBookHydrated, profileDeliveryReady, profileSnap, savedAddresses]);

  useEffect(() => {
    if (!store) return;
    const del = deliveryFulfillmentMode;
    setFulfillment((prev) => {
      if (prev === "pickup" && offerPickup) return prev;
      if (del && prev === del) return prev;
      if (del && offerPickup) {
        if (store.delivery_available === true) return del;
        return "pickup";
      }
      if (del) return del;
      if (offerPickup) return "pickup";
      return prev;
    });
  }, [store, offerPickup, deliveryFulfillmentMode]);

  const fulfillmentPrefAppliedRef = useRef(false);
  useEffect(() => {
    fulfillmentPrefAppliedRef.current = false;
  }, [storeSlug]);

  /** 매장 메뉴에서 고른 배달/포장 — 자동 보정 effect 뒤에 한 번 적용 */
  useEffect(() => {
    if (!cart.hydrated || !store?.slug || lines.length === 0) return;
    if (fulfillmentPrefAppliedRef.current) return;
    fulfillmentPrefAppliedRef.current = true;
    const pref = readStoreFulfillmentPref(store.slug);
    if (!pref) return;
    if (pref === "local_delivery" && deliveryFulfillmentMode) {
      setFulfillment(deliveryFulfillmentMode);
    } else if (pref === "pickup" && offerPickup) {
      setFulfillment("pickup");
    }
  }, [
    cart.hydrated,
    store?.slug,
    lines.length,
    deliveryFulfillmentMode,
    offerPickup,
  ]);

  const minOrderPhp = commerce.minOrderPhp ?? 0;
  const meetsMin = lines.length === 0 || subtotalPhp >= minOrderPhp;
  const minShortage = Math.max(0, minOrderPhp - subtotalPhp);
  const deliveryFeeForCheckout = resolveChargedDeliveryFeePhp(commerce, subtotalPhp, fulfillment);
  const paymentGrandTotalPhp = subtotalPhp + deliveryFeeForCheckout;
  const pickupGrandTotalPhp = subtotalPhp;

  const listSubtotalPhp = useMemo(
    () =>
      lines.reduce((s, l) => {
        const listU = resolveCartLineListUnitPhp(l) ?? l.unitPricePhp;
        return s + listU * l.qty;
      }, 0),
    [lines]
  );
  const discountAmountPhp = Math.max(0, listSubtotalPhp - subtotalPhp);
  const discountPercentOverall =
    listSubtotalPhp > 0 && discountAmountPhp > 0
      ? Math.round((discountAmountPhp / listSubtotalPhp) * 100)
      : 0;

  const freeDeliveryThresholdPhp = commerce.freeDeliveryOverPhp;
  /** 유료 자체배달 + 임계만: self_free_promo는 모드가 달라 여기 도달하지 않음 */
  const showFreeDeliveryProgress =
    fulfillment === "local_delivery" &&
    commerce.deliveryFeeMode === "self" &&
    freeDeliveryThresholdPhp != null &&
    freeDeliveryThresholdPhp > 0;
  const freeDeliveryProgressPct = showFreeDeliveryProgress
    ? Math.min(100, (subtotalPhp / freeDeliveryThresholdPhp!) * 100)
    : 0;
  const freeDeliveryMet =
    showFreeDeliveryProgress && subtotalPhp >= freeDeliveryThresholdPhp!;

  const frontCommerce = useMemo(() => {
    if (!store) return null;
    return resolveStoreFrontCommerceState(store.business_hours_json, store.is_open);
  }, [store, hoursTick]);

  const checkoutBlocked = frontCommerce != null && !frontCommerce.isOpenForCommerce;

  const navigateToStoreMenu = useCallback(async () => {
    const slugFromStore = store?.slug?.trim();
    const slugFromCart = cartBucket?.storeSlug?.trim();
    const slug = slugFromStore || slugFromCart || storeSlug.trim();
    if (slug) {
      router.push(`/stores/${encodeURIComponent(slug)}`);
      return;
    }
    const sid = store?.id?.trim() || cartBucket?.storeId?.trim();
    if (sid) {
      try {
        const { json } = await fetchStoreSummaryDeduped(storeSlug);
        const j = json as { ok?: boolean; store?: { slug?: string } };
        const resolved = j?.ok && j.store?.slug?.trim() ? j.store.slug.trim() : "";
        if (resolved) {
          router.push(`/stores/${encodeURIComponent(resolved)}`);
          return;
        }
      } catch {
        /* fallback */
      }
    }
    router.push("/stores");
  }, [store, cartBucket, storeSlug, router]);

  async function submitOrder() {
    if (!store || lines.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(t("store_network_order_retry"));
      return;
    }
    if (busy || orderSubmitFlightRef.current) return;
    if (frontCommerce && !frontCommerce.isOpenForCommerce) {
      setErr(
        frontCommerce.inBreak
          ? t("common_break_time_order_blocked", { time: frontCommerce.breakRangeLabel })
          : t("common_preparing_order_blocked")
      );
      return;
    }
    if (!meetsMin) {
      setErr(t("store_min_order_match_short", { amount: formatMoneyPhp(minOrderPhp) }));
      return;
    }
    if (fulfillment === "pickup" && !offerPickup) {
      setErr(t("store_err_pickup_combo"));
      return;
    }
    if (fulfillment === "local_delivery" && !offerDelivery) {
      setErr(t("store_err_delivery_not_offered"));
      return;
    }
    if (fulfillment === "shipping" && !offerShip) {
      setErr(t("store_err_shipping_items_in_cart"));
      return;
    }
    if (region && !city) {
      setErr(t("store_err_region_only_address"));
      return;
    }
    if (needsAddressAndPhone && !isCompletePhMobile(buyerPhone)) {
      setErr(t("common_enter_contact", { placeholder: PH_LOCAL_09_PLACEHOLDER }));
      return;
    }
    if (needsAddressAndPhone && !resolvedDelivery) {
      setErr(t("store_err_select_delivery_address"));
      return;
    }
    if (fulfillment === "local_delivery" && !deliveryUserAddressIdForSubmit) {
      setErr(t("store_err_saved_address_required"));
      return;
    }
    if (needsAddressAndPhone && !deliveryAddressReady) {
      setErr(
        t("store_err_delivery_address_incomplete", { streetLabel: STORE_ADDRESS_STREET_LABEL })
      );
      return;
    }
    if (
      fulfillment === "pickup" &&
      parsePhMobileInput(buyerPhone) &&
      !isCompletePhMobile(buyerPhone)
    ) {
      setErr(t("common_check_contact_format"));
      return;
    }

    const phoneDigits = parsePhMobileInput(buyerPhone);
    const phoneDisp = isCompletePhMobile(phoneDigits)
      ? formatPhMobileDisplay(phoneDigits)
      : phoneDigits.length > 0
        ? t("store_checkout_phone_partial", { phone: formatPhMobileDisplay(phoneDigits) })
        : t("store_checkout_not_entered");
    const addrDisp =
      [summaryForSubmit, addressDetail.trim()].filter(Boolean).join("\n") ||
      t("store_checkout_not_entered");
    const payLabel =
      checkoutPaymentOptions.find((o) => o.id === selectedPaymentMethod)?.label ?? selectedPaymentMethod;
    setCheckoutConfirmPayload({
      phoneLabel: phoneDisp,
      addressLabel: addrDisp,
      paymentLabel: payLabel,
    });
    setCheckoutConfirmOpen(true);
  }

  async function submitOrderConfirmed() {
    if (!store || lines.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr(t("store_network_order_retry"));
      return;
    }
    if (busy || orderSubmitFlightRef.current) return;
    setCheckoutConfirmOpen(false);
    setCheckoutConfirmPayload(null);

    setErr(null);
    setLastOrderId(null);
    orderSubmitFlightRef.current = true;
    setBusy(true);
    dibayPerfRecordOrderSubmitClick(store.id);
    dibayPerfOnOrderApiStart(store.id);
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_CHECKOUT, {
      event: "submit_start",
      store_id: store.id,
      line_count: lines.length,
    });
    try {
      if (!clientOrderKeyRef.current) {
        clientOrderKeyRef.current = generateStoreOrderClientKey();
        dibayPerfRecordOrderIdempotencyKeyCreated(store.id);
      }
      const client_order_key = clientOrderKeyRef.current;
      const { status, json } = await postMeStoreOrder({
        store_id: store.id,
        items: lines.map((l) => {
          const wire: ModifierSelectionsWire =
            l.modifierWire ?? { pick: { ...l.optionSelections }, qty: {} };
          const hasPick = Object.keys(wire.pick).some((k) => (wire.pick[k]?.length ?? 0) > 0);
          const hasQty = Object.keys(wire.qty).length > 0;
          const row: Record<string, unknown> = {
            product_id: l.productId,
            qty: l.qty,
          };
          if (hasPick || hasQty) row.modifier_selections = wire;
          if (l.lineNote?.trim()) row.line_note = l.lineNote.trim();
          return row;
        }),
        fulfillment_type: fulfillment,
        buyer_note: buyerNote.trim() || undefined,
        buyer_phone: parsePhMobileInput(buyerPhone) || undefined,
        payment_method: selectedPaymentMethod,
        delivery_address_summary: summaryForSubmit || undefined,
        delivery_address_detail: addressDetail.trim() || undefined,
        ...(fulfillment === "local_delivery" || fulfillment === "shipping" ?
          {
            delivery_region: region.trim() || undefined,
            delivery_city: city.trim() || undefined,
          }
        : {}),
        ...(fulfillment === "local_delivery" && deliveryUserAddressIdForSubmit ?
          { delivery_user_address_id: deliveryUserAddressIdForSubmit }
        : {}),
        client_order_key,
      });
      if (status === 401) {
        clientOrderKeyRef.current = null;
        dibayPerfOnOrderApiDone(store.id);
        if (redirectForBlockedAction(router, t("common_login_required"), pathname || `/stores/${storeSlug}/cart`)) {
          return;
        }
        setErr(t("common_login_required"));
        return;
      }
      const orderJson = json as {
        ok?: boolean;
        error?: string;
        idempotent?: boolean;
        order?: { id?: string; order_no?: string; payment_amount?: number };
      };
      dibayPerfOnOrderApiDone(store.id, typeof orderJson.order?.id === "string" ? orderJson.order.id : undefined);
      if (orderJson?.ok === true && orderJson.idempotent === true) {
        dibayPerfRecordOrderIdempotencyExistingHit(store.id);
      }
      if (!orderJson?.ok) {
        clientOrderKeyRef.current = null;
        const code = typeof orderJson.error === "string" ? orderJson.error : "order_failed";
        if (redirectForBlockedAction(router, code, pathname || `/stores/${storeSlug}/cart`)) {
          return;
        }
        setErr(
          code === "buyer_phone_required"
            ? t("common_enter_contact", { placeholder: PH_LOCAL_09_PLACEHOLDER })
            : code === "invalid_buyer_phone"
              ? t("common_check_contact_format")
              : code === "delivery_region_city_required"
                ? t("store_err_delivery_region_city_required")
                : code === "delivery_user_address_required"
                  ? t("store_err_saved_address_required")
                  : code === "delivery_user_address_invalid"
                    ? t("store_err_delivery_address_invalid")
                    : code === "payment_method_required"
                      ? t("store_err_payment_method_select")
                      : code === "insufficient_stock"
                        ? t("store_err_out_of_stock")
                        : code === "mixed_store_cart"
                          ? t("store_err_mixed_store_cart")
                          : code === "product_sold_out"
                            ? t("store_err_sold_out_in_cart")
                            : code === "product_not_available"
                              ? t("store_err_product_stopped_in_cart")
                              : code === "price_changed" || code === "client_unit_php_required"
                                ? t("store_err_price_changed_cart")
                                : code === "required_option_missing" || code === "invalid_option"
                                  ? t("store_err_required_option_changed_cart")
                                  : code === "cannot_order_own_store"
                                    ? t("store_err_own_store")
                                    : code === "store_closed"
                                      ? t("store_err_preparing")
                                      : code === "below_min_order"
                                        ? t("store_err_below_minimum")
                                        : code === "delivery_address_required"
                                          ? t("store_err_delivery_address_required")
                                          : code === "store_pickup_disabled"
                                            ? t("store_err_pickup_disabled")
                                            : code === "store_delivery_disabled"
                                              ? t("store_err_delivery_disabled")
                                              : code === "payment_method_invalid"
                                                ? t("store_err_payment_method")
                                                : t("store_err_order_failed", { code })
        );
        return;
      }
      const oid = typeof orderJson.order?.id === "string" ? orderJson.order.id : null;
      if (fulfillment === "local_delivery" && deliveryUserAddressIdForSubmit) {
        void fetch(`/api/me/addresses/${encodeURIComponent(deliveryUserAddressIdForSubmit)}/mark-used`, {
          method: "POST",
          credentials: "include",
        });
      }
      clientOrderKeyRef.current = null;
      const placed = orderJson.order;
      if (
        oid &&
        placed &&
        typeof placed.order_no === "string" &&
        typeof placed.payment_amount === "number"
      ) {
        setStoreOrderDetailSeed(
          oid,
          buildStoreOrderDetailSeedFromPostSuccess({
            orderId: oid,
            order_no: placed.order_no,
            payment_amount: placed.payment_amount,
            store_id: store.id,
            store_name: store.store_name,
            idempotent: orderJson.idempotent === true,
          })
        );
      }
      /* Context 비우기와 동시에 리렌더되면 lines===0이 lastOrderId보다 먼저 적용될 수 있음 → id 먼저 동기 반영 */
      flushSync(() => {
        setLastOrderId(oid);
      });
      if (oid) setLastCheckoutOrderId(store.id, oid);
      cart.clearStoreCart(store.id);
      if (oid) {
        try {
          sessionStorage.setItem(`dibay:buyer_order_placed_wall:${oid}`, String(Date.now()));
        } catch {
          /* ignore */
        }
        void router.prefetch("/orders");
        void router.prefetch(`/orders/store/${encodeURIComponent(oid)}`);
        void router.prefetch(`/orders/store/${encodeURIComponent(oid)}/chat`);
        window.dispatchEvent(new CustomEvent(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
        router.replace(`/orders/store/${encodeURIComponent(oid)}`);
      }
    } catch {
      dibayPerfOnOrderApiDone(store.id);
      setErr(t("common_network_error_generic"));
    } finally {
      orderSubmitFlightRef.current = false;
      setBusy(false);
    }
  }

  if (!cart.hydrated) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  if (storeLoading && !store) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  if ((storeLoadFailed || !store) && lines.length === 0) {
    return (
      <div className="min-h-screen bg-sam-app">
        <p className="px-4 py-12 text-center text-sm text-sam-muted">{t("common_store_info_load_failed")}</p>
        <div className="px-4 text-center">
          <Link href="/stores" className="text-sm font-medium text-signature">
            {t("common_store")}
          </Link>
        </div>
      </div>
    );
  }

  if (lines.length === 0 && lastOrderId) {
    return (
      <div className="min-h-screen bg-sam-app pb-8">
        <CartTopBar cartCount={0} onBack={() => router.back()} />
        <div className="px-4 py-10 text-center">
          <p className="sam-text-body-lg font-semibold text-emerald-800">{t("store_order_accepted")}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link href="/orders" className="sam-text-body font-semibold text-signature underline">
              {t("store_view_order_history")}
            </Link>
            <Link
              href={`/orders/store/${encodeURIComponent(lastOrderId)}`}
              className="sam-text-body text-sam-fg underline"
            >
              {t("store_view_order_progress")}
            </Link>
            <Link
              href={`/orders/store/${encodeURIComponent(lastOrderId)}/chat`}
              className="sam-text-body text-sam-fg underline"
            >
              {t("store_leave_store_inquiry")}
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(store?.slug ?? storeSlug)}`}
              className="sam-text-body text-sam-muted underline"
            >
              {t("store_return_to_store")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="min-h-screen bg-sam-app pb-8">
        <CartTopBar cartCount={0} onBack={() => router.back()} />
        <div className="px-4 py-10">
          <div className="text-center">
            <p className="sam-text-body-lg font-semibold text-sam-fg">{t("store_cart_empty")}</p>
            <p className="mt-1 sam-text-body text-sam-muted">{t("store_cart_empty_hint")}</p>
          </div>
          {otherBuckets.length > 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary leading-relaxed text-amber-950">
              <p className="font-medium text-amber-950">
                {t("store_cart_other_store_carts_prefix")}
                {otherBuckets.map((b, i) => (
                  <span key={b.storeId}>
                    {i > 0 ? ", " : null}
                    <Link
                      href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                      className="font-semibold text-signature underline decoration-signature/40"
                    >
                      {b.storeName}
                    </Link>
                  </span>
                ))}
                {t("store_cart_other_store_carts_suffix")}
              </p>
              <ul className="mt-3 space-y-2">
                {otherBuckets.map((b) => (
                  <li key={b.storeId} className="flex flex-wrap items-center gap-2">
                    <span className="sam-text-helper text-amber-900/90">
                      {t("store_cart_items_line", {
                        name: b.storeName,
                        count: b.itemCount,
                        amount: formatMoneyPhp(b.subtotalPhp),
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.clearStoreCart(b.storeId)}
                      className="sam-text-helper font-semibold text-red-700 underline"
                    >
                      {t("store_cart_clear_this_store")}
                    </button>
                    <Link
                      href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                      className="sam-text-helper font-semibold text-signature underline"
                    >
                      {t("store_cart_open_cart")}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 flex flex-col items-center gap-3">
            {otherBuckets.length === 0 ? (
              <Link
                href="/stores"
                className="inline-flex h-11 min-w-[11.5rem] items-center justify-center rounded-full border border-sam-border bg-white px-6 sam-text-body font-semibold text-sam-fg shadow-sm active:bg-sam-app"
              >
                {t("store_browse_stores")}
              </Link>
            ) : null}
            {store?.slug || storeSlug ? (
              <Link
                href={`/stores/${encodeURIComponent(store?.slug ?? storeSlug)}`}
                className="sam-text-body text-sam-muted underline"
              >
                {t("store_view_menu_link", { storeName: store?.store_name ?? storeSlug })}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  const fulfillmentOptions: { value: Fulfillment; label: string }[] = [];
  if (offerPickup) fulfillmentOptions.push({ value: "pickup", label: t("common_pickup_label") });
  if (deliveryFulfillmentMode) {
    fulfillmentOptions.push({ value: deliveryFulfillmentMode, label: t("common_delivery_label") });
  }

  const displayGrand =
    fulfillment === "local_delivery" ? paymentGrandTotalPhp : pickupGrandTotalPhp;

  return (
    <div className="min-h-screen bg-sam-app pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <CartTopBar cartCount={lines.length} onBack={() => router.back()} />

      <StoreCartStoreSummaryCard
        store={store}
        frontCommerce={frontCommerce}
        subtotalPhp={subtotalPhp}
        minOrderPhp={minOrderPhp}
        minShortage={minShortage}
        meetsMin={meetsMin}
        clearBusy={busy}
        onBackToStore={() => void navigateToStoreMenu()}
        onRequestClear={() => setClearCartConfirmOpen(true)}
      />

      <StoreCartClearConfirmDialog
        open={clearCartConfirmOpen}
        storeName={store.store_name}
        busy={busy}
        onCancel={() => setClearCartConfirmOpen(false)}
        onConfirm={() => {
          setClearCartConfirmOpen(false);
          cart.clearStoreCart(store.id);
        }}
      />

      {checkoutConfirmPayload ? (
        <StoreCheckoutSubmitConfirmDialog
          open={checkoutConfirmOpen}
          phoneLabel={checkoutConfirmPayload.phoneLabel}
          addressLabel={checkoutConfirmPayload.addressLabel}
          paymentLabel={checkoutConfirmPayload.paymentLabel}
          busy={busy}
          onCancel={() => {
            setCheckoutConfirmOpen(false);
            setCheckoutConfirmPayload(null);
          }}
          onConfirm={() => void submitOrderConfirmed()}
        />
      ) : null}

      <div className="mt-2 space-y-2 px-3">
        {lines.map((line) => {
          const lineTotal = line.unitPricePhp * line.qty;
          const listU = resolveCartLineListUnitPhp(line);
          const lineListTotal = listU != null ? listU * line.qty : null;
          const lineDiscPct =
            line.discountPercent != null && line.discountPercent > 0
              ? Math.floor(line.discountPercent)
              : listU != null && listU > line.unitPricePhp
                ? Math.max(
                    1,
                    Math.min(99, Math.round((1 - line.unitPricePhp / listU) * 100))
                  )
                : 0;
          const showDiscBadge = lineDiscPct > 0 && listU != null;
          return (
            <div
              key={line.lineId}
              className="flex gap-3 rounded-[14px] border border-sam-border bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-visible">
                {showDiscBadge ? (
                  <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 sam-text-xxs font-bold leading-none text-white shadow-sm">
                    {lineDiscPct}%
                  </span>
                ) : null}
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-sam-surface-muted to-sam-border-soft text-2xl text-sam-meta">
                  {line.thumbnailUrl?.trim() ? (
                    <img
                      src={line.thumbnailUrl.trim()}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>🍽️</span>
                  )}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 sam-text-body font-semibold leading-snug text-sam-fg">
                    {line.title}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cart.removeLine(line.lineId)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sam-meta active:bg-black/[0.04] disabled:opacity-40"
                    aria-label={t("common_delete")}
                    title={t("common_delete")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4h8v2" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 16H6L5 6" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>

                <p className="mt-0.5 sam-text-helper text-sam-muted">
                  {line.optionsSummary?.trim() ? line.optionsSummary.trim() : t("common_none")}
                </p>
                <Link
                  href={`/stores/${encodeURIComponent(store.slug)}`}
                  className="mt-1 inline-block sam-text-xxs font-semibold text-signature underline decoration-signature/40"
                >
                  {t("store_more_menu_at_store")}
                </Link>
                {line.lineNote?.trim() ? (
                  <p className="mt-0.5 sam-text-helper text-amber-900/90">
                    <span className="font-medium">{t("common_request")}</span> {line.lineNote.trim()}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold text-sam-fg">{formatMoneyPhp(lineTotal)}</span>
                  {lineListTotal != null && lineListTotal > lineTotal ? (
                    <span className="text-xs font-normal text-sam-meta line-through">
                      {formatMoneyPhp(lineListTotal)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      router.push(
                        `/stores/${encodeURIComponent(store.slug)}/products/${encodeURIComponent(line.productId)}`
                      )
                    }
                    className="h-9 shrink-0 rounded-md border border-sam-border bg-white px-3 sam-text-helper font-semibold text-sam-fg shadow-sm active:bg-sam-app disabled:opacity-40"
                  >
                    {t("store_change_options")}
                  </button>
                  <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-md border border-sam-border bg-white shadow-sm">
                    <button
                      type="button"
                      disabled={busy || line.qty <= line.minOrderQty}
                      onClick={() => cart.updateLineQuantity(line.lineId, line.qty - 1)}
                      className="flex h-full w-10 items-center justify-center text-[18px] font-medium text-sam-fg disabled:opacity-30"
                      aria-label={t("store_qty_decrease_alt_aria")}
                    >
                      −
                    </button>
                    <span className="min-w-[2.25rem] text-center sam-text-body font-semibold tabular-nums text-sam-fg">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      disabled={busy || line.qty >= line.maxOrderQty}
                      onClick={() => cart.updateLineQuantity(line.lineId, line.qty + 1)}
                      className="flex h-full w-10 items-center justify-center text-[18px] font-medium text-sam-fg disabled:opacity-30"
                      aria-label={t("store_qty_increase_alt_aria")}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 사용자 요청: 장바구니 내 메뉴 추천/추가 영역은 생략 가능 */}

      {otherBuckets.length > 0 ? (
        <div className="mx-3 mt-3 rounded border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-helper text-sam-muted">
          {t("store_cart_other_buckets_hint")}
        </div>
      ) : null}

      <div className="mx-3 mt-3 space-y-3">
        <div className="rounded border border-sam-border bg-sam-surface p-3.5 shadow-sm">
            <dl className="space-y-2.5 sam-text-body leading-snug">
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{t("store_items_subtotal")}</dt>
                <dd className="shrink-0 text-right font-semibold tabular-nums text-sam-fg">
                  {formatMoneyPhp(listSubtotalPhp)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">
                  {t("store_discount_amount")}
                  {discountAmountPhp > 0 && discountPercentOverall > 0 ? (
                    <span className="ml-1 sam-text-xxs font-normal text-sam-meta">
                      ({discountPercentOverall}%)
                    </span>
                  ) : null}
                </dt>
                <dd className="shrink-0 text-right font-semibold tabular-nums text-rose-600">
                  {discountAmountPhp > 0
                    ? `− ${formatMoneyPhp(discountAmountPhp)}`
                    : `− ${formatMoneyPhp(0)}`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">{t("store_estimated_delivery_fee")}</dt>
                <dd className="shrink-0 text-right font-semibold tabular-nums text-sam-fg">
                  {fulfillment !== "local_delivery" ?
                    formatMoneyPhp(0)
                  : commerce.deliveryFeeMode === "courier" ?
                    commerce.deliveryCourierLabel?.trim() ?
                      `${t("store_cod_label")} · ${commerce.deliveryCourierLabel.trim()}`
                    : t("store_cod_label")
                  : commerce.deliveryFeeMode === "self_free_promo" ?
                    <span className="inline-flex flex-col items-end gap-0.5">
                      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <span className="text-[13px] font-semibold text-[#2563EB]">{t("store_free_delivery_applied")}</span>
                        {commerce.deliveryFeeStrikeReferencePhp != null &&
                        commerce.deliveryFeeStrikeReferencePhp > 0 ? (
                          <span className="text-[13px] font-medium text-sam-meta line-through">
                            {formatMoneyPhp(commerce.deliveryFeeStrikeReferencePhp)}
                          </span>
                        ) : null}
                      </span>
                      <span>{formatMoneyPhp(deliveryFeeForCheckout)}</span>
                    </span>
                  : formatMoneyPhp(deliveryFeeForCheckout)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-dashed border-sam-border pt-3">
              <div className="flex items-end justify-between gap-3">
                <span className="sam-text-body font-bold text-sam-fg">{t("store_payment_due")}</span>
                <span className="sam-text-page-title font-bold leading-none text-rose-600 tabular-nums">
                  {formatMoneyPhp(displayGrand)}
                </span>
              </div>
              <p className="mt-2 sam-text-xxs text-sam-meta">
                {t("store_min_order_amount_colon", { amount: formatMoneyPhp(minOrderPhp) })}
              </p>
            </div>
        </div>

        {showFreeDeliveryProgress ? (
          <div className="rounded border border-sky-100 bg-sky-50/80 px-3 py-2.5">
            <p className="sam-text-helper font-semibold text-sky-950">
              {t("store_free_delivery_over", { amount: formatMoneyPhp(freeDeliveryThresholdPhp!) })}
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200/80"
              role="progressbar"
              aria-valuenow={Math.round(freeDeliveryProgressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("store_free_delivery_progress_aria")}
            >
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
                style={{ width: `${freeDeliveryProgressPct}%` }}
              />
            </div>
            {freeDeliveryMet ? (
              <p className="mt-1.5 sam-text-xxs font-medium text-emerald-700">
                {t("store_free_delivery_met")}
              </p>
            ) : (
              <p className="mt-1.5 sam-text-xxs text-sky-900/80">
                {t("store_free_delivery_remaining", {
                  amount: formatMoneyPhp(Math.max(0, freeDeliveryThresholdPhp! - subtotalPhp)),
                })}
              </p>
            )}
          </div>
        ) : null}

        {fulfillment !== "local_delivery" ? (
          <p className="sam-text-xxs text-sam-muted">
            {t("store_delivery_fee_estimate_hint")}
          </p>
        ) : null}

        {minOrderPhp > 0 ? (
          <p
            className={`sam-text-helper font-medium ${meetsMin ? "text-emerald-700" : "text-amber-800"}`}
          >
            {meetsMin
              ? t("store_min_order_met")
              : t("store_min_order_add_more", { amount: formatMoneyPhp(minShortage) })}
          </p>
        ) : null}

      </div>

      <div className="mx-3 mt-3 space-y-3 rounded border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
          <div className="min-w-0 sm:max-w-[8.5rem] sm:shrink-0">
            <p className="sam-text-body font-medium text-sam-muted">{t("store_fulfillment_mode")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {fulfillmentOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setFulfillment(o.value);
                    if (store?.slug) {
                      if (o.value === "pickup") writeStoreFulfillmentPref(store.slug, "pickup");
                      else writeStoreFulfillmentPref(store.slug, "local_delivery");
                    }
                  }}
                  className={`rounded-full px-3 py-1.5 sam-text-body-secondary ${
                    fulfillment === o.value
                      ? "bg-signature text-white"
                      : "border border-sam-border bg-sam-surface text-sam-fg"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {lines.length > 0 && fulfillmentOptions.length === 0 ? (
              canPickup || canDelivery || canShip ? (
                <p className="mt-2 sam-text-helper leading-snug text-amber-800">
                  {t("store_fulfillment_mode_unavailable")}
                </p>
              ) : (
                <p className="mt-2 sam-text-helper leading-snug text-amber-800">
                  {t("store_fulfillment_all_items_blocked")}
                </p>
              )
            ) : null}
          </div>
          <div className="min-w-0 flex-1 border-t border-sam-border pt-4 sm:border-t-0 sm:border-l sm:border-sam-border sm:pt-0 sm:pl-3">
            <p className="sam-text-body font-medium text-sam-muted">
              {t("store_payment_method_required")} <span className="text-red-600">*</span>
            </p>
            <div
              className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="radiogroup"
              aria-label={t("store_payment_method_aria")}
            >
              {checkoutPaymentOptions.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-ui-rect border px-3 py-2 sam-text-body-secondary font-medium shadow-sm ${
                    selectedPaymentMethod === opt.id
                      ? "border-signature bg-signature/5 text-sam-fg ring-1 ring-signature/25"
                      : "border-sam-border bg-sam-surface text-sam-fg"
                  } ${busy ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input
                    type="radio"
                    name="cart-checkout-payment"
                    className="h-4 w-4 shrink-0 border-sam-border accent-signature focus:ring-2 focus:ring-signature/40 focus:ring-offset-0"
                    checked={selectedPaymentMethod === opt.id}
                    onChange={() => setSelectedPaymentMethod(opt.id)}
                    disabled={busy}
                    aria-label={opt.label}
                  />
                  <span className="whitespace-nowrap">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {fulfillment === "pickup" && offerPickup && storePickupLines.length > 0 ? (
          <div className="rounded-ui-rect border border-sky-100 bg-sky-50/90 px-3 py-2.5">
            <p className="sam-text-helper font-semibold text-sky-950">{t("store_pickup_location")}</p>
            <p className="mt-1 sam-text-xxs leading-snug text-sky-900/85">
              {t("store_pickup_address_at_store_hint")}
            </p>
            <ul className="mt-2 list-none space-y-0.5 sam-text-body-secondary leading-relaxed text-sky-950">
              {storePickupLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {store?.slug ?
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/info`}
                className="mt-2 inline-block sam-text-helper font-medium text-signature underline"
              >
                {t("store_label_store_info")}
              </Link>
            : null}
          </div>
        ) : fulfillment === "pickup" && offerPickup ? (
          <p className="rounded-ui-rect border border-amber-100 bg-amber-50/80 px-3 py-2 sam-text-helper text-amber-950">
            {t("store_pickup_address_missing")}
          </p>
        ) : null}

        <div
          className={
            needsAddressAndPhone
              ? "flex flex-col gap-4 border-t border-sam-border pt-4 sm:flex-row sm:items-start sm:gap-4"
              : "border-t border-sam-border pt-4"
          }
        >
          <div className={needsAddressAndPhone ? "min-w-0 sm:max-w-[13rem] sm:shrink-0" : undefined}>
            <p className="sam-text-body font-medium text-sam-muted">
              {t("store_label_contact")}
              {fulfillment === "pickup" ? (
                <span className="font-normal text-sam-meta">{t("store_optional_suffix")}</span>
              ) : (
                <span className="text-red-600"> *</span>
              )}
            </p>
            <p className="mt-2 sam-text-body-lg font-medium tabular-nums tracking-tight text-sam-fg">
              {formattedPhoneDisplay}
            </p>
          </div>

          {needsAddressAndPhone ? (
            <div className="min-w-0 flex-1 border-t border-sam-border pt-4 sm:border-t-0 sm:border-l sm:border-sam-border sm:pl-4 sm:pt-0">
            <p className="sam-text-body font-medium text-sam-muted">
              {t("store_label_delivery_address")} <span className="text-red-600">*</span>
            </p>
            <ul className="mt-2 space-y-2">
              {!checkoutContactReady ? (
                <li className="rounded border border-sam-border bg-sam-surface p-3">
                  <p className="sam-text-helper text-sam-muted">{t("store_delivery_address_loading")}</p>
                </li>
              ) : null}
              {checkoutContactReady && !profileSnap && savedAddresses.length === 0 ? (
                <li className="rounded border border-amber-100 bg-amber-50/60 p-3">
                  <p className="sam-text-helper leading-snug text-amber-950">
                    {t("store_cart_login_for_saved_address")}
                  </p>
                </li>
              ) : null}
              {checkoutContactReady && legacyLsNoticeCount > 0 ? (
                <li className="rounded border border-sky-100 bg-sky-50/75 p-3">
                  <p className="sam-text-helper leading-snug text-sky-950">
                    {t("store_cart_legacy_address_notice", { count: legacyLsNoticeCount })}{" "}
                    <Link href="/mypage/addresses" className="font-semibold text-signature underline">
                      {t("store_address_manage_link")}
                    </Link>
                    {t("store_cart_legacy_address_suffix")}
                  </p>
                </li>
              ) : null}
              {checkoutContactReady && profileSnap ? (
                <li
                  className={`rounded border p-3 ${
                    selectedAddressId === PROFILE_DELIVERY_SELECTION_ID
                      ? "border-signature bg-signature/5 ring-1 ring-signature/30"
                      : "border-sam-border bg-sam-surface"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="cart-delivery-addr"
                      className="mt-1"
                      checked={selectedAddressId === PROFILE_DELIVERY_SELECTION_ID}
                      onChange={() => setSelectedAddressId(PROFILE_DELIVERY_SELECTION_ID)}
                      aria-label={t("store_delivery_address_1_aria")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="sam-text-body-secondary font-bold text-sam-fg">{t("store_delivery_address_1")}</p>
                      <p className="mt-0.5 sam-text-xxs font-medium text-sam-muted">
                        {t("store_cart_profile_default_delivery")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
                        {profileAddressBodyText || t("store_cart_no_saved_delivery_address")}
                      </p>
                      {!profileDeliveryReady && profileAddressBodyText ? (
                        <p className="mt-1.5 sam-text-xxs leading-snug text-amber-800">
                          {t("store_cart_address_check_before_order")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ) : null}
              {savedAddresses
                .filter((a) => a.id !== profileSnap?.userAddressId)
                .map((a, idx) => {
                  const selectionId = userAddressDeliverySelectionId(a.id);
                  const body = formatPhDeliveryBlockForCheckout(a);
                  const isSel = selectedAddressId === selectionId;
                  return (
                    <li
                      key={a.id}
                      className={`rounded border p-3 ${
                        isSel ? "border-signature bg-signature/5 ring-1 ring-signature/30" : "border-sam-border bg-sam-surface"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="cart-delivery-addr"
                          className="mt-1"
                          checked={isSel}
                          onChange={() => setSelectedAddressId(selectionId)}
                          aria-label={t("store_cart_saved_address_aria", {
                            label: getUserAddressDesignationPlainText(a),
                            index: idx + 1,
                          })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-h-[1.25em] items-center gap-1">
                            <UserAddressDesignationTitle
                              row={a}
                              className="sam-text-body-secondary font-bold text-sam-fg"
                            />
                          </div>
                          <p className="mt-0.5 sam-text-xxs font-medium text-sam-muted">
                            {t("store_cart_profile_address_manage")}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap sam-text-helper font-normal leading-relaxed text-sam-fg">
                            {body || "—"}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/mypage/addresses"
                className="inline-flex items-center rounded border border-signature bg-sam-surface px-3 py-2 sam-text-body-secondary font-bold text-signature shadow-sm"
              >
                {t("store_cart_save_from_address_manage")}
              </Link>
            </div>
            {!deliveryAddressReady && checkoutContactReady && (profileSnap || savedAddresses.length > 0) ? (
              <p className="mt-2 sam-text-xxs leading-snug text-amber-800">
                {t("store_cart_verify_delivery_address", { streetLabel: STORE_ADDRESS_STREET_LABEL })}
              </p>
            ) : null}
            {checkoutContactReady && profileSnap && !profileDeliveryReady && savedAddresses.length === 0 ? (
              <p className="mt-2 sam-text-xxs leading-snug text-amber-800">
                {t("store_cart_address_too_short")}{" "}
                <Link href="/mypage/addresses" className="font-semibold underline">
                  {t("store_address_manage_link")}
                </Link>
                {t("store_cart_address_add_suffix")}
              </p>
            ) : null}
            {fulfillment === "local_delivery" && deliveryAddressReady ? (
              <div className="mt-2">
                {globalRideTimeSource === "store" ? (
                  storeModeStaticEtaLabel && storeModeStaticEtaLabel.trim() ? (
                    <p className="sam-text-xxs font-semibold leading-snug text-sam-fg">
                      {t("store_cart_eta_ref", { label: storeModeStaticEtaLabel })}
                      <span className="ml-1 font-normal text-sam-muted">{t("store_prep_time_store_basis")}</span>
                    </p>
                  ) : (
                    <p className="sam-text-xxs leading-snug text-sam-muted">
                      {t("store_cart_eta_manual_hint")}
                    </p>
                  )
                ) : deliveryEtaLabel ? (
                  <p className="sam-text-xxs font-semibold leading-snug text-sam-fg">
                    {t("store_cart_eta_ref", { label: deliveryEtaLabel })}
                    <span className="ml-1 font-normal text-sam-muted">{t("store_route_motorcycle_basis")}</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy || deliveryEtaBusy}
                    onClick={() => void loadDeliveryEtaPreview()}
                    className="sam-text-xxs font-semibold leading-snug text-sam-fg underline decoration-sam-muted underline-offset-2 disabled:opacity-50"
                  >
                    {t("store_cart_eta_confirm")}
                  </button>
                )}
              </div>
            ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <label htmlFor="cart-buyer-note" className="sam-text-body font-medium text-sam-muted">
            {t("store_request_optional_label")}
          </label>
          <textarea
            id="cart-buyer-note"
            rows={2}
            value={buyerNote}
            disabled={busy}
            onChange={(e) => setBuyerNote(e.target.value)}
            className="sam-textarea mt-2 w-full min-h-[96px] resize-none"
            maxLength={500}
          />
          <p className="mt-1 sam-text-xxs leading-snug text-sam-muted">
            {t("store_checkout_request_owner_hint")}
          </p>
        </div>

        {fulfillment === "local_delivery" && commerce.deliveryCourierLabel?.trim() ? (
          <p className="sam-text-xxs leading-snug text-sam-muted">
            {t("store_delivery_courier_line", { label: commerce.deliveryCourierLabel.trim() })}
          </p>
        ) : null}
        {checkoutBlocked && frontCommerce ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper font-medium leading-snug text-amber-950">
            {frontCommerce.inBreak
              ? t("store_menu_blocked_break", { range: frontCommerce.breakRangeLabel })
              : t("store_err_preparing")}
          </p>
        ) : null}
        {err ? <p className="sam-text-body-secondary text-red-600">{err}</p> : null}
      </div>

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-sam-border bg-white/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm ${BOTTOM_NAV_STACK_ABOVE_CLASS}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className={`mx-auto flex w-full min-w-0 items-center gap-3 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS}`}>
          <div className="min-w-0 flex-1">
            <p className="sam-text-page-title font-extrabold leading-none tabular-nums text-sam-fg">
              {formatMoneyPhp(displayGrand)}
            </p>
          </div>
          <button
            type="button"
            disabled={busy || !meetsMin || fulfillmentOptions.length === 0 || checkoutBlocked}
            onClick={() => void submitOrder()}
            className="inline-flex h-11 min-w-[11.5rem] touch-manipulation items-center justify-center rounded-[12px] bg-[#1C8DB8] px-5 sam-text-body font-extrabold text-white shadow-sm transition-all duration-150 hover:bg-[#197DA3] active:bg-[#166F92] active:scale-[0.98] disabled:bg-sam-surface-muted disabled:text-sam-muted disabled:active:scale-100"
          >
            {busy ? t("common_processing") : t("store_submit_store_delivery")}
          </button>
        </div>
      </div>
    </div>
  );
}
