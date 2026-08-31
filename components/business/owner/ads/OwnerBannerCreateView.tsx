"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerDeliveryAdApplicationWizardShell } from "@/components/business/owner/ads/OwnerDeliveryAdApplicationWizardShell";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_EDGE_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
} from "@/lib/business/owner-store-stack";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { useOwnerAdminBottomSheetKeyboard } from "@/lib/business/use-owner-admin-bottom-sheet-keyboard";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  isOwnerBannerInventoryKey,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import type { OwnerBannerCampaignRow } from "@/lib/stores/advertising/owner-banner-writer";
import type { DeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import { isDeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import { decodeOwnerAdPackagePricingModel } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";
import { DeliveryAdOwnerPackageCardGrid } from "@/components/stores/advertising/DeliveryAdOwnerPackageCardGrid";
import { DeliveryAdOwnerPlacementVisualGrid } from "@/components/stores/advertising/DeliveryAdOwnerPlacementVisualGrid";
import type { OwnerPlacementVisualOption } from "@/components/stores/advertising/DeliveryAdOwnerPlacementVisualGrid";
import { DeliveryAdOwnerApplicationConfirm } from "@/components/stores/advertising/DeliveryAdOwnerApplicationConfirm";
import { DeliveryAdOwnerPreviewWorkspace } from "@/components/stores/advertising/DeliveryAdOwnerPreviewWorkspace";
import { DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS } from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { deliveryAdCommercialPlacementLabel } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  canAdvanceOwnerApplicationStep,
  parseOwnerDeliveryAdApplicationStep,
  type OwnerDeliveryAdApplicationStep,
} from "@/lib/stores/advertising/owner-delivery-ad-application-step";

type EligibleStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
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

export function OwnerBannerCreateView() {
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

  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";
  const preloadCampaignId = searchParams.get("campaignId")?.trim() ?? "";
  const preloadInventoryKeyRaw = searchParams.get("inventoryKey")?.trim() ?? "";
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState(preloadStoreId);
  const [storeSheetOpen, setStoreSheetOpen] = useState(false);
  const { contentPaddingBottomPx } = useOwnerAdminBottomSheetKeyboard(storeSheetOpen);
  const [inventoryKey, setInventoryKey] = useState<OwnerBannerInventoryKey | "">(() =>
    isOwnerBannerInventoryKey(preloadInventoryKeyRaw) ? preloadInventoryKeyRaw : ""
  );
  const [packageId, setPackageId] = useState("");
  const [ctaType, setCtaType] = useState<DeliveryAdCtaTarget>("store_detail");
  const [requestMemo, setRequestMemo] = useState("");
  const [packages, setPackages] = useState<CommercialPackage[]>([]);
  const [placements, setPlacements] = useState<CommercialPlacement[]>([]);
  const [quote, setQuote] = useState<CommercialQuote | null>(null);
  const [noSellablePackages, setNoSellablePackages] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCampaign, setDoneCampaign] = useState<OwnerBannerCampaignRow | null>(null);
  const [existingCampaign, setExistingCampaign] = useState<OwnerBannerCampaignRow | null>(null);
  const [clientRequestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}`
  );

  const goToStep = useCallback(
    (next: OwnerDeliveryAdApplicationStep) => {
      const qs = new URLSearchParams(searchParams.toString());
      qs.set("step", String(next));
      if (storeId) qs.set("storeId", storeId);
      if (inventoryKey) qs.set("inventoryKey", inventoryKey);
      router.push(`${pathname}?${qs.toString()}`);
    },
    [pathname, router, searchParams, storeId, inventoryKey]
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
          campaign?: OwnerBannerCampaignRow;
          meta?: { productKind?: string };
        };
        if (cancelled || !res.ok || !json.ok || !json.campaign) return;
        if (json.meta?.productKind !== "banner") return;
        const row = json.campaign;
        if (row.lifecycleStatus !== "DRAFT" && row.lifecycleStatus !== "CHANGES_REQUESTED") {
          return;
        }
        setExistingCampaign(row);
        setStoreId(row.storeId);
        const inv = row.inventoryKeys[0];
        if (inv && isOwnerBannerInventoryKey(inv)) setInventoryKey(inv);
        const cta = row.creative?.ctaType;
        if (cta && isDeliveryAdCtaTarget(cta)) setCtaType(cta);
        if (row.creative?.subcopy) setRequestMemo(row.creative.subcopy);
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
    if (step === 1 || !loaded) return;
    if (!storeId || !inventoryKey) goToStep(1);
  }, [step, storeId, inventoryKey, goToStep, loaded]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  const placementOptions = useMemo(() => {
    const fromApi = placements
      .map((p) => p.inventoryKey)
      .filter(isOwnerBannerInventoryKey);
    if (fromApi.length) return fromApi;
    return [...OWNER_BANNER_INVENTORY_KEYS];
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
        productKind: "banner",
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
    setError(null);
    setStoreSheetOpen(false);
  };

  const onSelectPlacement = (key: OwnerBannerInventoryKey) => {
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
      const createRes = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/banner`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryKey,
            packageId,
            ctaType,
            adminProducesCreative: true,
            requestMemo: requestMemo.trim() || null,
            clientRequestId,
            campaignId: existingCampaign?.id ?? null,
            supersedeCreativeId: existingCampaign?.creativeId ?? null,
          }),
        }
      );
      const createJson = (await createRes.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerBannerCampaignRow;
      };
      if (!createRes.ok || !createJson.ok || !createJson.campaign) {
        setError(createJson.error || "generic");
        return;
      }
      const draft = createJson.campaign;
      const actionRes = await fetch(
        `/api/me/stores/${encodeURIComponent(draft.storeId)}/delivery-ads/${encodeURIComponent(draft.id)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action:
              draft.lifecycleStatus === "CHANGES_REQUESTED" ? "resubmit" : "submit",
            productKind: "banner",
            packageId,
            clientFinalPayableMinor: quote.finalPayableMinor,
          }),
        }
      );
      const actionJson = (await actionRes.json()) as {
        ok?: boolean;
        error?: string;
        refreshQuote?: boolean;
        campaign?: OwnerBannerCampaignRow;
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
      setDoneCampaign(actionJson.campaign ?? draft);
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }, [
    acceptingApplications,
    clientRequestId,
    ctaType,
    existingCampaign?.creativeId,
    existingCampaign?.id,
    inventoryKey,
    noSellablePackages,
    packageId,
    quote,
    refetchCommercial,
    requestMemo,
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
  /** Preview (step 3) does not require a sellable package — only confirm/submit does. */
  const canAdvanceStep2 = Boolean(storeId && inventoryKey && !commercialLoading);

  const ctaLabel =
    ctaType === "store_menu"
      ? t("owner_ads_banner_cta_menu")
      : ctaType === "store_promotion"
        ? t("owner_ads_banner_cta_promo")
        : t("owner_ads_banner_cta_store");

  const confirmRows = useMemo(() => {
    if (!selectedStore) return [];
    const rows = [
      { labelKey: "owner_ads_confirm_store", value: selectedStore.storeName },
      { labelKey: "owner_ads_confirm_product", value: t("owner_ads_product_banner") },
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
    if (requestMemo.trim()) {
      rows.push({
        labelKey: "owner_ads_request_memo_label",
        value: requestMemo.trim(),
      });
    }
    return rows;
  }, [quote, selectedStore, inventoryKey, lang, t, requestMemo]);

  const footerMode =
    step === 4
      ? quote && !noSellablePackages
        ? "submit"
        : "blocked"
      : "next";

  const handlePrimary = () => {
    if (step === 1 && canAdvanceStep1) goToStep(2);
    else if (step === 2 && canAdvanceStep2) goToStep(3);
    else if (step === 3) goToStep(4);
    else if (step === 4) void submit();
  };

  void canAdvanceOwnerApplicationStep;

  if (doneCampaign) {
    return (
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pt-4 pb-8`}
        data-owner-ads-workspace="banner"
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
                  `${DELIVERY_AD_OWNER_ROUTES.detail(doneCampaign.id)}?storeId=${encodeURIComponent(doneCampaign.storeId)}&product=banner`
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
                </div>
                <span className="shrink-0 text-[12px] font-medium text-signature">
                  {t("owner_ads_change_store")}
                </span>
              </button>
            )}
          </OwnerStoreAdminDashSection>
          <OwnerStoreAdminDashSection title={t("owner_ads_section_product")}>
            <p className="text-[14px] font-semibold text-sam-fg">
              {productLabel || t("owner_ads_product_banner")}
            </p>
            <p className="mt-1 text-[12px] text-sam-muted">{t("owner_ads_product_banner_desc")}</p>
          </OwnerStoreAdminDashSection>
          <div
            className="rounded-ui-rect border border-signature/30 bg-sam-app px-3 py-3"
            data-owner-ads-admin-creative="true"
          >
            <p className="text-[14px] font-semibold text-sam-fg">
              {t("owner_ads_banner_admin_creative_notice")}
            </p>
          </div>
          <OwnerStoreAdminDashSection title={t("owner_ads_section_placement")}>
            <DeliveryAdOwnerPlacementVisualGrid
              options={
                ([
                  {
                    key: "STORES_HOME_HERO" as const,
                    title: safeT("owner_ads_launch_home_hero_title", {
                      fallbackKo: "배달 홈 상단 배너",
                      fallbackEn: "Delivery home top banner",
                    }),
                    help: safeT("owner_ads_launch_home_hero_help", {
                      fallbackKo: "배달 홈 상단에서 여러 배너가 슬라이드로 노출됩니다.",
                      fallbackEn: "Appears in the Delivery Home top banner carousel.",
                    }),
                    miniature: "home_hero_carousel" as const,
                  },
                  {
                    key: "STORES_SEARCH_TOP" as const,
                    title: safeT("owner_ads_launch_search_top_title", {
                      fallbackKo: "검색 결과 상단 배너",
                      fallbackEn: "Search results top banner",
                    }),
                    help: safeT("owner_ads_launch_search_top_help", {
                      fallbackKo: "검색 결과가 있을 때 매장 목록 위에 배너가 표시됩니다.",
                      fallbackEn: "Shown above store results when a search has matches.",
                    }),
                    miniature: "search_top_single" as const,
                  },
                ] satisfies OwnerPlacementVisualOption<OwnerBannerInventoryKey>[])
              }
              selected={inventoryKey}
              onSelect={onSelectPlacement}
              adTagLabel={safeT("owner_ads_customer_ad_tag", {
                fallbackKo: "광고",
                fallbackEn: "Ad",
              })}
            />
          </OwnerStoreAdminDashSection>
          <OwnerStoreAdminDashSection title={t("owner_ads_banner_destination_question")}>
            <div className="space-y-2" data-owner-ads-banner-destination="human">
              {(
                [
                  {
                    value: "store_detail" as const,
                    label: t("owner_ads_banner_cta_store"),
                    help: t("owner_ads_banner_dest_store_help"),
                  },
                  {
                    value: "store_menu" as const,
                    label: t("owner_ads_banner_cta_menu"),
                    help: t("owner_ads_banner_dest_menu_help"),
                  },
                  {
                    value: "store_promotion" as const,
                    label: t("owner_ads_banner_cta_promo"),
                    help: t("owner_ads_banner_dest_promo_help"),
                  },
                ] as const
              ).map((opt) => {
                const selected = ctaType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex w-full flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 ${
                      selected
                        ? "border-[#0A823E] bg-[#0A823E]/5"
                        : "border-sam-border bg-sam-surface hover:border-[#0A823E]/40"
                    }`}
                    aria-pressed={selected}
                    onClick={() => setCtaType(opt.value)}
                  >
                    <span className="text-[14px] font-semibold text-sam-fg">
                      {selected ? "● " : "○ "}
                      {opt.label}
                    </span>
                    <span className="mt-0.5 text-[12px] text-sam-muted">{opt.help}</span>
                  </button>
                );
              })}
            </div>
            <div className={`${OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS} mt-3`}>
              <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} htmlFor="owner-banner-memo">
                {t("owner_ads_request_memo_label")}
              </label>
              <textarea
                id="owner-banner-memo"
                rows={3}
                value={requestMemo}
                onChange={(e) => setRequestMemo(e.target.value)}
                placeholder={t("owner_ads_request_memo_placeholder")}
                className={OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS}
              />
            </div>
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
            productKind="banner"
            selectedInventoryKey={inventoryKey}
            surfaceEnabled
            bannerCreative={null}
            ctaLabel={ctaLabel}
            ctaDestinationLabel={selectedStore?.storeName ?? null}
            presentationMode="owner_product"
          />
          <div
            className="mt-3 flex min-h-[88px] items-center justify-center rounded-ui-rect border border-dashed border-[#BDBDBD] bg-[#F5F5F5] px-3 py-6"
            data-owner-ads-banner-pending="1"
          >
            <p className="text-[14px] font-medium text-[#757575]">
              {t("owner_ads_banner_pending_preview")}
            </p>
          </div>
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
        {inventoryKey ? (
          <div className="mt-3 scale-[0.85] origin-top">
            <DeliveryAdOwnerPreviewWorkspace
              productKind="banner"
              selectedInventoryKey={inventoryKey}
              surfaceEnabled
              bannerCreative={null}
              ctaLabel={ctaLabel}
              ctaDestinationLabel={selectedStore?.storeName ?? null}
              presentationMode="owner_product"
            />
          </div>
        ) : null}
      </div>
    );
  })();

  return (
    <>
      <OwnerDeliveryAdApplicationWizardShell
        activeStep={step}
        workspace="banner"
        title={t("owner_ads_workspace_banner_title")}
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
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DibayBottomSheet>
    </>
  );
}
