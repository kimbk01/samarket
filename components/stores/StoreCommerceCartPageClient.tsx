"use client";

import type { ModifierSelectionsWire } from "@/lib/stores/modifiers/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { flushSync } from "react-dom";
import { useStoreCommerceCart } from "@/contexts/StoreCommerceCartContext";
import {
  parseCommerceExtrasFromHoursJson,
  resolveChargedDeliveryFeePhp,
} from "@/lib/stores/store-commerce-extras";
import { resolveStoreFrontCommerceState } from "@/lib/stores/store-auto-hours";
import { LocationSelector } from "@/components/write/shared/LocationSelector";
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
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  clearLastCheckoutOrderId,
  getLastCheckoutOrderId,
  setLastCheckoutOrderId,
} from "@/lib/store-commerce/last-checkout-order-session";
import type { DeliveryAddressBookEntry } from "@/lib/store-commerce/delivery-address-book";
import {
  loadDeliveryAddressBook,
  newDeliveryAddressId,
  PROFILE_DELIVERY_SELECTION_ID,
  saveDeliveryAddressBook,
} from "@/lib/store-commerce/delivery-address-book";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import { checkoutPaymentOptionsForCart } from "@/lib/stores/payment-methods-config";
import {
  STORE_ADDRESS_DETAIL_LABEL,
  STORE_ADDRESS_STREET_LABEL,
  STORE_ADDRESS_STREET_HINT,
  STORE_ADDRESS_STREET_PLACEHOLDER,
} from "@/lib/stores/store-address-form-ui";
import {
  APP_TIER1_BAR_INNER_ALIGNED_CLASS,
  APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import {
  readStoreFulfillmentPref,
  writeStoreFulfillmentPref,
} from "@/lib/stores/store-fulfillment-pref";
import { formatStorePickupAddressLines } from "@/lib/stores/store-location-label";

type Fulfillment = "pickup" | "local_delivery" | "shipping";

type StoreHead = {
  id: string;
  store_name: string;
  slug: string;
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

type ProfileContactSnap = {
  phone: string;
  region: string;
  city: string;
  freeSummaryLine: string;
  addressDetail: string;
};

function deliveryEntryMatchesProfile(e: DeliveryAddressBookEntry, p: ProfileContactSnap): boolean {
  return (
    e.region === p.region &&
    e.city === p.city &&
    e.freeSummaryLine.trim() === p.freeSummaryLine.trim() &&
    e.addressDetail.trim() === p.addressDetail.trim()
  );
}

export function StoreCommerceCartPageClient({ storeSlug }: { storeSlug: string }) {
  const { t } = useI18n();
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
  const [err, setErr] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [hoursTick, setHoursTick] = useState(0);
  const [profileSnap, setProfileSnap] = useState<ProfileContactSnap | null>(null);
  const [checkoutContactReady, setCheckoutContactReady] = useState(false);

  const [addressBook, setAddressBook] = useState<DeliveryAddressBookEntry[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressBookHydrated, setAddressBookHydrated] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState("");
  const [modalCity, setModalCity] = useState("");
  const [modalFreeLine, setModalFreeLine] = useState("");
  const [modalDetail, setModalDetail] = useState("");
  const [modalLocationError, setModalLocationError] = useState<string | undefined>();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("cod");

  useEffect(() => {
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
        const res = await fetch(`/api/stores/${encodeURIComponent(storeSlug)}`, { cache: "no-store" });
        const json = await res.json();
        if (!json?.ok || !json.store) {
          if (!silent) {
            setStoreLoadFailed(true);
            setStore(null);
          }
          return;
        }
        setStoreLoadFailed(false);
        const s = json.store as Record<string, unknown>;
        const head: StoreHead = {
          id: s.id as string,
          store_name: s.store_name as string,
          slug: (s.slug as string) ?? storeSlug,
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
    setStore(null);
    setStoreLoadFailed(false);
    setStoreLoading(true);
    void loadStore();
  }, [loadStore]);

  useRefetchOnPageShowRestore(() => void loadStore({ silent: true }));

  const lines = store ? cart.getLinesForStoreId(store.id) : [];
  const subtotalPhp = store ? cart.getSubtotalForStoreId(store.id) : 0;

  const otherBuckets = store ? cart.otherBucketsExcluding(store.id) : [];

  const commerce = useMemo(
    () => parseCommerceExtrasFromHoursJson(store?.business_hours_json),
    [store?.business_hours_json]
  );

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
      setLastOrderId(null);
      return;
    }
    setLastOrderId((prev) => {
      const remembered = getLastCheckoutOrderId(store.id);
      return remembered ?? prev;
    });
  }, [cart.hydrated, store?.id, lines.length]);

  useEffect(() => {
    const { entries, selectedId } = loadDeliveryAddressBook();
    setAddressBook(entries);
    setSelectedAddressId(selectedId);
    setAddressBookHydrated(true);
  }, []);

  useEffect(() => {
    if (!addressBookHydrated) return;
    saveDeliveryAddressBook(addressBook, selectedAddressId);
  }, [addressBook, selectedAddressId, addressBookHydrated]);

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
    const e = addressBook.find((x) => x.id === selectedAddressId);
    if (!e) return null;
    return {
      region: e.region,
      city: e.city,
      freeSummaryLine: e.freeSummaryLine,
      addressDetail: e.addressDetail,
    };
  }, [selectedAddressId, profileSnap, addressBook]);

  const region = resolvedDelivery?.region ?? "";
  const city = resolvedDelivery?.city ?? "";
  const freeSummaryLine = resolvedDelivery?.freeSummaryLine ?? "";
  const addressDetail = resolvedDelivery?.addressDetail ?? "";

  const summaryForSubmit = useMemo(
    () => getLocationLabelIfValid(region, city)?.trim() || freeSummaryLine.trim(),
    [region, city, freeSummaryLine]
  );

  /** 배달 주문 시 지번·건물명 등(3자 이상) 또는 등록된 지역·동네 쌍 */
  const deliveryAddressReady = summaryForSubmit.trim().length >= 3;

  /** 장바구니 카드: 공백 없이 `09000000000` 형태 */
  const formattedPhoneDisplay = useMemo(() => {
    const d = parsePhMobileInput(buyerPhone);
    if (d.length === 0) return "—";
    return d;
  }, [buyerPhone]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/checkout-contact", { credentials: "include" });
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
        if (cancelled) return;
        if (!json.ok) {
          setProfileSnap(null);
          return;
        }
        const dd = json.default_delivery;
        if (dd?.user_address_id) {
          const phoneDigits = parsePhMobileInput(dd.phone ?? json.contact_phone ?? "");
          const snap: ProfileContactSnap = {
            phone: phoneDigits,
            region: dd.app_region_id ?? "",
            city: dd.app_city_id ?? "",
            freeSummaryLine: (dd.summary_line ?? "").trim(),
            addressDetail: (dd.address_detail ?? "").trim(),
          };
          if (cancelled) return;
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
          phone: phoneDigits,
          region: nextRegion,
          city: nextCity,
          freeSummaryLine: nextFree,
          addressDetail: nextDetail,
        };
        if (cancelled) return;
        setProfileSnap(snap);
        setBuyerPhone(snap.phone);
      } catch {
        if (!cancelled) setProfileSnap(null);
      } finally {
        if (!cancelled) setCheckoutContactReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 예전에 주소록에 복사해 둔 마이페이지 주소와 동일한 항목 제거(중복 방지) */
  useEffect(() => {
    if (!addressBookHydrated || !profileSnap) return;
    setAddressBook((prev) => {
      const next = prev.filter((e) => !deliveryEntryMatchesProfile(e, profileSnap));
      return next.length === prev.length ? prev : next;
    });
  }, [addressBookHydrated, profileSnap]);

  /** 선택 id가 사라졌거나 유효하지 않으면 마이페이지 주소 또는 첫 추가 항목으로 보정 */
  useEffect(() => {
    if (!addressBookHydrated) return;
    setSelectedAddressId((sel) => {
      if (sel === PROFILE_DELIVERY_SELECTION_ID && profileSnap) return sel;
      if (sel && addressBook.some((e) => e.id === sel)) return sel;
      if (profileDeliveryReady && profileSnap) return PROFILE_DELIVERY_SELECTION_ID;
      if (addressBook[0]?.id) return addressBook[0].id;
      if (profileSnap) return PROFILE_DELIVERY_SELECTION_ID;
      return null;
    });
  }, [addressBookHydrated, addressBook, profileDeliveryReady, profileSnap]);

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
  const showFreeDeliveryProgress =
    fulfillment === "local_delivery" &&
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

  function removeDeliveryAddress(id: string) {
    setAddressBook((prev) => {
      const next = prev.filter((e) => e.id !== id);
      setSelectedAddressId((sel) => {
        if (sel !== id) return sel;
        if (profileSnap) return PROFILE_DELIVERY_SELECTION_ID;
        return next[0]?.id ?? null;
      });
      return next;
    });
  }

  function openAddressModalAdd() {
    setModalRegion("");
    setModalCity("");
    setModalFreeLine("");
    setModalDetail("");
    setModalLocationError(undefined);
    setAddressModalOpen(true);
  }

  function closeAddressModal() {
    setAddressModalOpen(false);
    setModalLocationError(undefined);
  }

  function saveAddressModal() {
    if (modalRegion && !modalCity) {
      setModalLocationError("동네까지 선택해 주세요.");
      return;
    }
    const modalSummary =
      getLocationLabelIfValid(modalRegion, modalCity)?.trim() || modalFreeLine.trim();
    if (modalSummary.length < 3) {
      setModalLocationError(
        `지역·동네를 선택하거나 ${STORE_ADDRESS_STREET_LABEL}(3자 이상)을 입력해 주세요.`
      );
      return;
    }
    const newId = newDeliveryAddressId();
    setAddressBook((prev) => {
      const slotNum = prev.length + (profileSnap ? 2 : 1);
      const label = `배달주소 ${slotNum}`;
      return [
        ...prev,
        {
          id: newId,
          label,
          region: modalRegion,
          city: modalCity,
          freeSummaryLine: modalFreeLine,
          addressDetail: modalDetail,
        },
      ];
    });
    setSelectedAddressId(newId);
    setModalLocationError(undefined);
    setAddressModalOpen(false);
  }

  async function submitOrder() {
    if (!store || lines.length === 0) return;
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
    if (needsAddressAndPhone && !resolvedDelivery) {
      setErr(
        "배달: 마이페이지 주소를 확인하거나 배송지 추가 후, 라디오로 배달 주소를 선택해 주세요."
      );
      return;
    }
    if (needsAddressAndPhone && !deliveryAddressReady) {
      setErr(
        `배달: 선택한 배달주소에 지역·동네 또는 ${STORE_ADDRESS_STREET_LABEL}(3자 이상)이 필요합니다. 삭제 후 다시 추가하거나 다른 배달주소를 선택해 주세요.`
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
        ? `${formatPhMobileDisplay(phoneDigits)} (입력 미완성)`
        : "(미입력)";
    const addrDisp =
      [summaryForSubmit, addressDetail.trim()].filter(Boolean).join("\n") || "(미입력)";
    const payLabel =
      checkoutPaymentOptions.find((o) => o.id === selectedPaymentMethod)?.label ?? selectedPaymentMethod;
    if (
      !window.confirm(
        `주소·연락처·결제가 일치하나요?\n\n연락처: ${phoneDisp}\n주소:\n${addrDisp}\n결제: ${payLabel}\n\n이 내용으로 주문을 접수할까요?`
      )
    ) {
      return;
    }

    setErr(null);
    setLastOrderId(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/store-orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const json = await res.json();
      if (res.status === 401) {
        if (redirectForBlockedAction(router, t("common_login_required"), pathname || `/stores/${storeSlug}/cart`)) {
          return;
        }
        setErr(t("common_login_required"));
        return;
      }
      if (!json?.ok) {
        const code = typeof json?.error === "string" ? json.error : "order_failed";
        if (redirectForBlockedAction(router, code, pathname || `/stores/${storeSlug}/cart`)) {
          return;
        }
        setErr(
          code === "insufficient_stock"
            ? "재고가 부족합니다. 장바구니를 수정한 뒤 다시 시도해 주세요."
            : code === "cannot_order_own_store"
              ? "본인 매장은 주문할 수 없습니다."
              : code === "store_closed"
                ? "지금은 준비 중이라 주문할 수 없습니다."
                : code === "below_min_order"
                  ? "최소 주문 금액에 맞지 않습니다. 장바구니 금액을 늘린 뒤 다시 시도해 주세요."
                  : code === "delivery_address_required"
                    ? "배달·배송 주소를 입력해 주세요."
                    : code === "store_pickup_disabled"
                      ? "이 매장은 포장 픽업 주문을 받지 않습니다. 수령 방식을 바꿔 주세요."
                      : code === "store_delivery_disabled"
                        ? "이 매장은 배달을 제공하지 않습니다. 수령 방식을 바꿔 주세요."
                        : code === "payment_method_required" || code === "payment_method_invalid"
                          ? "결제 방법을 확인해 주세요. 매장에서 허용한 수단만 선택할 수 있습니다."
                          : `주문에 실패했습니다. (${code})`
        );
        return;
      }
      const oid = typeof json.order?.id === "string" ? json.order.id : null;
      /* Context 비우기와 동시에 리렌더되면 lines===0이 lastOrderId보다 먼저 적용될 수 있음 → id 먼저 동기 반영 */
      flushSync(() => {
        setLastOrderId(oid);
      });
      if (oid) setLastCheckoutOrderId(store.id, oid);
      cart.clearStoreCart(store.id);
      if (oid) {
        void router.prefetch("/my/store-orders");
        void router.prefetch(`/my/store-orders/${encodeURIComponent(oid)}`);
        void router.prefetch(`/my/store-orders/${encodeURIComponent(oid)}/chat`);
        window.dispatchEvent(new CustomEvent(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH));
        router.replace("/my/store-orders");
      }
    } catch {
      setErr(t("common_network_error_generic"));
    } finally {
      setBusy(false);
    }
  }

  if (!cart.hydrated) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center text-[14px] text-sam-muted">{t("common_loading")}</div>
    );
  }

  if (storeLoading) {
    return (
      <div className="min-h-[40vh] px-4 py-12 text-center text-[14px] text-sam-muted">{t("common_loading")}</div>
    );
  }

  if (storeLoadFailed || !store) {
    return (
      <div className="min-h-screen bg-[#F7F7F7]">
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
      <div className="min-h-screen bg-[#F7F7F7] pb-8">
        <div className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
          <div className="w-full border-b border-sam-border-soft bg-sam-surface">
            <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
              <h1 className="py-3 text-center text-[16px] font-semibold text-sam-fg">장바구니</h1>
            </div>
          </div>
        </div>
        <div className="px-4 py-10 text-center">
          <p className="text-[16px] font-semibold text-emerald-800">주문이 접수되었습니다.</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/my/store-orders"
              className="text-[15px] font-semibold text-signature underline"
            >
              주문 내역 확인
            </Link>
            <Link
              href={`/my/store-orders/${encodeURIComponent(lastOrderId)}`}
              className="text-[14px] text-sam-fg underline"
            >
              이 주문 진행 보기
            </Link>
            <Link
              href={`/my/store-orders/${encodeURIComponent(lastOrderId)}/chat`}
              className="text-[14px] text-sam-fg underline"
            >
              매장 문의 남기기
            </Link>
            <Link
              href={`/stores/${encodeURIComponent(store.slug)}`}
              className="text-[14px] text-sam-muted underline"
            >
              매장으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F7F7] pb-8">
        <div className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
          <div className="w-full border-b border-sam-border-soft bg-sam-surface">
            <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
              <h1 className="py-3 text-center text-[16px] font-semibold text-sam-fg">장바구니</h1>
            </div>
          </div>
        </div>
        <div className="px-4 py-6">
          <p className="text-[14px] text-sam-muted">이 매장 장바구니가 비어 있습니다.</p>
          {otherBuckets.length > 0 ? (
            <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] leading-relaxed text-amber-950">
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
                    <span className="text-[12px] text-amber-900/90">
                      {b.storeName} · 상품 {b.itemCount}종 · {formatMoneyPhp(b.subtotalPhp)}
                    </span>
                    <button
                      type="button"
                      onClick={() => cart.clearStoreCart(b.storeId)}
                      className="text-[12px] font-semibold text-red-700 underline"
                    >
                      이 매장 비우기
                    </button>
                    <Link
                      href={`/stores/${encodeURIComponent(b.storeSlug)}/cart`}
                      className="text-[12px] font-semibold text-signature underline"
                    >
                      장바구니 열기
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/stores/${encodeURIComponent(store.slug)}`}
              className="inline-block text-[14px] font-medium text-signature"
            >
              매장으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
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
    <div className="min-h-screen bg-[#f3f4f6] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className={APP_TIER1_VIEWPORT_BLEED_FROM_COLUMN_CLASS}>
        <div className="w-full border-b border-sam-border-soft bg-sam-surface">
          <div className={APP_TIER1_BAR_INNER_ALIGNED_CLASS}>
            <h1 className="py-3 text-center text-[16px] font-semibold text-sam-fg">{t("common_cart")}</h1>
          </div>
        </div>
      </div>

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
              className="flex gap-3 rounded border border-sam-border bg-sam-surface p-3 shadow-sm"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-visible">
                {showDiscBadge ? (
                  <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white shadow-sm">
                    {lineDiscPct}%
                  </span>
                ) : null}
                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded bg-gradient-to-br from-sam-surface-muted to-sam-border-soft text-2xl text-sam-meta">
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
                <p className="text-[15px] font-semibold text-sam-fg">{line.title}</p>
                <p className="mt-0.5 text-[12px] text-sam-muted">
                  <span className="font-medium text-sam-muted">{t("common_option")}</span>{" "}
                  {line.optionsSummary?.trim() ? line.optionsSummary.trim() : t("common_none")}
                </p>
                {line.lineNote?.trim() ? (
                  <p className="mt-0.5 text-[12px] text-amber-900/90">
                    <span className="font-medium">{t("common_request")}</span> {line.lineNote.trim()}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold text-sam-fg">
                    {formatMoneyPhp(line.unitPricePhp)}
                  </span>
                  {listU != null && listU > line.unitPricePhp ? (
                    <span className="text-xs font-normal text-sam-meta line-through">
                      {formatMoneyPhp(listU)}
                    </span>
                  ) : null}
                  <span className="text-xs text-sam-muted">× {line.qty}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-baseline justify-end gap-2 border-t border-sam-border-soft pt-1.5">
                  <span className="text-[11px] text-sam-muted">줄 합계</span>
                  {lineListTotal != null && lineListTotal > lineTotal ? (
                    <span className="text-xs font-normal text-sam-meta line-through">
                      {formatMoneyPhp(lineListTotal)}
                    </span>
                  ) : null}
                  <span className="text-[15px] font-bold text-sam-fg">{formatMoneyPhp(lineTotal)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end justify-end gap-2 self-end">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy || line.qty <= line.minOrderQty}
                    onClick={() => cart.updateLineQuantity(line.lineId, line.qty - 1)}
                    className="flex h-9 w-9 items-center justify-center rounded border border-sam-border bg-sam-surface text-lg text-sam-fg disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center text-[15px] font-semibold">{line.qty}</span>
                  <button
                    type="button"
                    disabled={busy || line.qty >= line.maxOrderQty}
                    onClick={() => cart.updateLineQuantity(line.lineId, line.qty + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded border border-sam-border bg-sam-surface text-lg text-sam-fg disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => cart.removeLine(line.lineId)}
                  className="text-[13px] font-medium text-red-600"
                >
                  {t("common_delete")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mx-3 mt-2">
        <Link
          href={`/stores/${encodeURIComponent(store.slug)}`}
          className="inline-flex w-full items-center justify-center rounded border border-sam-border bg-sam-surface py-3 text-[14px] font-semibold text-signature shadow-sm active:bg-sam-app"
        >
          {t("common_menu_more")}
        </Link>
      </div>

      {otherBuckets.length > 0 ? (
        <div className="mx-3 mt-3 rounded border border-sam-border bg-sam-surface px-3 py-2.5 text-[12px] text-sam-muted">
          다른 매장 장바구니도 있습니다. 해당 매장 페이지에서 장바구니를 열 수 있어요.
        </div>
      ) : null}

      <div className="mx-3 mt-3 space-y-3">
        <div className="rounded border border-sam-border bg-sam-surface p-3.5 shadow-sm">
            <dl className="space-y-2.5 text-[14px] leading-snug">
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">총상품금액</dt>
                <dd className="shrink-0 text-right font-semibold tabular-nums text-sam-fg">
                  {formatMoneyPhp(listSubtotalPhp)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sam-muted">
                  할인금액
                  {discountAmountPhp > 0 && discountPercentOverall > 0 ? (
                    <span className="ml-1 text-[11px] font-normal text-sam-meta">
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
                <dt className="text-sam-muted">예상배달비</dt>
                <dd className="shrink-0 text-right font-semibold tabular-nums text-sam-fg">
                  {fulfillment === "local_delivery"
                    ? formatMoneyPhp(deliveryFeeForCheckout)
                    : formatMoneyPhp(0)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-dashed border-sam-border pt-3">
              <div className="flex items-end justify-between gap-3">
                <span className="text-[15px] font-bold text-sam-fg">결제예정금액</span>
                <span className="text-[20px] font-bold leading-none text-rose-600 tabular-nums">
                  {formatMoneyPhp(displayGrand)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-sam-meta">
                최소 주문 금액 : {formatMoneyPhp(minOrderPhp)}
              </p>
            </div>
        </div>

        {showFreeDeliveryProgress ? (
          <div className="rounded border border-sky-100 bg-sky-50/80 px-3 py-2.5">
            <p className="text-[12px] font-semibold text-sky-950">
              {formatMoneyPhp(freeDeliveryThresholdPhp!)} 이상 주문 시 무료배달
            </p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-sky-200/80"
              role="progressbar"
              aria-valuenow={Math.round(freeDeliveryProgressPct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="무료배달까지 주문 금액 진행률"
            >
              <div
                className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
                style={{ width: `${freeDeliveryProgressPct}%` }}
              />
            </div>
            {freeDeliveryMet ? (
              <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                무료배달 조건을 충족했습니다.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-sky-900/80">
                {formatMoneyPhp(Math.max(0, freeDeliveryThresholdPhp! - subtotalPhp))} 더 담으면 배달비가 면제될 수
                있어요.
              </p>
            )}
          </div>
        ) : null}

        {fulfillment !== "local_delivery" ? (
          <p className="text-[11px] text-sam-muted">
            배달을 선택하면 매장에 설정된 예상 배달비가 위 요약에 반영됩니다.
          </p>
        ) : null}

        {minOrderPhp > 0 ? (
          <p
            className={`text-[12px] font-medium ${meetsMin ? "text-emerald-700" : "text-amber-800"}`}
          >
            {meetsMin
              ? "최소 주문 금액을 충족했습니다."
              : `${formatMoneyPhp(minShortage)} 더 담아 최소 주문을 맞춰 주세요.`}
          </p>
        ) : null}

      </div>

      <div className="mx-3 mt-3 space-y-3 rounded border border-sam-border bg-sam-surface p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
          <div className="min-w-0 sm:max-w-[8.5rem] sm:shrink-0">
            <p className="text-[14px] font-medium text-sam-muted">수령 방식</p>
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
                  className={`rounded-full px-3 py-1.5 text-[13px] ${
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
                <p className="mt-2 text-[12px] leading-snug text-amber-800">
                  이 매장의 「서비스 형태」에서 포장 픽업과 배달이 모두 꺼져 있거나, 담긴 상품과 맞지 않아 수령
                  방식을 고를 수 없습니다. 매장 설정을 확인하거나 항목을 조정한 뒤 다시 시도해 주세요.
                </p>
              ) : (
                <p className="mt-2 text-[12px] leading-snug text-amber-800">
                  담긴 상품은 포장 픽업·배달 모두 불가로 표시되어 있습니다. 항목을 삭제한 뒤 다시 담아 주세요.
                </p>
              )
            ) : null}
          </div>
          <div className="min-w-0 flex-1 border-t border-sam-border pt-4 sm:border-t-0 sm:border-l sm:border-sam-border sm:pt-0 sm:pl-3">
            <p className="text-[14px] font-medium text-sam-muted">
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
                  className={`flex shrink-0 cursor-pointer items-center gap-2.5 rounded-ui-rect border px-3 py-2 text-[13px] font-medium shadow-sm ${
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
            <p className="text-[12px] font-semibold text-sky-950">픽업 장소 (매장 주소)</p>
            <p className="mt-1 text-[11px] leading-snug text-sky-900/85">
              이 주소에서 수령합니다. 배달을 고르면 아래에 입력하는 주소가 배달지로 전달됩니다.
            </p>
            <ul className="mt-2 list-none space-y-0.5 text-[13px] leading-relaxed text-sky-950">
              {storePickupLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {store?.slug ?
              <Link
                href={`/stores/${encodeURIComponent(store.slug)}/info`}
                className="mt-2 inline-block text-[12px] font-medium text-signature underline"
              >
                매장 정보
              </Link>
            : null}
          </div>
        ) : fulfillment === "pickup" && offerPickup ? (
          <p className="rounded-ui-rect border border-amber-100 bg-amber-50/80 px-3 py-2 text-[12px] text-amber-950">
            매장 주소가 비어 있어 픽업 장소를 표시할 수 없습니다. 사장님 메뉴에서 매장 기본 정보를
            등록해 주세요.
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
            <p className="text-[14px] font-medium text-sam-muted">
              연락처
              {fulfillment === "pickup" ? (
                <span className="font-normal text-sam-meta"> (선택)</span>
              ) : (
                <span className="text-red-600"> *</span>
              )}
            </p>
            <p className="mt-2 text-[16px] font-medium tabular-nums tracking-tight text-sam-fg">
              {formattedPhoneDisplay}
            </p>
          </div>

          {needsAddressAndPhone ? (
            <div className="min-w-0 flex-1 border-t border-sam-border pt-4 sm:border-t-0 sm:border-l sm:border-sam-border sm:pl-4 sm:pt-0">
            <p className="text-[14px] font-medium text-sam-muted">
              배송지 <span className="text-red-600">*</span>
            </p>
            <ul className="mt-2 space-y-2">
              {!checkoutContactReady ? (
                <li className="rounded border border-sam-border bg-sam-surface p-3">
                  <p className="text-[12px] text-sam-muted">배달 주소 정보를 불러오는 중입니다…</p>
                </li>
              ) : null}
              {checkoutContactReady && !profileSnap && addressBook.length === 0 ? (
                <li className="rounded border border-amber-100 bg-amber-50/60 p-3">
                  <p className="text-[12px] leading-snug text-amber-950">
                    로그인하면 마이페이지에 저장한 배달 주소를 여기서 선택할 수 있습니다.
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
                      aria-label="배달주소 1 (마이페이지) 선택"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-sam-fg">배달주소 1</p>
                      <p className="mt-0.5 text-[11px] font-medium text-sam-muted">
                        내정보 · 주소 관리 기본 배달
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[12px] font-normal leading-relaxed text-sam-fg">
                        {profileAddressBodyText ||
                          "마이페이지에 저장된 배달 주소가 없습니다. 프로필에서 입력하거나 아래 배송지 추가를 이용해 주세요."}
                      </p>
                      {!profileDeliveryReady && profileAddressBodyText ? (
                        <p className="mt-1.5 text-[11px] leading-snug text-amber-800">
                          주문 전 지역·주소 한 줄이 3자 이상인지 확인해 주세요.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ) : null}
              {addressBook.map((e, idx) => {
                const slotLabel = `배달주소 ${idx + 1 + (profileSnap ? 1 : 0)}`;
                const sum =
                  getLocationLabelIfValid(e.region, e.city)?.trim() || e.freeSummaryLine.trim();
                const body = [sum, e.addressDetail.trim()].filter(Boolean).join("\n");
                const isSel = e.id === selectedAddressId;
                return (
                  <li
                    key={e.id}
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
                        onChange={() => setSelectedAddressId(e.id)}
                        aria-label={`${slotLabel} 선택`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-sam-fg">{slotLabel}</p>
                        <p className="mt-1 whitespace-pre-wrap text-[12px] font-normal leading-relaxed text-sam-fg">
                          {body || "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeDeliveryAddress(e.id)}
                          className="rounded border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={openAddressModalAdd}
                className="rounded border border-signature bg-sam-surface px-3 py-2 text-[13px] font-bold text-signature shadow-sm"
              >
                + 배송지 추가
              </button>
            </div>
            {!deliveryAddressReady && checkoutContactReady && (profileSnap || addressBook.length > 0) ? (
              <p className="mt-2 text-[11px] leading-snug text-amber-800">
                선택한 배송지 내용을 확인해 주세요. 지역·동네 또는 {STORE_ADDRESS_STREET_LABEL}이 필요합니다.
              </p>
            ) : null}
            {checkoutContactReady && profileSnap && !profileDeliveryReady && addressBook.length === 0 ? (
              <p className="mt-2 text-[11px] leading-snug text-amber-800">
                마이페이지 주소가 비어 있거나 너무 짧습니다. 프로필에서 입력을 마치거나 배송지 추가로 주소를
                넣어 주세요.
              </p>
            ) : null}
            </div>
          ) : null}
        </div>
        <div>
          <label htmlFor="cart-buyer-note" className="text-[14px] font-medium text-sam-muted">
            요청 사항 (선택)
          </label>
          <textarea
            id="cart-buyer-note"
            rows={2}
            value={buyerNote}
            disabled={busy}
            onChange={(e) => setBuyerNote(e.target.value)}
            className="mt-2 w-full resize-none rounded border border-sam-border px-3 py-2 text-sm text-sam-fg"
            maxLength={500}
          />
          <p className="mt-1 text-[11px] leading-snug text-sam-muted">
            입력하시면 매장 사장님 주문 관리 화면에 &apos;고객 요청 사항&apos;으로 표시됩니다.
          </p>
        </div>

        {fulfillment === "local_delivery" && commerce.deliveryCourierLabel?.trim() ? (
          <p className="text-[11px] leading-snug text-sam-muted">
            배달 업체(안내): {commerce.deliveryCourierLabel.trim()}
          </p>
        ) : null}
        {checkoutBlocked && frontCommerce ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium leading-snug text-amber-950">
            {frontCommerce.inBreak
              ? `준비중 · Break time: ${frontCommerce.breakRangeLabel}. 쉬는 시간에는 주문할 수 없습니다.`
              : "지금은 준비 중이라 주문할 수 없습니다."}
          </p>
        ) : null}
        {err ? <p className="text-[13px] text-red-600">{err}</p> : null}
      </div>

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 border-t border-sam-border border-b border-sam-border bg-sam-app/95 px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.05)] backdrop-blur-sm ${BOTTOM_NAV_STACK_ABOVE_CLASS}`}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={busy || !meetsMin || fulfillmentOptions.length === 0 || checkoutBlocked}
          onClick={() => void submitOrder()}
          className="w-full rounded bg-signature py-3.5 text-[15px] font-bold text-white shadow-sm disabled:bg-sam-surface-muted disabled:text-sam-muted"
        >
          {busy ? t("common_processing") : t("common_order_action")}
        </button>
      </div>

      {addressModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => {
            if (!busy) closeAddressModal();
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t bg-sam-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded sm:p-5"
            role="dialog"
            aria-modal
            aria-labelledby="cart-addr-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cart-addr-modal-title" className="text-base font-bold text-sam-fg">
              {`${t("common_delivery_label")}지 추가`}
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-sam-muted">
              저장하면 목록에 배달주소 {addressBook.length + (profileSnap ? 2 : 1)}로 추가됩니다. 라디오로
              이번 주문에 쓸 주소를
              고를 수 있습니다.
            </p>
            <div className="mt-4 space-y-4">
              <LocationSelector
                embedded
                showRequired
                region={modalRegion}
                city={modalCity}
                onRegionChange={(id) => {
                  setModalRegion(id);
                  setModalCity("");
                  setModalLocationError(undefined);
                }}
                onCityChange={(id) => {
                  setModalCity(id);
                  setModalLocationError(undefined);
                }}
                label={t("common_location")}
              />
              <div className="space-y-2">
                <p className="text-[12px] leading-snug text-sam-muted">{STORE_ADDRESS_STREET_HINT}</p>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <label
                      htmlFor="cart-modal-addr-line"
                      className="block text-[12px] font-medium text-sam-muted"
                    >
                      {STORE_ADDRESS_STREET_LABEL}
                    </label>
                    <input
                      id="cart-modal-addr-line"
                      type="text"
                      autoComplete="street-address"
                      value={modalFreeLine}
                      disabled={busy}
                      onChange={(e) => setModalFreeLine(e.target.value)}
                      placeholder={STORE_ADDRESS_STREET_PLACEHOLDER}
                      className="mt-1.5 w-full rounded border border-sam-border px-3 py-2 text-sm text-sam-fg"
                      maxLength={300}
                    />
                  </div>
                  <div className="min-w-0">
                    <label
                      htmlFor="cart-modal-addr-detail"
                      className="block text-[12px] font-medium text-sam-muted"
                    >
                      {STORE_ADDRESS_DETAIL_LABEL}
                    </label>
                    <input
                      id="cart-modal-addr-detail"
                      type="text"
                      autoComplete="address-line2"
                      value={modalDetail}
                      disabled={busy}
                      onChange={(e) => setModalDetail(e.target.value)}
                      className="mt-1.5 w-full rounded border border-sam-border px-3 py-2 text-sm text-sam-fg"
                      maxLength={500}
                    />
                  </div>
                </div>
              </div>
            </div>
            {modalLocationError ? (
              <p className="mt-3 text-[13px] text-red-600">{modalLocationError}</p>
            ) : null}
            <div className="mt-5 flex gap-2 border-t border-sam-border-soft pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={closeAddressModal}
                className="flex-1 rounded border border-sam-border py-3 text-sm font-semibold text-sam-fg"
              >
                취소
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={saveAddressModal}
                className="flex-1 rounded bg-signature py-3 text-sm font-bold text-white"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
