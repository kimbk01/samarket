"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerDeliveryAdApplicationWizardShell } from "@/components/business/owner/ads/OwnerDeliveryAdApplicationWizardShell";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
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
import { DeliveryAdOwnerPlacementChipGrid } from "@/components/stores/advertising/DeliveryAdOwnerPlacementChipGrid";
import { DeliveryAdOwnerApplicationConfirm } from "@/components/stores/advertising/DeliveryAdOwnerApplicationConfirm";
import { DeliveryAdOwnerPreviewWorkspace } from "@/components/stores/advertising/DeliveryAdOwnerPreviewWorkspace";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { deliveryAdCommercialPlacementLabel } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  canAdvanceOwnerApplicationStep,
  parseOwnerDeliveryAdApplicationStep,
  type OwnerDeliveryAdApplicationStep,
} from "@/lib/stores/advertising/owner-delivery-ad-application-step";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

type EligibleStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
  categoryLabel: string | null;
};

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

export function OwnerStoreSponsoredCreateView() {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lang = language === "en" ? "en" : "ko";
  const step = parseOwnerDeliveryAdApplicationStep(searchParams.get("step"));
  const {
    formPadStyle,
    footerPadStyle,
    footerFixedClassName,
    keyboardOpen,
  } = useOwnerAdminFormKeyboard({ aboveBottomNav: true });

  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(storeSheetOpen);
  const [inventoryKey, setInventoryKey] = useState<OwnerStoreSponsoredInventoryKey | "">("");
  const [packageId, setPackageId] = useState("");
  const [packages, setPackages] = useState<CommercialPackage[]>([]);
  const [placements, setPlacements] = useState<CommercialPlacement[]>([]);
  const [quote, setQuote] = useState<CommercialQuote | null>(null);
  const [noSellablePackages, setNoSellablePackages] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";
  const preloadCampaignId = searchParams.get("campaignId")?.trim() ?? "";

  const goToStep = useCallback(
    (next: OwnerDeliveryAdApplicationStep) => {
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("step", String(next));
      router.push(`${pathname}?${qs.toString()}`);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
        const json = (await res.json()) as { ok?: boolean; stores?: EligibleStore[] };
        if (cancelled) return;
        const list = (json.stores ?? []).filter((s) => s.eligible);
        setStores(list);
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
    if (step === 1) return;
    if (!storeId || !inventoryKey) goToStep(1);
  }, [step, storeId, inventoryKey, goToStep]);

  useEffect(() => {
    if ((step === 3 || step === 4) && storeId) {
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
    }
  }, [step, storeId, lang]);

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

  const refetchCommercial = useCallback(async () => {
    if (!storeId) {
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
      const res = await fetch(`/api/me/delivery-ads/commercial?${qs.toString()}`, {
        credentials: "include",
      });
      const json = (await res.json()) as {
        ok?: boolean;
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
      if (!res.ok || !json.ok) {
        setPackages([]);
        setQuote(null);
        setNoSellablePackages(true);
        return;
      }
      setProductLabel(json.product?.displayName?.trim() || null);
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
      setPackages([]);
      setQuote(null);
      setNoSellablePackages(true);
    } finally {
      setCommercialLoading(false);
    }
  }, [inventoryKey, packageId, storeId]);

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
    setPackageId("");
    setPackages([]);
    setQuote(null);
    setPreviewStore(null);
    setError(null);
    setStoreSheetOpen(false);
  };

  const onSelectPlacement = (key: OwnerStoreSponsoredInventoryKey) => {
    setInventoryKey(key);
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

  const submit = useCallback(async () => {
    if (!storeId || !inventoryKey || !packageId) {
      setError(!storeId ? "store" : "inventory");
      return;
    }
    if (!acceptingApplications) {
      setError("applications_paused");
      return;
    }
    if (noSellablePackages || !quote) {
      setError("no_packages");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved = existingCampaign;
      if (saved) {
        const patchRes = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/${encodeURIComponent(saved.id)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inventoryKeys: [inventoryKey] }),
          }
        );
        const patchJson = (await patchRes.json()) as {
          ok?: boolean;
          error?: string;
          campaign?: OwnerSponsoredCampaignRow;
        };
        if (!patchRes.ok || !patchJson.ok || !patchJson.campaign) {
          setError(patchJson.error || "generic");
          return;
        }
        saved = patchJson.campaign;
      } else {
        const createRes = await fetch(
          `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventoryKeys: [inventoryKey],
              packageId,
              clientRequestId,
            }),
          }
        );
        const createJson = (await createRes.json()) as {
          ok?: boolean;
          error?: string;
          campaign?: OwnerSponsoredCampaignRow;
        };
        if (!createRes.ok || !createJson.ok || !createJson.campaign) {
          setError(createJson.error || "generic");
          return;
        }
        saved = createJson.campaign;
      }
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
        setError(
          actionJson.error === "quote_stale" || actionJson.refreshQuote
            ? "quote_stale"
            : actionJson.error || "generic"
        );
        return;
      }
      setDoneCampaign(actionJson.campaign ?? saved);
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }, [
    acceptingApplications,
    clientRequestId,
    existingCampaign,
    inventoryKey,
    noSellablePackages,
    packageId,
    quote,
    refetchCommercial,
    storeId,
  ]);

  const errorText =
    error === "inventory"
      ? t("owner_ads_error_inventory")
      : error === "store"
        ? t("owner_ads_error_store")
        : error === "quote_stale"
          ? t("owner_ads_error_quote_stale")
          : error === "applications_paused"
            ? t("owner_ads_error_applications_paused")
            : error === "no_packages"
              ? t("owner_ads_no_sellable_packages")
              : error
                ? safeT("owner_ads_error_generic", {
                    fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                    fallbackEn: "Something went wrong. Please try again.",
                  })
                : null;

  const canAdvanceStep1 = Boolean(storeId && inventoryKey);
  const canAdvanceStep2 = Boolean(
    packageId && quote && !noSellablePackages && !commercialLoading
  );

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
          value: quote.packageDisplayName || `${quote.durationDays}일`,
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

  const footerMode =
    step === 4
      ? quote && !noSellablePackages
        ? "submit"
        : "blocked"
      : step === 2 && (noSellablePackages || packages.length === 0)
        ? "blocked"
        : "next";

  const handlePrimary = () => {
    if (step === 1 && canAdvanceStep1) goToStep(2);
    else if (step === 2 && canAdvanceStep2) goToStep(3);
    else if (step === 3) goToStep(4);
    else if (step === 4) void submit();
  };

  if (doneCampaign) {
    return (
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-lg px-4 pt-4 pb-8`}
        data-owner-ads-workspace="store-sponsored"
        data-owner-ads-wizard="step-gated"
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
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-ui-rect border border-[#BDBDBD] bg-white px-4 text-[14px] font-semibold text-sam-fg"
              onClick={() => router.push(DELIVERY_AD_OWNER_ROUTES.hub)}
            >
              {t("owner_ads_back_hub")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stepContent = (() => {
    if (!loaded) {
      return <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>;
    }
    if (step === 1) {
      return (
        <div className="space-y-3" data-owner-ads-step-panel="1">
          <OwnerStoreAdminDashSection title={t("owner_ads_section_store")}>
            {stores.length === 0 ? (
              <p className="text-[13px] text-sam-muted">{t("owner_ads_no_eligible_store")}</p>
            ) : (
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-left"
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
          <OwnerStoreAdminDashSection title={t("owner_ads_section_product")}>
            <p className="text-[14px] font-semibold text-sam-fg">
              {productLabel || t("owner_ads_product_store_sponsored")}
            </p>
            <p className="mt-1 text-[12px] text-sam-muted">
              {t("owner_ads_product_store_sponsored_desc")}
            </p>
          </OwnerStoreAdminDashSection>
          <OwnerStoreAdminDashSection title={t("owner_ads_section_placement")}>
            <DeliveryAdOwnerPlacementChipGrid
              options={placementOptions}
              selected={inventoryKey}
              onSelect={onSelectPlacement}
              labelFor={(key) => deliveryAdCommercialPlacementLabel(key, lang)}
              helpFor={(key) =>
                key === "STORES_HOME_FEED"
                  ? t("owner_ads_placement_home_help")
                  : t("owner_ads_placement_category_help")
              }
            />
          </OwnerStoreAdminDashSection>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div className="space-y-3" data-owner-ads-step-panel="2">
          <OwnerStoreAdminDashSection title={t("owner_ads_section_packages")}>
            {commercialLoading ? (
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
                  <p className="mt-2 text-[12px] text-sam-muted">
                    {t("owner_ads_no_sellable_packages")}
                  </p>
                ) : null}
              </>
            )}
          </OwnerStoreAdminDashSection>
        </div>
      );
    }
    if (step === 3) {
      return (
        <div data-owner-ads-step-panel="3">
          <DeliveryAdOwnerPreviewWorkspace
            productKind="store_sponsored"
            selectedInventoryKey={inventoryKey}
            surfaceEnabled
            store={previewStore}
            storeLoadError={previewStoreError}
            presentationMode="owner_product"
          />
        </div>
      );
    }
    return (
      <div className="space-y-3" data-owner-ads-step-panel="4">
        {quote ? (
          <DeliveryAdOwnerApplicationConfirm
            rows={confirmRows}
            totalDisplay={quote.finalPayableDisplay}
          />
        ) : (
          <p className="rounded-ui-rect border border-[#BDBDBD] bg-[#F5F5F5] px-3 py-4 text-[13px] text-sam-muted">
            {t("owner_ads_sale_preparing_body")}
          </p>
        )}
        {inventoryKey && previewStore ? (
          <div className="mt-3 scale-[0.85] origin-top">
            <DeliveryAdOwnerPreviewWorkspace
              productKind="store_sponsored"
              selectedInventoryKey={inventoryKey}
              surfaceEnabled
              store={previewStore}
              storeLoadError={false}
              presentationMode="owner_product"
            />
          </div>
        ) : null}
      </div>
    );
  })();

  void canAdvanceOwnerApplicationStep;

  return (
    <>
      <OwnerDeliveryAdApplicationWizardShell
        activeStep={step}
        workspace="store-sponsored"
        title={t("owner_ads_workspace_store_sponsored_title")}
        formPadStyle={formPadStyle}
        footerPadStyle={footerPadStyle}
        footerFixedClassName={footerFixedClassName}
        keyboardOpen={keyboardOpen}
        footerMode={footerMode}
        primaryBusy={busy}
        primaryDisabled={
          step === 1
            ? !canAdvanceStep1
            : step === 2
              ? !canAdvanceStep2
              : step === 4
                ? footerMode === "blocked"
                : false
        }
        showBack={step > 1}
        onBack={() => goToStep((step - 1) as OwnerDeliveryAdApplicationStep)}
        onPrimary={handlePrimary}
      >
        {errorText ? (
          <p className="mb-3 text-[13px] text-red-600" role="alert">
            {errorText}
          </p>
        ) : null}
        {stepContent}
      </OwnerDeliveryAdApplicationWizardShell>

      <DibayBottomSheet
        open={storeSheetOpen}
        onClose={() => setStoreSheetOpen(false)}
        title={t("owner_ads_select_store")}
        anchor="above-bottom-nav"
        ariaLabel={t("owner_ads_select_store")}
        panelClassName="!max-w-md"
        contentPaddingBottomPx={contentPaddingBottomPx}
      >
        <ul className="mt-3 space-y-2">
          {stores.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectStore(s.id)}
                className={`flex w-full items-center gap-3 rounded-ui-rect border p-3 text-left ${
                  storeId === s.id
                    ? "border-signature bg-sam-app"
                    : "border-sam-border bg-sam-surface"
                }`}
              >
                {s.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.profileImageUrl}
                    alt=""
                    className="h-12 w-12 rounded-ui-rect object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-ui-rect bg-sam-app" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-sam-fg">{s.storeName}</p>
                  {s.categoryLabel ? (
                    <p className="text-[12px] text-sam-muted">{s.categoryLabel}</p>
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
