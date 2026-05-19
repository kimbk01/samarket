"use client";

import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { markStoreDetailMenuTabsLanding } from "@/lib/dibay/store-detail-nav-intent";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scrollAppShellForStoreCheckoutConfirm } from "@/lib/stores/store-cart-checkout-scroll";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
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
  formatPhMobileDisplayPlus63,
  isCompletePhMobile,
  parsePhMobileInput,
} from "@/lib/utils/ph-mobile";
import {
  fetchStorePublicBySlugDeduped,
  fetchStoreDeliveryEtaDeduped,
  fetchStoreSummaryDeduped,
  postMeStoreOrder,
} from "@/lib/stores/store-delivery-api-client";
import {
  parseStoreCartHeadFromPublicJson,
  peekStoreCartHeadFromPublicCache,
  readStoreCartCheckoutCachePaint,
  scheduleStoreCartIdleTask,
  storeCartHeadFromCommerceBucket,
} from "@/lib/stores/store-cart-checkout-perf";
import { StoreCartClearConfirmDialog } from "@/components/stores/cart/StoreCartClearConfirmDialog";
import { StoreCartCheckoutActionBar } from "@/components/stores/cart/StoreCommerceCartCheckoutActionBar";
import { StoreCommerceCartPageShell } from "@/components/stores/cart/StoreCommerceCartPageShell";
import { StoreCheckoutSubmitConfirmDialog } from "@/components/stores/cart/StoreCheckoutSubmitConfirmDialog";
import { StoreBaeminCartFulfillmentHint } from "@/components/stores/cart/baemin/StoreBaeminCartFulfillmentHint";
import { StoreBaeminCartOrderSummaryCard } from "@/components/stores/cart/baemin/StoreBaeminCartOrderSummaryCard";
import { StoreBaeminCartStoreBlock } from "@/components/stores/cart/baemin/StoreBaeminCartStoreBlock";
import { StoreBaeminCartTopBar } from "@/components/stores/cart/baemin/StoreBaeminCartTopBar";
import {
  buildStoreCheckoutOrderSummaryLabel,
  buildStoreCheckoutRequestLabel,
} from "@/lib/stores/store-checkout-confirm-labels";
import { openStoreProductSheetFromCart } from "@/lib/stores/open-store-product-sheet-from-cart";
import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import {
  BAEMIN_CART_ADDRESS_LIST_CLASS,
  BAEMIN_CART_ADDRESS_ROW_CLASS,
  BAEMIN_CART_ADDRESS_ROW_SELECTED_CLASS,
  BAEMIN_CART_CHECKOUT_INNER_CLASS,
  BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS,
  BAEMIN_CART_SECTION_CARD_CLASS,
} from "@/lib/stores/store-baemin-cart-ui";
import { fetchMeProfileDeduped, peekMeProfileCached } from "@/lib/profile/fetch-me-profile-deduped";
import { resolveProfilePhoneDb09 } from "@/lib/profile/resolve-profile-phone";
import type { ProfileRow } from "@/lib/profile/types";
import { resolveStoreCheckoutBuyerPhoneDigits } from "@/lib/stores/resolve-store-checkout-buyer-phone";
import {
  clearLastCheckoutOrderId,
  getLastCheckoutOrderId,
  setLastCheckoutOrderId,
} from "@/lib/store-commerce/last-checkout-order-session";
import {
  clearDeliveryAddressBookStorage,
  isCartDeliverySelectionValid,
  loadDeliveryAddressBook,
  parseUserAddressIdFromDeliverySelection,
  PROFILE_DELIVERY_SELECTION_ID,
  resolveCartDefaultDeliverySelectionId,
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
import { navigateToBuyerStoreOrderDetail } from "@/lib/stores/navigate-to-buyer-store-order-detail";
import { checkoutPaymentOptionsForCart } from "@/lib/stores/payment-methods-config";
import {
  STORE_ADDRESS_STREET_LABEL,
} from "@/lib/stores/store-address-form-ui";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import {
  readStoreFulfillmentPref,
  writeStoreFulfillmentPref,
} from "@/lib/stores/store-fulfillment-pref";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { getUserAddressDesignationPlainText } from "@/components/addresses/UserAddressDesignationTitle";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { StoreCartCheckoutAddressRowBody } from "@/components/stores/cart/StoreCartCheckoutAddressRowBody";
import {
  isCheckoutDeliveryGeoReady,
  resolveCheckoutDeliveryGeoFromUserAddress,
} from "@/lib/addresses/resolve-checkout-delivery-geo";
import { normalizeStoreAddressPh } from "@/lib/stores/normalize-store-address-ph";
import {
  fetchMeAddressesListSingleFlight,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";

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
  can_order_store?: boolean;
  owner_block_message?: string | null;
};

const OWN_STORE_ORDER_BLOCK_MESSAGE = "본인 매장은 주문할 수 없습니다";

type ProfileContactSnap = {
  userAddressId?: string | null;
  phone: string;
  region: string;
  city: string;
  freeSummaryLine: string;
  addressDetail: string;
};

function readInitialBuyerPhoneFromProfileCache(): string {
  if (typeof window === "undefined") return "";
  const cached = peekMeProfileCached();
  if (!cached || cached.status < 200 || cached.status >= 300) return "";
  const json = cached.json as { ok?: boolean; profile?: ProfileRow | null };
  if (!json?.ok || !json.profile) return "";
  return parsePhMobileInput(resolveProfilePhoneDb09(json.profile) ?? "");
}

export function StoreCommerceCartPageClient({ storeSlug }: { storeSlug: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const cart = useStoreCommerceCart();
  const { patchBucketMeta } = cart;
  const [store, setStore] = useState<StoreHead | null>(() =>
    typeof window === "undefined" ? null : peekStoreCartHeadFromPublicCache(storeSlug)
  );
  const [storeLoadFailed, setStoreLoadFailed] = useState(false);
  /** 첫 매장 fetch 완료 전에는 !store 만으로 오류 처리하면 안 됨(스티키 헤더와 본문 불일치) */
  const [storeLoading, setStoreLoading] = useState(() =>
    typeof window === "undefined" ? true : !peekStoreCartHeadFromPublicCache(storeSlug)
  );
  const [fulfillment, setFulfillment] = useState<Fulfillment>("local_delivery");
  const [buyerNote, setBuyerNote] = useState("");
  const [buyerPhone, setBuyerPhone] = useState(readInitialBuyerPhoneFromProfileCache);
  const profilePhoneDigitsRef = useRef("");
  const [busy, setBusy] = useState(false);
  /** 동일 주문 시도 내 재전송·더블탭 멱등 키 (checkout 입력 변경 시 초기화) */
  const clientOrderKeyRef = useRef<string | null>(null);
  const orderSubmitFlightRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [deliveryEtaLabel, setDeliveryEtaLabel] = useState<string | null>(null);
  const [deliveryEtaBusy, setDeliveryEtaBusy] = useState(false);
  const [globalRideTimeSource, setGlobalRideTimeSource] = useState<"store" | "google" | null>(null);
  const deliveryEtaLastOkKeyRef = useRef<string | null>(null);
  const deliveryEtaPreviewAbortRef = useRef<AbortController | null>(null);
  const [hoursTick, setHoursTick] = useState(0);
  const [profileSnap, setProfileSnap] = useState<ProfileContactSnap | null>(null);
  const [checkoutContactReady, setCheckoutContactReady] = useState(() => {
    if (typeof window === "undefined") return false;
    const paint = readStoreCartCheckoutCachePaint();
    return Boolean(paint.cachedAddresses?.length || paint.profileDigits);
  });
  const checkoutContactFetchGenRef = useRef(0);
  const checkoutFooterRef = useRef<HTMLDivElement>(null);
  /** 배송지 라디오 — 사용자가 직접 고른 뒤에는 자동 대표 주소 보정하지 않음 */
  const userPickedDeliveryAddressRef = useRef(false);

  const [savedAddresses, setSavedAddresses] = useState<UserAddressDTO[]>(() => {
    if (typeof window === "undefined") return [];
    return readStoreCartCheckoutCachePaint().cachedAddresses ?? [];
  });
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
    orderSummaryLabel: string;
    requestLabel: string;
  } | null>(null);

  useEffect(() => {
    scheduleStoreCartIdleTask(() => {
      void router.prefetch("/orders");
      void router.prefetch("/my/store-orders");
    });
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
        const j = json as {
          ok?: boolean;
          store?: Record<string, unknown>;
          meta?: Record<string, unknown>;
        };
        if (!j?.ok || !j.store) {
          if (!silent) {
            setStoreLoadFailed(true);
            setStore(null);
          }
          return;
        }
        setStoreLoadFailed(false);
        const head = parseStoreCartHeadFromPublicJson(
          storeSlug,
          j.store as Record<string, unknown>,
          j.meta
        );
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
    const cached = peekStoreCartHeadFromPublicCache(storeSlug);
    if (cached) {
      setStore(cached);
      setStoreLoading(false);
      void loadStore({ silent: true });
    } else {
      setStoreLoading(true);
      void loadStore();
    }
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
      return storeCartHeadFromCommerceBucket(bucket);
    });
    setStoreLoading(false);
  }, [cart.snapshot, storeSlug]);

  useRefetchOnPageShowRestore(() => void loadStore({ silent: true }));

  const cartBucket = useMemo(
    () => findCommerceCartBucketBySlug(cart.snapshot, storeSlug),
    [cart.snapshot, storeSlug]
  );

  const activeStoreId = store?.id ?? cartBucket?.storeId ?? null;
  const lines = activeStoreId ? cart.getLinesForStoreId(activeStoreId) : [];
  const subtotalPhp = activeStoreId ? cart.getSubtotalForStoreId(activeStoreId) : 0;

  const otherBuckets = activeStoreId ? cart.otherBucketsExcluding(activeStoreId) : [];

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
    return buildStoreDeliveryEtaLabelWithManualRide(commerce, commerce.deliveryRideDisplayManual);
  }, [globalRideTimeSource, commerce]);

  const checkoutPaymentOptions = useMemo(() => {
    if (!store) return [];
    return checkoutPaymentOptionsForCart(store.business_hours_json);
  }, [store]);

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
      return;
    }
    const remembered = getLastCheckoutOrderId(store.id);
    if (!remembered) return;
    clearLastCheckoutOrderId(store.id);
    navigateToBuyerStoreOrderDetail(remembered, router);
  }, [cart.hydrated, store?.id, lines.length, router]);

  useEffect(() => {
    const { entries } = loadDeliveryAddressBook();
    if (entries.length > 0) {
      setLegacyLsNoticeCount(entries.length);
      clearDeliveryAddressBookStorage();
    }
    setAddressBookHydrated(true);
  }, []);

  useEffect(() => {
    userPickedDeliveryAddressRef.current = false;
  }, [storeSlug]);

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

  const profileLinkedAddressRow = useMemo((): UserAddressDTO | null => {
    const id = profileSnap?.userAddressId?.trim();
    if (!id) return null;
    return savedAddresses.find((a) => a.id === id) ?? null;
  }, [profileSnap?.userAddressId, savedAddresses]);

  const profileAddressFallbackParts = useMemo(() => {
    if (!profileSnap || profileLinkedAddressRow) return null;
    const primaryLines: string[] = [];
    const region = getLocationLabelIfValid(profileSnap.region, profileSnap.city)?.trim();
    if (region) primaryLines.push(region);
    if (profileSnap.freeSummaryLine.trim()) primaryLines.push(profileSnap.freeSummaryLine.trim());
    const detailLine = profileSnap.addressDetail.trim() || null;
    return { primaryLines, detailLine };
  }, [profileSnap, profileLinkedAddressRow]);

  const resolvedCheckoutGeo = useMemo(() => {
    const savedId = parseUserAddressIdFromDeliverySelection(selectedAddressId);
    const row =
      selectedAddressId === PROFILE_DELIVERY_SELECTION_ID
        ? profileLinkedAddressRow
        : savedId
          ? (savedAddresses.find((x) => x.id === savedId) ?? null)
          : null;
    if (row) return resolveCheckoutDeliveryGeoFromUserAddress(row);

    if (selectedAddressId === PROFILE_DELIVERY_SELECTION_ID && profileSnap) {
      const rid = profileSnap.region.trim();
      const cid = profileSnap.city.trim();
      if (rid && cid && getLocationLabelIfValid(rid, cid)) {
        const norm = normalizeStoreAddressPh({
          region: rid,
          city: cid,
          address1: profileSnap.freeSummaryLine.trim() || getLocationLabelIfValid(rid, cid) || "",
          address2: profileSnap.addressDetail.trim(),
        });
        if (norm.region && norm.city && norm.address1) {
          return {
            regionId: norm.region,
            cityId: norm.city,
            summaryLine: norm.address1,
            detailLine: norm.address2 ?? "",
          };
        }
      }
    }
    return null;
  }, [selectedAddressId, profileLinkedAddressRow, savedAddresses, profileSnap]);

  const region = resolvedCheckoutGeo?.regionId ?? "";
  const city = resolvedCheckoutGeo?.cityId ?? "";
  const addressDetail = resolvedCheckoutGeo?.detailLine ?? "";
  const summaryForSubmit = useMemo(
    () =>
      resolvedCheckoutGeo?.summaryLine.trim() ||
      getLocationLabelIfValid(region, city)?.trim() ||
      "",
    [resolvedCheckoutGeo?.summaryLine, region, city]
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
      delivery_region: region.trim(),
      delivery_city: city.trim(),
      delivery_user_address_id: deliveryUserAddressIdForSubmit ?? "",
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
    region,
    city,
    deliveryUserAddressIdForSubmit,
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
    if (fulfillment !== "local_delivery") {
      setGlobalRideTimeSource("store");
      return;
    }
    let cancelled = false;
    scheduleStoreCartIdleTask(() => {
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
    });
    return () => {
      cancelled = true;
    };
  }, [fulfillment]);

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
      ? Boolean(deliveryUserAddressIdForSubmit) && isCheckoutDeliveryGeoReady(resolvedCheckoutGeo)
      : isCheckoutDeliveryGeoReady(resolvedCheckoutGeo);

  /** 장바구니 카드 — `+63 956 188 6313` */
  const formattedPhoneDisplay = useMemo(() => {
    const d = parsePhMobileInput(buyerPhone);
    if (d.length === 0) return "";
    return formatPhMobileDisplayPlus63(d);
  }, [buyerPhone]);

  const applyCheckoutBuyerPhone = useCallback(
    (sources: {
      selectedAddressPhone?: string | null;
      defaultDeliveryPhone?: string | null;
      checkoutContactPhone?: string | null;
    }) => {
      setBuyerPhone((prev) =>
        resolveStoreCheckoutBuyerPhoneDigits({
          ...sources,
          profilePhone: profilePhoneDigitsRef.current,
          currentDigits: prev,
        })
      );
    },
    []
  );

  const bootstrapCheckoutIdentity = useCallback(async () => {
    const gen = ++checkoutContactFetchGenRef.current;
    const cachePaint = readStoreCartCheckoutCachePaint();
    if (cachePaint.cachedAddresses?.length) {
      setSavedAddresses(cachePaint.cachedAddresses);
    }
    if (cachePaint.profileDigits) {
      profilePhoneDigitsRef.current = cachePaint.profileDigits;
      applyCheckoutBuyerPhone({ checkoutContactPhone: cachePaint.profileDigits });
      setCheckoutContactReady(true);
    }
    try {
      const profilePeek = peekMeProfileCached();
      const [contactRes, profileRes, addressRes] = await Promise.all([
        runSingleFlight("me:checkout-contact:get", () =>
          fetch("/api/me/checkout-contact", { credentials: "include" })
        ),
        profilePeek ? Promise.resolve(profilePeek) : fetchMeProfileDeduped(),
        fetchMeAddressesListSingleFlight(),
      ]);

      if (gen !== checkoutContactFetchGenRef.current) return;

      if (addressRes.ok) {
        setSavedAddresses(addressRes.rows);
        if (addressRes.rows.length > 0) writeCachedMeAddressList(addressRes.rows);
      } else if (!cachePaint.cachedAddresses?.length) {
        setSavedAddresses([]);
      }

      let profileDigits = "";
      const profileJson = profileRes.json as { ok?: boolean; profile?: ProfileRow | null };
      if (profileRes.status >= 200 && profileRes.status < 300 && profileJson?.ok && profileJson.profile) {
        profileDigits = parsePhMobileInput(resolveProfilePhoneDb09(profileJson.profile) ?? "");
      }
      profilePhoneDigitsRef.current = profileDigits;

      const json = (await contactRes.json()) as {
        ok?: boolean;
        contact_phone?: string | null;
        profile_phone?: string | null;
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

      if (!json.ok) {
        setProfileSnap(null);
        applyCheckoutBuyerPhone({ checkoutContactPhone: profileDigits });
        return;
      }

      const contactPhone = parsePhMobileInput(
        json.contact_phone ?? json.profile_phone ?? profileDigits ?? ""
      );
      const dd = json.default_delivery;

      if (dd?.user_address_id) {
        const snap: ProfileContactSnap = {
          userAddressId: dd.user_address_id,
          phone: parsePhMobileInput(dd.phone ?? contactPhone),
          region: dd.app_region_id ?? "",
          city: dd.app_city_id ?? "",
          freeSummaryLine: (dd.summary_line ?? "").trim(),
          addressDetail: (dd.address_detail ?? "").trim(),
        };
        setProfileSnap(snap);
        applyCheckoutBuyerPhone({
          defaultDeliveryPhone: dd.phone ?? contactPhone,
          checkoutContactPhone: contactPhone,
        });
        return;
      }

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
        phone: contactPhone,
        region: nextRegion,
        city: nextCity,
        freeSummaryLine: nextFree,
        addressDetail: nextDetail,
      };
      setProfileSnap(snap);
      applyCheckoutBuyerPhone({ checkoutContactPhone: contactPhone });
    } catch {
      if (gen === checkoutContactFetchGenRef.current) setProfileSnap(null);
    } finally {
      if (gen === checkoutContactFetchGenRef.current) setCheckoutContactReady(true);
    }
  }, [applyCheckoutBuyerPhone]);

  useEffect(() => {
    if (!checkoutContactReady || !needsAddressAndPhone) return;
    const savedId = parseUserAddressIdFromDeliverySelection(selectedAddressId);
    const row = savedId ? savedAddresses.find((a) => a.id === savedId) : undefined;
    applyCheckoutBuyerPhone({
      selectedAddressPhone: row?.phoneNumber ?? null,
      checkoutContactPhone: profileSnap?.phone ?? null,
    });
  }, [
    checkoutContactReady,
    needsAddressAndPhone,
    selectedAddressId,
    savedAddresses,
    profileSnap?.phone,
    applyCheckoutBuyerPhone,
  ]);

  /** 결제 폼이 보일 때만 연락처·주소 부트스트랩(빈 장바구니 3-way fetch 방지) */
  useEffect(() => {
    if (!cart.hydrated || lines.length === 0) return;
    void bootstrapCheckoutIdentity();
  }, [cart.hydrated, lines.length, bootstrapCheckoutIdentity]);

  useLayoutEffect(() => {
    if (!checkoutConfirmOpen) return;
    scrollAppShellForStoreCheckoutConfirm(checkoutFooterRef.current);
  }, [checkoutConfirmOpen]);

  useEffect(() => {
    const onAddressesUpdated = () => {
      if (lines.length === 0) return;
      void bootstrapCheckoutIdentity();
    };
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [bootstrapCheckoutIdentity, lines.length]);

  useEffect(() => {
    if (!addressBookHydrated) return;
    setSelectedAddressId((sel) => {
      const defaultSel = resolveCartDefaultDeliverySelectionId(savedAddresses, profileSnap);
      if (userPickedDeliveryAddressRef.current) {
        if (isCartDeliverySelectionValid(sel, savedAddresses, profileSnap)) return sel;
        return defaultSel;
      }
      if (defaultSel) return defaultSel;
      if (isCartDeliverySelectionValid(sel, savedAddresses, profileSnap)) return sel;
      return null;
    });
  }, [addressBookHydrated, profileSnap, savedAddresses]);

  const selectDeliveryAddressId = useCallback((selectionId: string) => {
    userPickedDeliveryAddressRef.current = true;
    setSelectedAddressId(selectionId);
  }, []);

  useEffect(() => {
    if (!store) return;
    const del = deliveryFulfillmentMode;
    setFulfillment((prev) => {
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

  const ownerOrderBlocked = store?.can_order_store === false;
  const ownerOrderBlockedMessage = store?.owner_block_message ?? OWN_STORE_ORDER_BLOCK_MESSAGE;
  const checkoutBlocked =
    ownerOrderBlocked || (frontCommerce != null && !frontCommerce.isOpenForCommerce);

  const navigateToStoreMenu = useCallback(async () => {
    const slugFromStore = store?.slug?.trim();
    const slugFromCart = cartBucket?.storeSlug?.trim();
    const slug = slugFromStore || slugFromCart || storeSlug.trim();
    if (slug) {
      markStoreDetailMenuTabsLanding();
      router.push(`/stores/${encodeURIComponent(slug)}`, { scroll: false });
      return;
    }
    const sid = store?.id?.trim() || cartBucket?.storeId?.trim();
    if (sid) {
      try {
        const { json } = await fetchStoreSummaryDeduped(storeSlug);
        const j = json as { ok?: boolean; store?: { slug?: string } };
        const resolved = j?.ok && j.store?.slug?.trim() ? j.store.slug.trim() : "";
        if (resolved) {
          markStoreDetailMenuTabsLanding();
          router.push(`/stores/${encodeURIComponent(resolved)}`, { scroll: false });
          return;
        }
      } catch {
        /* fallback */
      }
    }
    router.push("/stores");
  }, [store, cartBucket, storeSlug, router]);

  /** Hooks must run before any `return` below — Rules of Hooks */
  const deliveryFeeSummaryLabel = useMemo(() => {
    if (fulfillment !== "local_delivery") return formatMoneyPhp(0);
    if (commerce.deliveryFeeMode === "courier") {
      const label = commerce.deliveryCourierLabel?.trim();
      return label ? `착불 · ${label}` : "착불";
    }
    if (commerce.deliveryFeeMode === "self_free_promo") {
      return (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <span className="text-[13px] font-semibold text-[#2563EB]">배달비 무료 적용 중</span>
            {commerce.deliveryFeeStrikeReferencePhp != null &&
            commerce.deliveryFeeStrikeReferencePhp > 0 ? (
              <span className="text-[13px] font-medium text-[#999] line-through">
                {formatMoneyPhp(commerce.deliveryFeeStrikeReferencePhp)}
              </span>
            ) : null}
          </span>
          <span>{formatMoneyPhp(deliveryFeeForCheckout)}</span>
        </span>
      );
    }
    return formatMoneyPhp(deliveryFeeForCheckout);
  }, [commerce, deliveryFeeForCheckout, fulfillment]);

  const openProductSheet = useCallback(
    (productId: string, editCartLine?: StoreCommerceCartLine) => {
      if (!store) return;
      openStoreProductSheetFromCart({
        store: {
          id: store.id,
          store_name: store.store_name,
          slug: store.slug,
          profile_image_url: store.profile_image_url,
          business_hours_json: store.business_hours_json,
          is_open: store.is_open,
          delivery_available: store.delivery_available,
          pickup_available: store.pickup_available,
        },
        productId,
        editCartLine: editCartLine ?? null,
      });
    },
    [store]
  );

  async function submitOrder() {
    if (!store || lines.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr("네트워크에 연결된 뒤 다시 주문해 주세요.");
      return;
    }
    if (busy || orderSubmitFlightRef.current) return;
    if (ownerOrderBlocked) {
      setErr(ownerOrderBlockedMessage);
      return;
    }
    if (frontCommerce && !frontCommerce.isOpenForCommerce) {
      setErr(
        frontCommerce.inBreak
          ? t("common_break_time_order_blocked", { time: frontCommerce.breakRangeLabel })
          : t("common_preparing_order_blocked")
      );
      return;
    }
    if (!meetsMin) {
      setErr(`최소 주문 금액 ${formatMoneyPhp(minOrderPhp)} 이상으로 맞춰 주세요.`);
      return;
    }
    if (fulfillment === "pickup" && !offerPickup) {
      setErr("이 매장·장바구니 조합에서는 포장 픽업을 선택할 수 없습니다.");
      return;
    }
    if (fulfillment === "local_delivery" && !offerDelivery) {
      setErr("이 매장에서는 배달을 제공하지 않습니다. 수령 방식을 바꿔 주세요.");
      return;
    }
    if (fulfillment === "shipping" && !offerShip) {
      setErr("장바구니 품목 중 배달(배송)이 불가한 상품이 있습니다.");
      return;
    }
    if (region && !city) {
      setErr(
        "주소: 지역만 고른 배달주소는 주문할 수 없습니다. 해당 항목을 삭제한 뒤 배송지 추가에서 동네까지 선택해 주세요."
      );
      return;
    }
    if (needsAddressAndPhone && !isCompletePhMobile(buyerPhone)) {
      setErr(t("common_enter_contact", { placeholder: PH_LOCAL_09_PLACEHOLDER }));
      return;
    }
    if (needsAddressAndPhone && !resolvedCheckoutGeo) {
      setErr(
        "배달: 마이페이지 주소를 확인하거나 배송지 추가 후, 라디오로 배달 주소를 선택해 주세요."
      );
      return;
    }
    if (fulfillment === "local_delivery" && !deliveryUserAddressIdForSubmit) {
      setErr("배달: 저장된 주소를 선택해 주세요. 주소 관리를 통해 검색 주소를 저장한 뒤 주문할 수 있습니다.");
      return;
    }
    if (needsAddressAndPhone && !deliveryAddressReady) {
      setErr(
        resolvedCheckoutGeo && summaryForSubmit.trim().length >= 3
          ? "배달 지역(지역/도시)을 선택해 주세요. 주소 관리에서 Google 주소를 저장할 때 동네·도시가 맞는지 확인해 주세요."
          : `배달: 선택한 배달주소에 지역·동네 또는 ${STORE_ADDRESS_STREET_LABEL}(3자 이상)이 필요합니다. 다른 배달주소를 선택하거나 마이페이지에서 주소를 저장해 주세요.`
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
      ? formatPhMobileDisplayPlus63(phoneDigits)
      : phoneDigits.length > 0
        ? `${formatPhMobileDisplayPlus63(phoneDigits)} (입력 미완성)`
        : "(미입력)";
    const addrDisp =
      [summaryForSubmit, addressDetail.trim()].filter(Boolean).join("\n") || "(미입력)";
    const payLabel =
      checkoutPaymentOptions.find((o) => o.id === selectedPaymentMethod)?.label ?? selectedPaymentMethod;
    const grandForConfirm =
      fulfillment === "local_delivery" ? paymentGrandTotalPhp : pickupGrandTotalPhp;
    setCheckoutConfirmPayload({
      phoneLabel: phoneDisp,
      addressLabel: addrDisp,
      paymentLabel: payLabel,
      orderSummaryLabel: buildStoreCheckoutOrderSummaryLabel(lines, grandForConfirm),
      requestLabel: buildStoreCheckoutRequestLabel(buyerNote),
    });
    setCheckoutConfirmOpen(true);
  }

  async function submitOrderConfirmed() {
    if (!store || lines.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setErr("네트워크에 연결된 뒤 다시 주문해 주세요.");
      return;
    }
    if (busy || orderSubmitFlightRef.current) return;
    setCheckoutConfirmOpen(false);
    setCheckoutConfirmPayload(null);

    setErr(null);
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
            /** 서버 `validate-store-order-checkout` — 스냅샷 단가와 DB 재계산 단가 대조 */
            client_unit_php: Math.max(0, Math.floor(Number(l.unitPricePhp) || 0)),
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
        message?: string;
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
        const apiMessage =
          typeof orderJson.message === "string" && orderJson.message.trim() ?
            orderJson.message.trim()
          : null;
        setErr(
          apiMessage ??
            (code === "insufficient_stock"
              ? "재고가 부족합니다. 장바구니를 수정한 뒤 다시 시도해 주세요."
              : code === "cannot_order_own_store"
                ? "본인 매장은 주문할 수 없습니다."
                : code === "store_closed"
                  ? "지금은 준비 중이라 주문할 수 없습니다."
                  : code === "below_min_order"
                    ? "최소 주문 금액에 맞지 않습니다. 장바구니 금액을 늘린 뒤 다시 시도해 주세요."
                    : code === "delivery_address_required"
                      ? "배달·배송 주소를 입력해 주세요."
                      : code === "client_unit_php_required" || code === "price_changed"
                        ? "메뉴 가격이 변경되어 장바구니를 다시 확인해 주세요."
                        : code === "delivery_region_city_required"
                          ? "배달 지역(지역/도시)을 선택해 주세요. 주소 관리에서 Google 주소를 저장할 때 동네·도시가 맞는지 확인해 주세요."
                          : code === "store_pickup_disabled"
                          ? "이 매장은 포장 픽업 주문을 받지 않습니다. 수령 방식을 바꿔 주세요."
                          : code === "store_delivery_disabled"
                            ? "이 매장은 배달을 제공하지 않습니다. 수령 방식을 바꿔 주세요."
                            : code === "payment_method_required" || code === "payment_method_invalid"
                              ? "결제 방법을 확인해 주세요. 매장에서 허용한 수단만 선택할 수 있습니다."
                              : `주문에 실패했습니다. (${code})`)
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
      if (!oid) {
        setErr("주문은 접수됐지만 상세 화면으로 이동할 수 없습니다. 주문 내역에서 확인해 주세요.");
        return;
      }

      setLastCheckoutOrderId(store.id, oid);
      try {
        sessionStorage.setItem(`dibay:buyer_order_placed_wall:${oid}`, String(Date.now()));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
      navigateToBuyerStoreOrderDetail(oid, router);
      cart.clearStoreCart(store.id);
    } catch {
      dibayPerfOnOrderApiDone(store.id);
      setErr(t("common_network_error_generic"));
    } finally {
      orderSubmitFlightRef.current = false;
      setBusy(false);
    }
  }

  /**
   * ── JSX 분기 return (이 줄 아래) ──
   * useState / useEffect / useMemo / useCallback / useRef / useLayoutEffect 추가 금지.
   * (Rules of Hooks — 과거 useMemo를 여기 두었다가 런타임 크래시 발생)
   */
  if (!cart.hydrated) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  if (storeLoading && !store && lines.length > 0) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  if ((storeLoadFailed || !store) && lines.length === 0) {
    return (
      <StoreCommerceCartPageShell>
        <p className="px-4 py-12 text-center text-sm text-sam-muted">{t("common_store_info_load_failed")}</p>
        <div className="px-4 text-center">
          <Link href="/stores" className="text-sm font-medium text-signature">
            {t("common_store")}
          </Link>
        </div>
      </StoreCommerceCartPageShell>
    );
  }

  if (lines.length === 0) {
    return (
      <StoreCommerceCartPageShell header={<StoreBaeminCartTopBar onBack={() => router.back()} />}>
        <div className="px-4 py-10">
          <div className="text-center">
            <p className="sam-text-body-lg font-semibold text-sam-fg">장바구니가 비어 있어요</p>
            <p className="mt-1 sam-text-body text-sam-muted">먹고 싶은 가게를 찾아보세요</p>
          </div>
          {otherBuckets.length > 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 sam-text-body-secondary leading-relaxed text-amber-950">
              <p className="font-medium text-amber-950">
                다른 매장(
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
                ) 장바구니가 있습니다. 해당 매장 장바구니를 비우거나 주문한 뒤 이 매장을 이용해 주세요.
              </p>
              <ul className="mt-3 space-y-2">
                {otherBuckets.map((b) => (
                  <li key={b.storeId} className="flex flex-wrap items-center gap-2">
                    <span className="sam-text-helper text-amber-900/90">
                      {b.storeName} · 상품 {b.itemCount}종 · {formatMoneyPhp(b.subtotalPhp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.clearStoreCart(b.storeId)}
                      className="sam-text-helper font-semibold text-red-700 underline"
                    >
                      이 매장 비우기
                    </button>
                    <Link
                      href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                      className="sam-text-helper font-semibold text-signature underline"
                    >
                      장바구니 열기
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
                가게 둘러보기
              </Link>
            ) : null}
            {store?.slug || storeSlug ? (
              <Link
                href={`/stores/${encodeURIComponent(store?.slug ?? storeSlug)}`}
                className="sam-text-body text-sam-muted underline"
              >
                {store?.store_name ?? storeSlug} 메뉴 보기
              </Link>
            ) : null}
          </div>
        </div>
      </StoreCommerceCartPageShell>
    );
  }

  if (!store) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>
    );
  }

  const fulfillmentOptions: { value: Fulfillment; label: string }[] = [];
  if (deliveryFulfillmentMode) {
    fulfillmentOptions.push({ value: deliveryFulfillmentMode, label: t("common_delivery_label") });
  }
  if (offerPickup) fulfillmentOptions.push({ value: "pickup", label: t("common_pickup_label") });

  const displayGrand =
    fulfillment === "local_delivery" ? paymentGrandTotalPhp : pickupGrandTotalPhp;

  const checkoutStrikeGrand =
    discountAmountPhp > 0
      ? fulfillment === "local_delivery"
        ? listSubtotalPhp + deliveryFeeForCheckout
        : listSubtotalPhp
      : null;

  const checkoutPromoLine =
    discountAmountPhp > 0
      ? discountPercentOverall > 0
        ? `${discountPercentOverall}% 할인 ${formatMoneyPhp(discountAmountPhp)} 적용`
        : `할인 ${formatMoneyPhp(discountAmountPhp)} 적용`
      : null;

  const showFulfillmentHint =
    needsAddressAndPhone && checkoutContactReady && !deliveryAddressReady;

  return (
    <StoreCommerceCartPageShell
      header={<StoreBaeminCartTopBar onBack={() => router.back()} />}
      footer={
        <StoreCartCheckoutActionBar
          ref={checkoutFooterRef}
          displayGrand={displayGrand}
          strikeGrand={checkoutStrikeGrand}
          promoLine={checkoutPromoLine}
          busy={busy}
          submitDisabled={!meetsMin || fulfillmentOptions.length === 0 || checkoutBlocked}
          disabledReason={ownerOrderBlocked ? ownerOrderBlockedMessage : null}
          processingLabel={t("common_processing")}
          onSubmit={() => void submitOrder()}
        />
      }
    >

      <StoreBaeminCartStoreBlock
        store={store}
        lines={lines}
        busy={busy}
        noneLabel={t("common_none")}
        deleteLabel={t("common_delete")}
        onRequestClear={() => setClearCartConfirmOpen(true)}
        onBackToStore={() => void navigateToStoreMenu()}
        onRemoveLine={(lineId) => cart.removeLine(lineId)}
        onChangeOptions={(line) => openProductSheet(line.productId, line)}
        onDecreaseQty={(line) => cart.updateLineQuantity(line.lineId, line.qty - 1)}
        onIncreaseQty={(line) => cart.updateLineQuantity(line.lineId, line.qty + 1)}
      />

      <StoreBaeminCartOrderSummaryCard
        subtotalPhp={subtotalPhp}
        discountAmountPhp={discountAmountPhp}
        discountPercentOverall={discountPercentOverall}
        fulfillmentIsDelivery={fulfillment === "local_delivery"}
        deliveryFeeLabel={deliveryFeeSummaryLabel}
        displayGrand={displayGrand}
        minOrderPhp={minOrderPhp}
        meetsMin={meetsMin}
        minShortage={minShortage}
        showFreeDeliveryProgress={showFreeDeliveryProgress}
        freeDeliveryThresholdPhp={freeDeliveryThresholdPhp}
        freeDeliveryProgressPct={freeDeliveryProgressPct}
        freeDeliveryMet={freeDeliveryMet}
      />

      <StoreBaeminCartFulfillmentHint show={showFulfillmentHint} />

      {otherBuckets.length > 0 ? (
        <div className={`${BAEMIN_CART_SECTION_CARD_CLASS} px-4 py-3 text-[13px] text-[#888]`}>
          다른 매장 장바구니도 있습니다. 해당 매장 페이지에서 장바구니를 열 수 있어요.
        </div>
      ) : null}

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
          orderSummaryLabel={checkoutConfirmPayload.orderSummaryLabel}
          requestLabel={checkoutConfirmPayload.requestLabel}
          busy={busy}
          onCancel={() => {
            setCheckoutConfirmOpen(false);
            setCheckoutConfirmPayload(null);
          }}
          onConfirm={() => void submitOrderConfirmed()}
        />
      ) : null}

      <div className={BAEMIN_CART_SECTION_CARD_CLASS}>
        <div className={BAEMIN_CART_CHECKOUT_INNER_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
          <div className="min-w-0 sm:max-w-[8.5rem] sm:shrink-0">
            <p className="sam-text-body font-medium text-sam-muted">수령 방식</p>
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
                  이 매장의 「서비스 형태」에서 포장 픽업과 배달이 모두 꺼져 있거나, 담긴 상품과 맞지 않아 수령
                  방식을 고를 수 없습니다. 매장 설정을 확인하거나 항목을 조정한 뒤 다시 시도해 주세요.
                </p>
              ) : (
                <p className="mt-2 sam-text-helper leading-snug text-amber-800">
                  담긴 상품은 포장 픽업·배달 모두 불가로 표시되어 있습니다. 항목을 삭제한 뒤 다시 담아 주세요.
                </p>
              )
            ) : null}
          </div>
          <div
            className={`min-w-0 flex-1 ${BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS} sm:border-t-0 sm:border-l sm:border-[var(--delivery-border-section)] sm:pt-0 sm:pl-4`}
          >
            <p className="sam-text-body font-medium text-sam-muted">
              결제 방법 <span className="text-red-600">*</span>
            </p>
            <div
              className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="radiogroup"
              aria-label="결제 방법"
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
            <p className="sam-text-helper font-semibold text-sky-950">픽업 장소 (매장 주소)</p>
            <p className="mt-1 sam-text-xxs leading-snug text-sky-900/85">
              이 주소에서 수령합니다. 배달을 고르면 아래에 입력하는 주소가 배달지로 전달됩니다.
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
                매장 정보
              </Link>
            : null}
          </div>
        ) : fulfillment === "pickup" && offerPickup ? (
          <p className="rounded-ui-rect border border-amber-100 bg-amber-50/80 px-3 py-2 sam-text-helper text-amber-950">
            매장 주소가 비어 있어 픽업 장소를 표시할 수 없습니다. 사장님 메뉴에서 매장 기본 정보를
            등록해 주세요.
          </p>
        ) : null}

        <div
          className={`${BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS} ${
            needsAddressAndPhone ? "flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4" : ""
          }`}
        >
          <div className={needsAddressAndPhone ? "min-w-0 sm:max-w-[13rem] sm:shrink-0" : undefined}>
            <p className="sam-text-body font-medium text-sam-muted">
              연락처
              {fulfillment === "pickup" ? (
                <span className="font-normal text-sam-meta"> (선택)</span>
              ) : (
                <span className="text-red-600"> *</span>
              )}
            </p>
            {checkoutContactReady && !isCompletePhMobile(buyerPhone) ? (
              <div className="mt-2 space-y-1">
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={formatPhMobileDisplayPlus63(buyerPhone)}
                  onChange={(e) => setBuyerPhone(parsePhMobileInput(e.target.value))}
                  disabled={busy}
                  placeholder={PH_LOCAL_09_PLACEHOLDER}
                  className="w-full max-w-[16rem] rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body tabular-nums text-sam-fg"
                  aria-label="주문 연락처"
                />
                <p className="sam-text-xxs leading-snug text-sam-muted">
                  프로필에 저장된 번호가 없으면 여기에 입력하거나{" "}
                  <Link href="/mypage/account" className="font-medium text-signature underline">
                    계정 정보
                  </Link>
                  에서 등록해 주세요.
                </p>
              </div>
            ) : (
              <p className="mt-2 sam-text-body-lg font-medium tabular-nums tracking-tight text-sam-fg">
                {formattedPhoneDisplay || "—"}
              </p>
            )}
          </div>

          {needsAddressAndPhone ? (
            <div
              className={`min-w-0 flex-1 ${BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS} sm:border-t-0 sm:border-l sm:border-[var(--delivery-border-section)] sm:pt-0 sm:pl-4`}
            >
            <p className="sam-text-body font-medium text-sam-muted">
              배송지 <span className="text-red-600">*</span>
            </p>
            <ul className={BAEMIN_CART_ADDRESS_LIST_CLASS}>
              {!checkoutContactReady ? (
                <li className={`${BAEMIN_CART_ADDRESS_ROW_CLASS} bg-[#FAFAFA]`}>
                  <p className="sam-text-helper text-sam-muted">배달 주소 정보를 불러오는 중입니다…</p>
                </li>
              ) : null}
              {checkoutContactReady && !profileSnap && savedAddresses.length === 0 ? (
                <li className={`${BAEMIN_CART_ADDRESS_ROW_CLASS} bg-amber-50/80`}>
                  <p className="sam-text-helper leading-snug text-amber-950">
                    로그인하면 마이페이지에 저장한 배달 주소를 여기서 선택할 수 있습니다.
                  </p>
                </li>
              ) : null}
              {checkoutContactReady && legacyLsNoticeCount > 0 ? (
                <li className={`${BAEMIN_CART_ADDRESS_ROW_CLASS} bg-sky-50/80`}>
                  <p className="sam-text-helper leading-snug text-sky-950">
                    예전 장바구니에만 있던 배송지 {legacyLsNoticeCount}건은 저장되지 않습니다.{" "}
                    <Link href="/mypage/addresses" className="font-semibold text-signature underline">
                      주소 관리
                    </Link>
                    에서 Google 검색 주소를 저장한 뒤 다시 선택해 주세요.
                  </p>
                </li>
              ) : null}
              {checkoutContactReady && profileSnap ? (
                <li
                  className={`${BAEMIN_CART_ADDRESS_ROW_CLASS} ${
                    selectedAddressId === PROFILE_DELIVERY_SELECTION_ID
                      ? BAEMIN_CART_ADDRESS_ROW_SELECTED_CLASS
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="cart-delivery-addr"
                      className="mt-1"
                      checked={selectedAddressId === PROFILE_DELIVERY_SELECTION_ID}
                      onChange={() => {
                        selectDeliveryAddressId(PROFILE_DELIVERY_SELECTION_ID);
                        applyCheckoutBuyerPhone({
                          checkoutContactPhone: profileSnap?.phone ?? profilePhoneDigitsRef.current,
                        });
                      }}
                      aria-label={
                        profileLinkedAddressRow
                          ? `${getUserAddressDesignationPlainText(profileLinkedAddressRow)}, 배달 주소 선택`
                          : "마이페이지 배달 주소 선택"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <StoreCartCheckoutAddressRowBody
                        row={profileLinkedAddressRow}
                        profileFallback={profileAddressFallbackParts}
                        emptyFallback="마이페이지에 저장된 배달 주소가 없습니다. 프로필에서 입력하거나 주소 관리에서 저장 주소를 추가하세요."
                      />
                      {!profileDeliveryReady && profileAddressBodyText ? (
                        <p className="mt-1.5 sam-text-xxs leading-snug text-amber-800">
                          주문 전 지역·주소 한 줄이 3자 이상인지 확인해 주세요.
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
                  const isSel = selectedAddressId === selectionId;
                  return (
                    <li
                      key={a.id}
                      className={`${BAEMIN_CART_ADDRESS_ROW_CLASS} ${
                        isSel ? BAEMIN_CART_ADDRESS_ROW_SELECTED_CLASS : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="cart-delivery-addr"
                          className="mt-1"
                          checked={isSel}
                          onChange={() => {
                            selectDeliveryAddressId(selectionId);
                            applyCheckoutBuyerPhone({ selectedAddressPhone: a.phoneNumber ?? null });
                          }}
                          aria-label={`${getUserAddressDesignationPlainText(a)}, 저장 주소 ${idx + 1} 선택`}
                        />
                        <div className="min-w-0 flex-1">
                          <StoreCartCheckoutAddressRowBody row={a} emptyFallback="—" />
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
                주소 관리에서 저장
              </Link>
            </div>
            {!deliveryAddressReady && checkoutContactReady && (profileSnap || savedAddresses.length > 0) ? (
              <p className="mt-2 sam-text-xxs leading-snug text-amber-800">
                {resolvedCheckoutGeo && summaryForSubmit.trim().length >= 3
                  ? "배달 지역(지역/도시)을 확인할 수 없습니다. 주소 관리에서 주소를 다시 저장하거나 동네·도시를 맞춰 주세요."
                  : `선택한 배송지 내용을 확인해 주세요. 지역·동네 또는 ${STORE_ADDRESS_STREET_LABEL}(3자 이상)이 필요합니다.`}
              </p>
            ) : null}
            {checkoutContactReady && profileSnap && !profileDeliveryReady && savedAddresses.length === 0 ? (
              <p className="mt-2 sam-text-xxs leading-snug text-amber-800">
                마이페이지 주소가 비어 있거나 너무 짧습니다. 프로필에서 입력을 마치거나{" "}
                <Link href="/mypage/addresses" className="font-semibold underline">
                  주소 관리
                </Link>
                에서 저장 주소를 추가해 주세요.
              </p>
            ) : null}
            {fulfillment === "local_delivery" && deliveryAddressReady ? (
              <div className="mt-2">
                {globalRideTimeSource === "store" ? (
                  storeModeStaticEtaLabel && storeModeStaticEtaLabel.trim() ? (
                    <p className="sam-text-xxs font-semibold leading-snug text-sam-fg">
                      예상 도착(참고): {storeModeStaticEtaLabel}
                      <span className="ml-1 font-normal text-sam-muted">매장 입력·조리 안내 기준</span>
                    </p>
                  ) : (
                    <p className="sam-text-xxs leading-snug text-sam-muted">
                      매장 설정에서 수기 배달 시간을 입력하면 여기에 표시됩니다.
                    </p>
                  )
                ) : deliveryEtaLabel ? (
                  <p className="sam-text-xxs font-semibold leading-snug text-sam-fg">
                    예상 도착(참고): {deliveryEtaLabel}
                    <span className="ml-1 font-normal text-sam-muted">오토바이 경로 기준</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={busy || deliveryEtaBusy}
                    onClick={() => void loadDeliveryEtaPreview()}
                    className="sam-text-xxs font-semibold leading-snug text-sam-fg underline decoration-sam-muted underline-offset-2 disabled:opacity-50"
                  >
                    예상 도착(참고) 확인
                  </button>
                )}
              </div>
            ) : null}
            </div>
          ) : null}
        </div>
        <div className={BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS}>
          <label htmlFor="cart-buyer-note" className="sam-text-body font-medium text-sam-muted">
            요청 사항 (선택)
          </label>
          <textarea
            id="cart-buyer-note"
            rows={2}
            value={buyerNote}
            disabled={busy}
            onChange={(e) => setBuyerNote(e.target.value)}
            className="mt-2 w-full min-h-[96px] resize-none rounded-[4px] border border-[var(--delivery-border-section)] bg-white px-3 py-2.5 text-[14px] text-[#111] outline-none focus:border-[#2386B1] focus:ring-2 focus:ring-[#2386B1]/20 disabled:bg-[#F5F5F5]"
            maxLength={500}
          />
          <p className="mt-1 sam-text-xxs leading-snug text-sam-muted">
            입력하시면 매장 사장님 주문 관리 화면에 &apos;고객 요청 사항&apos;으로 표시됩니다.
          </p>
        </div>

        {fulfillment === "local_delivery" && commerce.deliveryCourierLabel?.trim() ? (
          <p className="sam-text-xxs leading-snug text-sam-muted">
            배달 업체(안내): {commerce.deliveryCourierLabel.trim()}
          </p>
        ) : null}
        {checkoutBlocked && frontCommerce ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper font-medium leading-snug text-amber-950">
            {frontCommerce.inBreak
              ? `준비중 · Break time: ${frontCommerce.breakRangeLabel}. 쉬는 시간에는 주문할 수 없습니다.`
              : "지금은 준비 중이라 주문할 수 없습니다."}
          </p>
        ) : null}
        {err ? (
          <p className="mb-2 sam-text-body-secondary text-red-600" role="alert">
            {err}
          </p>
        ) : null}
        </div>
      </div>
    </StoreCommerceCartPageShell>
  );
}
