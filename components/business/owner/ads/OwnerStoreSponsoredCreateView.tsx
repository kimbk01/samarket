"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  OWNER_STORE_SPONSORED_INVENTORY_KEYS,
  isOwnerStoreSponsoredInventoryKey,
  type OwnerStoreSponsoredInventoryKey,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type { OwnerSponsoredCampaignRow } from "@/lib/stores/advertising/owner-store-sponsored-writer";
import { decodeOwnerAdPackagePricingModel } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { DeliveryAdOwnerPackageCardGrid } from "@/components/stores/advertising/DeliveryAdOwnerPackageCardGrid";
import { DeliveryAdOwnerPlacementVisualGrid } from "@/components/stores/advertising/DeliveryAdOwnerPlacementVisualGrid";
import type { OwnerPlacementVisualOption } from "@/components/stores/advertising/DeliveryAdOwnerPlacementVisualGrid";
import { ownerPrimaryBrowsePlacementTitle, ownerSecondaryBrowsePlacementTitle } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { DeliveryAdOwnerApplicationConfirm } from "@/components/stores/advertising/DeliveryAdOwnerApplicationConfirm";
import { DeliveryAdOwnerInsufficientCashSubmitModal } from "@/components/stores/advertising/DeliveryAdOwnerInsufficientCashSubmitModal";
import { DeliveryAdOwnerPreviewWorkspace } from "@/components/stores/advertising/DeliveryAdOwnerPreviewWorkspace";
import {
  DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS,
  DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { deliveryAdCommercialPlacementLabel } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { DeliveryAdBrowseTargetKind } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { OwnerIosCashPurchaseNotice } from "@/components/business/owner/OwnerIosCashPurchaseNotice";
import {
  dibayShellRequestHeaders,
  useIosAppDigitalPurchaseBlocked,
} from "@/lib/apple-iap/use-ios-digital-purchase-blocked";
import { ownerAdErrorKey } from "@/lib/stores/advertising/owner-ad-error-copy";

type EligibleStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
  categoryLabel: string | null;
  categorySlug?: string | null;
  topicLabel?: string | null;
  topicSlug?: string | null;
};

type PlacementChoiceId = "home" | "primary" | "secondary";

function inventoryKeyFromPlacementChoice(choice: PlacementChoiceId): OwnerStoreSponsoredInventoryKey {
  return choice === "home" ? "STORES_HOME_FEED" : "STORES_CATEGORY_FEED";
}

function browseTargetFromPlacementChoice(
  choice: PlacementChoiceId,
  store: EligibleStore | null
): {
  browseTargetKind: DeliveryAdBrowseTargetKind | null;
  browsePrimarySlug: string | null;
  browseSecondarySlug: string | null;
} {
  if (choice === "home") {
    return { browseTargetKind: null, browsePrimarySlug: null, browseSecondarySlug: null };
  }
  const primary = store?.categorySlug?.trim() || null;
  if (choice === "primary") {
    return {
      browseTargetKind: "primary",
      browsePrimarySlug: primary,
      browseSecondarySlug: null,
    };
  }
  return {
    browseTargetKind: "secondary",
    browsePrimarySlug: primary,
    browseSecondarySlug: store?.topicSlug?.trim() || null,
  };
}

type CommercialPackage = {
  packageId: string;
  code: string;
  displayName: string;
  durationDays: number;
  basePriceMinor: number;
  partnerDiscountPercent: number;
  finalPayableMinor: number;
  basePriceDisplay: string;
  finalPayableDisplay: string;
  partnerActive: boolean;
};

type CommercialQuote = {
  ok: true;
  packageId: string;
  packageDisplayName: string;
  durationDays: number;
  basePriceMinor: number;
  partnerDiscountPercent: number;
  finalPayableMinor: number;
  basePriceDisplay: string;
  finalPayableDisplay: string;
  partnerActive: boolean;
};

type CommercialPlacement = {
  inventoryKey: string;
  sellable: boolean;
  labels: { ko: string; en: string } | null;
};

/**
 * Owner Store Promotion — single-page workspace (no step wizard).
 */
export function OwnerStoreSponsoredCreateView() {
  const { t, safeT, language } = useI18n();
  const iosCashPurchaseBlocked = useIosAppDigitalPurchaseBlocked();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = language === "en" ? "en" : "ko";
  const {
    formPadStyle,
    footerPadStyle,
    footerFixedClassName,
  } = useOwnerAdminFormKeyboard({ aboveBottomNav: true });

  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";
  const preloadCampaignId = searchParams.get("campaignId")?.trim() ?? "";
  const preloadInventoryKeyRaw = searchParams.get("inventoryKey")?.trim() ?? "";
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState(preloadStoreId);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(storeSheetOpen);
  const [inventoryKey, setInventoryKey] = useState<OwnerStoreSponsoredInventoryKey | "">(() =>
    isOwnerStoreSponsoredInventoryKey(preloadInventoryKeyRaw) ? preloadInventoryKeyRaw : ""
  );
  const [placementChoice, setPlacementChoice] = useState<PlacementChoiceId | "">(() => {
    if (preloadInventoryKeyRaw === "STORES_HOME_FEED") return "home";
    if (preloadInventoryKeyRaw === "STORES_CATEGORY_FEED") return "primary";
    return "";
  });
  const [packageId, setPackageId] = useState("");
  const [packages, setPackages] = useState<CommercialPackage[]>([]);
  const [placements, setPlacements] = useState<CommercialPlacement[]>([]);
  const [quote, setQuote] = useState<CommercialQuote | null>(null);
  const [noSellablePackages, setNoSellablePackages] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [shortageModalOpen, setShortageModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCampaign, setDoneCampaign] = useState<OwnerSponsoredCampaignRow | null>(null);
  const [existingCampaign, setExistingCampaign] = useState<OwnerSponsoredCampaignRow | null>(null);
  const [previewStore, setPreviewStore] = useState<StoreHomeFeedItem | null>(null);
  const [previewStoreError, setPreviewStoreError] = useState(false);
  const [clientRequestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}`
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: EligibleStore[];
          businessCash?: { balanceMinor?: number };
        };
        if (cancelled) return;
        const list = (json.stores ?? []).filter((s) => s.eligible);
        setStores(list);
        if (typeof json.businessCash?.balanceMinor === "number") {
          setCashBalanceMinor(json.businessCash.balanceMinor);
        } else {
          setCashBalanceMinor(0);
        }
        if (preloadStoreId && list.some((s) => s.id === preloadStoreId)) {
          setStoreId(preloadStoreId);
        } else if (list.length === 1) {
          setStoreId(list[0]!.id);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadStoreId]);

  useEffect(() => {
    if (!preloadCampaignId || !preloadStoreId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/me/stores/${encodeURIComponent(preloadStoreId)}/delivery-ads/${encodeURIComponent(preloadCampaignId)}`,
          { credentials: "include" }
        );
        const json = (await res.json()) as {
          ok?: boolean;
          campaign?: OwnerSponsoredCampaignRow;
          meta?: { productKind?: string };
        };
        if (cancelled || !res.ok || !json.ok || !json.campaign) return;
        if (json.meta?.productKind === "banner") return;
        const row = json.campaign;
        if (row.lifecycleStatus !== "DRAFT" && row.lifecycleStatus !== "CHANGES_REQUESTED") {
          return;
        }
        setExistingCampaign(row);
        setStoreId(row.storeId);
        const key = row.inventoryKeys.find(isOwnerStoreSponsoredInventoryKey);
        if (key) setInventoryKey(key);
        const bound = decodeOwnerAdPackagePricingModel(row.pricingModel);
        if (bound) setPackageId(bound);
      } catch {
        /* keep empty create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadCampaignId, preloadStoreId]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    void fetch(
      `/api/me/delivery-ads/placement-preview?storeId=${encodeURIComponent(storeId)}&lang=${lang}`,
      { credentials: "include" }
    )
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; store?: StoreHomeFeedItem };
        if (cancelled) return;
        if (res.ok && json.ok && json.store) {
          setPreviewStore(json.store);
          setPreviewStoreError(false);
        } else {
          setPreviewStore(null);
          setPreviewStoreError(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewStore(null);
          setPreviewStoreError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, lang]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  const placementOptions = useMemo(() => {
    const fromApi = placements
      .map((p) => p.inventoryKey)
      .filter(isOwnerStoreSponsoredInventoryKey);
    if (fromApi.length) return fromApi;
    return [...OWNER_STORE_SPONSORED_INVENTORY_KEYS];
  }, [placements]);

  /** R-43: 판매 판정·설정 조회 실패(503 · 네트워크) — 「판매 준비 중」이 아니라 「확인하지 못했어요 · 다시 시도」 */
  const [commercialCheckFailed, setCommercialCheckFailed] = useState(false);
  /** R-44: 마지막 요청의 응답만 반영(대분류↔소분류를 빨리 바꿀 때 늦게 온 이전 응답 무시) */
  const commercialSeqRef = useRef(0);

  const refetchCommercial = useCallback(async () => {
    const seq = ++commercialSeqRef.current;
    if (!storeId) {
      setCommercialCheckFailed(false);
      setPackages([]);
      setQuote(null);
      setNoSellablePackages(false);
      setPlacements([]);
      return;
    }
    setCommercialLoading(true);
    try {
      const qs = new URLSearchParams({
        storeId,
        productKind: "store_sponsored",
      });
      if (inventoryKey) qs.set("inventoryKey", inventoryKey);
      if (packageId) qs.set("packageId", packageId);
      /** R-41: 고른 업종 대상(대분류·소분류)만 판정 — 막힌 대상에 상품·견적이 나오지 않게 */
      if (placementChoice === "primary" || placementChoice === "secondary") {
        qs.set("browseTargetKind", placementChoice);
      }
      const res = await fetch(`/api/me/delivery-ads/commercial?${qs.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        product?: {
          displayName?: string | null;
          acceptingApplications?: boolean;
          enabled?: boolean;
        } | null;
        placements?: CommercialPlacement[];
        packages?: CommercialPackage[];
        quote?: CommercialQuote | { ok: false; error?: string } | null;
        noSellablePackages?: boolean;
      };
      if (seq !== commercialSeqRef.current) return;
      if (!res.ok || !json.ok) {
        setPackages([]);
        setQuote(null);
        /** R-40·R-43: 판정 조회 실패(503)는 「판매 준비 중」이 아니라 「확인하지 못했어요」 */
        if (res.status >= 500 || json.error === "capacity_check_failed") {
          setNoSellablePackages(false);
          setCommercialCheckFailed(true);
          return;
        }
        setCommercialCheckFailed(false);
        setNoSellablePackages(true);
        return;
      }
      setCommercialCheckFailed(false);
      setAcceptingApplications(
        json.product?.acceptingApplications !== false && json.product?.enabled !== false
      );
      setPlacements(json.placements ?? []);
      if (inventoryKey) {
        setPackages(json.packages ?? []);
        setNoSellablePackages(json.noSellablePackages === true);
        if (json.quote && "ok" in json.quote && json.quote.ok === true) {
          setQuote(json.quote);
        } else {
          setQuote(null);
        }
      } else {
        setPackages([]);
        setQuote(null);
        setNoSellablePackages(false);
      }
    } catch {
      if (seq !== commercialSeqRef.current) return;
      setPackages([]);
      setQuote(null);
      /** R-43: 네트워크 오류도 「확인 못 함」 */
      setNoSellablePackages(false);
      setCommercialCheckFailed(true);
    } finally {
      if (seq === commercialSeqRef.current) setCommercialLoading(false);
    }
  }, [inventoryKey, packageId, placementChoice, storeId]);

  useEffect(() => {
    void refetchCommercial();
  }, [refetchCommercial]);

  useEffect(() => {
    if (!inventoryKey && placementOptions.length === 1) {
      setInventoryKey(placementOptions[0]!);
    }
  }, [inventoryKey, placementOptions]);

  const onSelectStore = (id: string) => {
    setStoreId(id);
    setInventoryKey("");
    setPlacementChoice("");
    setPackageId("");
    setPackages([]);
    setQuote(null);
    setPreviewStore(null);
    setError(null);
    setStoreSheetOpen(false);
  };

  const onSelectPlacementChoice = (choice: PlacementChoiceId) => {
    setPlacementChoice(choice);
    setInventoryKey(inventoryKeyFromPlacementChoice(choice));
    setPackageId("");
    setPackages([]);
    setQuote(null);
    setError(null);
  };

  const onSelectPackage = (id: string) => {
    setPackageId(id);
    setQuote(null);
    setError(null);
  };

  const persistDraft = useCallback(async (): Promise<OwnerSponsoredCampaignRow | null> => {
    if (!storeId || !inventoryKey || !packageId || !placementChoice) {
      setError(!storeId ? "store" : "inventory");
      return null;
    }
    if (!acceptingApplications) {
      setError("applications_paused");
      return null;
    }
    if (noSellablePackages || !quote) {
      setError("no_packages");
      return null;
    }
    const browse = browseTargetFromPlacementChoice(placementChoice, selectedStore);
    let saved = existingCampaign;
    if (saved) {
      const patchRes = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(saved.id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...dibayShellRequestHeaders() },
          body: JSON.stringify({
            inventoryKeys: [inventoryKey],
            packageId,
            browseTargetKind: browse.browseTargetKind,
            browsePrimarySlug: browse.browsePrimarySlug,
            browseSecondarySlug: browse.browseSecondarySlug,
          }),
        }
      );
      const patchJson = (await patchRes.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerSponsoredCampaignRow;
      };
      if (!patchRes.ok || !patchJson.ok || !patchJson.campaign) {
        setError(patchJson.error || "generic");
        return null;
      }
      saved = patchJson.campaign;
      setExistingCampaign(saved);
      return saved;
    }
    const createRes = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inventoryKeys: [inventoryKey],
        packageId,
        clientRequestId,
        browseTargetKind: browse.browseTargetKind,
        browsePrimarySlug: browse.browsePrimarySlug,
        browseSecondarySlug: browse.browseSecondarySlug,
      }),
    });
    const createJson = (await createRes.json()) as {
      ok?: boolean;
      error?: string;
      campaign?: OwnerSponsoredCampaignRow;
    };
    if (!createRes.ok || !createJson.ok || !createJson.campaign) {
      setError(createJson.error || "generic");
      return null;
    }
    saved = createJson.campaign;
    setExistingCampaign(saved);
    return saved;
  }, [
    acceptingApplications,
    clientRequestId,
    existingCampaign,
    inventoryKey,
    noSellablePackages,
    packageId,
    placementChoice,
    quote,
    selectedStore,
    storeId,
  ]);

  const saveDraftOnly = useCallback(async () => {
    setDraftBusy(true);
    setError(null);
    try {
      const saved = await persistDraft();
      if (!saved) return;
      router.push(DELIVERY_AD_OWNER_ROUTES.hub);
    } catch {
      setError("generic");
    } finally {
      setDraftBusy(false);
    }
  }, [persistDraft, router]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setShortageModalOpen(false);
    try {
      const saved = await persistDraft();
      if (!saved || !quote) return;
      const actionRes = await fetch(
        `/api/me/stores/${encodeURIComponent(saved.storeId)}/delivery-ads/${encodeURIComponent(saved.id)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: saved.lifecycleStatus === "CHANGES_REQUESTED" ? "resubmit" : "submit",
            packageId,
            clientFinalPayableMinor: quote.finalPayableMinor,
          }),
        }
      );
      const actionJson = (await actionRes.json()) as {
        ok?: boolean;
        error?: string;
        quoteError?: string | null;
        refreshQuote?: boolean;
        campaign?: OwnerSponsoredCampaignRow;
      };
      if (
        !actionRes.ok ||
        !actionJson.ok ||
        actionJson.error === "quote_stale" ||
        actionJson.refreshQuote
      ) {
        await refetchCommercial();
        /** SA-04: 실패 이유 그대로 (견적 세부 코드 우선) — 문구는 `ownerAdErrorKey` 1곳 */
        setError(
          actionJson.refreshQuote
            ? "quote_stale"
            : actionJson.quoteError || actionJson.error || "generic"
        );
        return;
      }
      setDoneCampaign(actionJson.campaign ?? saved);
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }, [packageId, persistDraft, quote, refetchCommercial]);

  /** SA-04: 실패 이유 → 문구 단일 정의 */
  const errorKey = ownerAdErrorKey(error);
  const errorText = errorKey ? t(errorKey) : null;

  const canSubmit = Boolean(
    storeId &&
      inventoryKey &&
      packageId &&
      quote &&
      !noSellablePackages &&
      acceptingApplications &&
      !commercialLoading
  );

  const requestSubmit = useCallback(() => {
    if (iosCashPurchaseBlocked || !canSubmit || !quote || cashBalanceMinor == null) return;
    if (cashBalanceMinor < quote.finalPayableMinor) {
      setShortageModalOpen(true);
      return;
    }
    void submit();
  }, [canSubmit, cashBalanceMinor, iosCashPurchaseBlocked, quote, submit]);

  const confirmRows = useMemo(() => {
    if (!selectedStore) return [];
    const rows = [
      { labelKey: "owner_ads_confirm_store", value: selectedStore.storeName },
      { labelKey: "owner_ads_confirm_product", value: t("owner_ads_product_store_sponsored") },
      {
        labelKey: "owner_ads_confirm_placement",
        value: inventoryKey ? deliveryAdCommercialPlacementLabel(inventoryKey, lang) : "—",
      },
    ];
    if (quote) {
      rows.push(
        {
          labelKey: "owner_ads_confirm_package",
          value: t("owner_ads_period_duration_days", { days: quote.durationDays }),
        },
        {
          labelKey: "owner_ads_confirm_period",
          value: t("owner_ads_period_pending_start_r1"),
        },
        {
          labelKey: "owner_ads_confirm_base_price",
          value: quote.basePriceDisplay,
        }
      );
      if (quote.partnerActive && quote.partnerDiscountPercent > 0) {
        rows.push({
          labelKey: "owner_ads_confirm_partner_discount",
          value: `${quote.partnerDiscountPercent}%`,
        });
      }
    }
    return rows;
  }, [quote, selectedStore, inventoryKey, lang, t]);

  if (doneCampaign) {
    return (
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pt-4 pb-8`}
        data-owner-ads-workspace="store-sponsored"
        data-owner-ads-wizard="single-page"
      >
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-5 text-center">
          <p className="text-[16px] font-bold text-sam-fg">{t("owner_ads_success_title")}</p>
          <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_success_body")}</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} min-h-[48px] w-full`}
              onClick={() =>
                router.push(
                  `${DELIVERY_AD_OWNER_ROUTES.detail(doneCampaign.id)}?storeId=${encodeURIComponent(doneCampaign.storeId)}`
                )
              }
            >
              {t("owner_ads_view_detail")}
            </button>
            <button
              type="button"
              className={`${DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS} min-h-[48px] w-full`}
              onClick={() => router.push(DELIVERY_AD_OWNER_ROUTES.hub)}
            >
              {t("owner_ads_back_hub")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,56rem)] px-4 pt-4`}
        style={formPadStyle}
        data-owner-ads-workspace="store-sponsored"
        data-owner-ads-wizard="single-page"
      >
        <h1 className="text-[18px] font-bold text-sam-fg">
          {t("owner_ads_workspace_store_sponsored_title")}
        </h1>

        {errorText ? (
          <p className="mt-3 text-[13px] text-sam-danger" role="alert">
            {errorText}
          </p>
        ) : null}

        {!loaded ? (
          <p className="mt-4 text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
        ) : (
          <div className="mt-4 grid gap-4 pb-28 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)] md:items-start">
            <div className="space-y-4 min-w-0">
              <OwnerStoreAdminDashSection title={t("owner_ads_section_store")}>
                {stores.length === 0 ? (
                  <p className="text-[13px] text-sam-muted">{t("owner_ads_no_eligible_store")}</p>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left transition hover:border-sam-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sam-primary/40 active:brightness-95"
                    onClick={() => setStoreSheetOpen(true)}
                    data-owner-ads-store-trigger="1"
                  >
                    {selectedStore?.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedStore.profileImageUrl}
                        alt=""
                        className="h-12 w-12 rounded-ui-rect object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-ui-rect bg-sam-surface" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-sam-fg">
                        {selectedStore?.storeName ?? t("owner_ads_select_store_hint")}
                      </p>
                      {selectedStore?.categoryLabel ? (
                        <p className="text-[12px] text-sam-muted">{selectedStore.categoryLabel}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-signature">
                      {t("owner_ads_change_store")}
                    </span>
                  </button>
                )}
              </OwnerStoreAdminDashSection>

              <OwnerStoreAdminDashSection title={t("owner_ads_where_to_promote")}>
                <p className="mb-2 text-[12px] text-sam-muted">
                  {/* SA-05: 상품 이름 = 키 (DB 영문 「Store sponsored」 금지) */}
                  {t("owner_ads_product_store_sponsored")}
                </p>
                <DeliveryAdOwnerPlacementVisualGrid
                  options={
                    ([
                      {
                        key: "home" as const,
                        title: t("owner_ads_launch_home_store_title"),
                        help: t("owner_ads_launch_home_store_help"),
                        miniature: "home_interleave" as const,
                      },
                      {
                        key: "primary" as const,
                        title: ownerPrimaryBrowsePlacementTitle({
                          primaryCategoryLabel: selectedStore?.categoryLabel,
                          lang,
                        }),
                        help: t("owner_ads_launch_category_store_help"),
                        miniature: "category_interleave" as const,
                      },
                      ...(selectedStore?.topicSlug
                        ? [
                            {
                              key: "secondary" as const,
                              title: ownerSecondaryBrowsePlacementTitle({
                                secondaryCategoryLabel: selectedStore.topicLabel,
                                lang,
                              }),
                              help: t("owner_ads_launch_category_store_help"),
                              miniature: "category_interleave" as const,
                            },
                          ]
                        : []),
                    ] satisfies OwnerPlacementVisualOption<PlacementChoiceId>[])
                  }
                  selected={placementChoice}
                  onSelect={onSelectPlacementChoice}
                  adTagLabel={safeT("owner_ads_customer_ad_tag")}
                />
              </OwnerStoreAdminDashSection>

              <OwnerStoreAdminDashSection title={t("owner_ads_section_packages")}>
                {commercialCheckFailed && !commercialLoading ? (
                  <div
                    className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft px-3 py-3"
                    data-owner-ads-check-failed="1"
                    role="status"
                  >
                    <p className="text-[13px] font-semibold text-sam-fg">{t("owner_ads_error_check_failed")}</p>
                    <button
                      type="button"
                      className="mt-2 min-h-11 rounded-ui-rect border border-sam-border bg-sam-surface px-4 text-[13px] font-semibold text-sam-fg"
                      onClick={() => void refetchCommercial()}
                    >
                      {t("common_retry")}
                    </button>
                  </div>
                ) : !inventoryKey ? (
                  <p className="text-[13px] text-sam-muted">
                    {safeT("owner_ads_pick_placement_first_store")}
                  </p>
                ) : commercialLoading ? (
                  <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
                ) : (
                  <>
                    <DeliveryAdOwnerPackageCardGrid
                      packages={packages.map((pkg) => ({
                        packageId: pkg.packageId,
                        durationDays: pkg.durationDays,
                        finalPayableDisplay: pkg.finalPayableDisplay,
                        finalPayableMinor: pkg.finalPayableMinor,
                        basePriceDisplay: pkg.basePriceDisplay,
                        partnerDiscountPercent: pkg.partnerDiscountPercent,
                        partnerActive: pkg.partnerActive,
                        displayName: pkg.displayName,
                      }))}
                      selectedPackageId={packageId}
                      onSelect={onSelectPackage}
                      preparing={noSellablePackages || packages.length === 0}
                    />
                    {noSellablePackages || packages.length === 0 ? (
                      <div
                        className="mt-2 rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft px-3 py-2"
                        data-owner-ads-price-unset="1"
                      >
                        <p className="text-[13px] font-semibold text-sam-fg">
                          {t("owner_ads_no_sellable_packages")}
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </OwnerStoreAdminDashSection>

              <OwnerStoreAdminDashSection title={t("owner_ads_ad_cost_section")}>
                {commercialCheckFailed ? null : quote ? (
                  <DeliveryAdOwnerApplicationConfirm
                    rows={confirmRows}
                    totalDisplay={quote.finalPayableDisplay}
                    businessCashNoteKey="owner_ads_confirm_business_cash_model_b"
                    cashBreakdown={
                      cashBalanceMinor != null
                        ? {
                            adAmountMinor: quote.finalPayableMinor,
                            balanceMinor: cashBalanceMinor,
                          }
                        : null
                    }
                  />
                ) : (
                  <div
                    className="rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft px-3 py-3"
                    data-owner-ads-price-unset="confirm"
                  >
                    <p className="text-[13px] font-semibold text-sam-fg">
                      {t("owner_ads_sale_preparing_body")}
                    </p>
                  </div>
                )}
                <p className="mt-2 text-[12px] text-sam-muted" data-owner-ads-cash-pays="1">
                  {t("owner_ads_business_cash_pays_ads")}
                </p>
              </OwnerStoreAdminDashSection>
            </div>

            <div className="space-y-4 min-w-0 md:sticky md:top-4">
              {inventoryKey ? (
                <OwnerStoreAdminDashSection title={t("owner_ads_section_preview")}>
                  <DeliveryAdOwnerPreviewWorkspace
                    productKind="store_sponsored"
                    selectedInventoryKey={inventoryKey}
                    surfaceEnabled
                    store={previewStore}
                    storeLoadError={previewStoreError}
                    presentationMode="owner_product"
                  />
                </OwnerStoreAdminDashSection>
              ) : null}
            </div>
          </div>
        )}
        <p className="pb-2 text-center text-[11px] text-sam-muted" data-owner-ads-cash-note="1">
          {t("owner_ads_confirm_business_cash_model_b")}
        </p>
      </div>

      {/* 공용 하단 바(Owner S-A 2026-11-03): 탭과 같은 60px 한 줄 · 임시 저장 | 광고 신청 · 결제 안내는 바 밖(본문 끝) */}
      <BodyPortal>
        <div
          className={footerFixedClassName}
          style={footerPadStyle}
          data-owner-ads-footer="owner-admin-ssot"
        >
          {/* pointer-events-auto: fixed shell is pointer-events-none (Owner Admin footer SSOT). */}
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                disabled={!canSubmit || draftBusy || busy}
                data-owner-ads-draft-cta="save"
                onClick={() => void saveDraftOnly()}
              >
                {draftBusy ? t("owner_ads_loading") : t("owner_ads_save_draft")}
              </button>
              {iosCashPurchaseBlocked ? (
                <OwnerIosCashPurchaseNotice className="self-center text-xs" />
              ) : (
                <button
                  type="button"
                  className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                  disabled={!canSubmit || busy || draftBusy}
                  data-owner-ads-submit-cta="apply"
                  onClick={() => requestSubmit()}
                >
                  {busy
                    ? t("owner_ads_loading")
                    : safeT("owner_ads_apply_submit_cta")}
                </button>
              )}
            </div>
          </div>
        </div>
      </BodyPortal>

      <DeliveryAdOwnerInsufficientCashSubmitModal
        open={shortageModalOpen}
        adAmountMinor={quote?.finalPayableMinor ?? 0}
        balanceMinor={cashBalanceMinor ?? 0}
        busy={busy}
        storeId={storeId}
        returnTo={
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : null
        }
        onCancel={() => setShortageModalOpen(false)}
      />

      <DibayBottomSheet
        open={storeSheetOpen}
        onClose={() => setStoreSheetOpen(false)}
        title={t("owner_ads_select_store")}
        ariaLabel={t("owner_ads_select_store")}
        contentPaddingBottomPx={contentPaddingBottomPx}
      >
        <ul className="mt-3 space-y-2">
          {stores.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectStore(s.id)}
                data-selected={storeId === s.id ? "true" : undefined}
                className={OverlayUi.selectCard}
              >
                {s.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.profileImageUrl}
                    alt=""
                    className="h-12 w-12 rounded-[length:var(--overlay-radius-sm)] object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]">{s.storeName}</p>
                  {s.categoryLabel ? (
                    <p className={OverlayUi.caption}>{s.categoryLabel}</p>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DibayBottomSheet>
    </>
  );
}
