"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS,
} from "@/lib/business/owner-store-stack";
import { OWNER_STORE_ADMIN_FOOTER_INNER_CLASS } from "@/lib/business/owner-admin-footer-actions";
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
import { DeliveryAdOwnerInsufficientCashSubmitModal } from "@/components/stores/advertising/DeliveryAdOwnerInsufficientCashSubmitModal";
import { DeliveryAdOwnerPreviewWorkspace } from "@/components/stores/advertising/DeliveryAdOwnerPreviewWorkspace";
import {
  DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS,
  DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS,
} from "@/lib/stores/advertising/delivery-ad-owner-ui-presentation";
import { deliveryAdCommercialPlacementLabel } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
  isOwnerBannerCreativePrepMode,
  type OwnerBannerCreativePrepMode,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { bannerGeometryRejectMessage } from "@/lib/stores/advertising/validate-banner-creative-geometry";
import {
  OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
} from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

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

type UploadedCreative = {
  path: string;
  url: string;
  width: number;
  height: number;
};

/**
 * Owner Banner application — single-page workspace (no next→next wizard).
 */
export function OwnerBannerCreateView() {
  const { t, safeT, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = language === "en" ? "en" : "ko";
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
  const [creativeMode, setCreativeMode] = useState<OwnerBannerCreativePrepMode>("owner_upload");
  const [uploaded, setUploaded] = useState<UploadedCreative | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [packages, setPackages] = useState<CommercialPackage[]>([]);
  const [placements, setPlacements] = useState<CommercialPlacement[]>([]);
  const [quote, setQuote] = useState<CommercialQuote | null>(null);
  const [noSellablePackages, setNoSellablePackages] = useState(false);
  const [acceptingApplications, setAcceptingApplications] = useState(true);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [shortageModalOpen, setShortageModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCampaign, setDoneCampaign] = useState<OwnerBannerCampaignRow | null>(null);
  const [existingCampaign, setExistingCampaign] = useState<OwnerBannerCampaignRow | null>(null);
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
        const asset = String(row.creative?.assetPath ?? row.imageUrl ?? "").trim();
        if (asset && asset !== OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET) {
          setCreativeMode("owner_upload");
          setUploaded({
            path: asset,
            url: row.imageUrl || asset,
            width: row.creative?.sourceWidth ?? 0,
            height: row.creative?.sourceHeight ?? 0,
          });
        } else {
          setCreativeMode("admin_produce");
        }
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

  const pixelGuide = inventoryKey ? DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey] : null;

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
    setUploaded(null);
    setError(null);
    setStoreSheetOpen(false);
  };

  const onSelectPlacement = (key: OwnerBannerInventoryKey) => {
    setInventoryKey(key);
    setPackageId("");
    setPackages([]);
    setQuote(null);
    setUploaded(null);
    setError(null);
  };

  const onSelectPackage = (id: string) => {
    setPackageId(id);
    setQuote(null);
    setError(null);
  };

  const onUploadFile = async (file: File | null) => {
    if (!file || !storeId || !inventoryKey) {
      setError(!storeId ? "store" : "inventory");
      return;
    }
    setUploadBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("inventoryKey", inventoryKey);
      if (existingCampaign?.id) form.set("campaignId", existingCampaign.id);
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/upload-banner-image`,
        { method: "POST", credentials: "include", body: form }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        path?: string;
        url?: string;
        width?: number;
        height?: number;
      };
      if (!res.ok || !json.ok || !json.path || !json.url) {
        if (
          json.error === "aspect_mismatch" ||
          json.error === "below_min_pixels" ||
          json.error === "invalid_dimensions"
        ) {
          const placementLabel = deliveryAdCommercialPlacementLabel(inventoryKey, lang);
          setError(
            `__geom__${bannerGeometryRejectMessage({
              error: json.error as "aspect_mismatch" | "below_min_pixels" | "invalid_dimensions",
              guide: DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey],
              lang,
              placementLabel,
            })}`
          );
          return;
        }
        setError(json.error || "generic");
        return;
      }
      setUploaded({
        path: json.path,
        url: json.url,
        width: json.width ?? 0,
        height: json.height ?? 0,
      });
      setCreativeMode("owner_upload");
    } catch {
      setError("generic");
    } finally {
      setUploadBusy(false);
    }
  };

  const canSubmit = Boolean(
    storeId &&
      inventoryKey &&
      packageId &&
      quote &&
      !noSellablePackages &&
      acceptingApplications &&
      (creativeMode === "admin_produce" ||
        (creativeMode === "owner_upload" && uploaded?.path))
  );

  const canSaveDraft = Boolean(
    storeId && inventoryKey && packageId && quote && !noSellablePackages && acceptingApplications
  );

  const persistBannerDraft = useCallback(async (): Promise<OwnerBannerCampaignRow | null> => {
    if (!storeId || !inventoryKey || !packageId || !quote) {
      setError(!storeId ? "store" : "inventory");
      return null;
    }
    if (creativeMode === "owner_upload" && !uploaded?.path) {
      setError("image_required");
      return null;
    }
    const adminProducesCreative = creativeMode === "admin_produce";
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
          adminProducesCreative,
          assetPath: adminProducesCreative ? "" : uploaded?.path,
          sourceWidth: adminProducesCreative ? undefined : uploaded?.width,
          sourceHeight: adminProducesCreative ? undefined : uploaded?.height,
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
      return null;
    }
    setExistingCampaign(createJson.campaign);
    return createJson.campaign;
  }, [
    clientRequestId,
    creativeMode,
    ctaType,
    existingCampaign?.creativeId,
    existingCampaign?.id,
    inventoryKey,
    packageId,
    quote,
    requestMemo,
    storeId,
    uploaded,
  ]);

  const saveDraftOnly = useCallback(async () => {
    setDraftBusy(true);
    setError(null);
    try {
      const saved = await persistBannerDraft();
      if (!saved) return;
      router.push(DELIVERY_AD_OWNER_ROUTES.hub);
    } catch {
      setError("generic");
    } finally {
      setDraftBusy(false);
    }
  }, [persistBannerDraft, router]);

  const submit = useCallback(async () => {
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
    setShortageModalOpen(false);
    try {
      const draft = await persistBannerDraft();
      if (!draft || !quote) return;
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
    noSellablePackages,
    packageId,
    persistBannerDraft,
    quote,
    refetchCommercial,
  ]);

  const requestSubmit = useCallback(() => {
    if (!canSubmit || !quote || cashBalanceMinor == null) return;
    if (cashBalanceMinor < quote.finalPayableMinor) {
      setShortageModalOpen(true);
      return;
    }
    void submit();
  }, [canSubmit, cashBalanceMinor, quote, submit]);

  const errorText =
    error?.startsWith("__geom__")
      ? error.slice("__geom__".length)
      : error === "inventory"
      ? t("owner_ads_error_inventory")
      : error === "store"
        ? t("owner_ads_error_store")
        : error === "quote_stale"
          ? t("owner_ads_error_quote_stale")
          : error === "applications_paused"
            ? t("owner_ads_error_applications_paused")
            : error === "no_packages"
              ? t("owner_ads_no_sellable_packages")
              : error === "image_required"
                ? safeT("owner_ads_banner_image_required", {
                    fallbackKo: "배너 이미지를 업로드해 주세요.",
                    fallbackEn: "Please upload a banner image.",
                  })
                : error === "image_spec"
                  ? safeT("owner_ads_banner_image_spec_error", {
                      fallbackKo: "배너 규격(비율·최소 픽셀)에 맞지 않습니다.",
                      fallbackEn: "Image does not match the required aspect or minimum pixels.",
                    })
                  : error === "capacity_full"
                    ? safeT("owner_ads_banner_capacity_full", {
                        fallbackKo: "이 위치에는 추가할 수 있는 배너가 없습니다. 다른 기간을 선택해 주세요.",
                        fallbackEn: "No banner slots left for this placement and period. Choose another schedule.",
                      })
                    : error
                      ? safeT("owner_ads_error_generic", {
                          fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                          fallbackEn: "Something went wrong. Please try again.",
                        })
                      : null;

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

  void isOwnerBannerCreativePrepMode;
  void OWNER_STORE_PROFILE_CONTROL_CLASS;
  void keyboardOpen;

  if (doneCampaign) {
    return (
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pt-4 pb-8`}
        data-owner-ads-workspace="banner"
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

  return (
    <>
      <div
        className={`${OWNER_STORE_STACK_Y_CLASS} mx-auto w-full max-w-[min(100%,42rem)] md:max-w-[min(100%,52rem)] px-4 pt-4`}
        style={formPadStyle}
        data-owner-ads-workspace="banner"
        data-owner-ads-wizard="single-page"
      >
        <h1 className="text-[18px] font-bold text-sam-fg">
          {t("owner_ads_workspace_banner_title")}
        </h1>
        <p className="mt-1 text-[12px] text-sam-muted">
          {safeT("owner_ads_banner_single_page_hint", {
            fallbackKo: "한 화면에서 매장·지면·기간·이미지·신청까지 완료합니다.",
            fallbackEn: "Complete store, placement, package, creative, and submit on one page.",
          })}
        </p>

        {errorText ? (
          <p className="mt-3 text-[13px] text-red-600" role="alert">
            {errorText}
          </p>
        ) : null}

        {!loaded ? (
          <p className="mt-4 text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
        ) : (
          <div className="mt-4 space-y-4 pb-28">
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

            <OwnerStoreAdminDashSection
              title={safeT("owner_ads_banner_placement_title", {
                fallbackKo: "배너 노출 위치",
                fallbackEn: "Banner placement",
              })}
            >
              <DeliveryAdOwnerPlacementVisualGrid
                options={
                  ([
                    {
                      key: "STORES_HOME_HERO" as const,
                      title: safeT("owner_ads_launch_home_hero_title", {
                        fallbackKo: "배달 홈 상단 배너",
                        fallbackEn: "Delivery home top banner",
                      }),
                      help: `${safeT("owner_ads_launch_home_hero_help", {
                        fallbackKo:
                          "배달 홈 맨 위 큰 배너 영역에 표시됩니다. 여러 광고가 함께 운영되면 5초 간격으로 슬라이드됩니다(스와이프·dots).",
                        fallbackEn:
                          "Top of Delivery Home. Multiple ads slide every 5s with swipe and dots.",
                      })} · ${formatBannerPixelGuideLine(
                        DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO,
                        lang
                      )}`,
                      miniature: "home_hero_carousel" as const,
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
                      help: selectedStore
                        ? safeT("owner_ads_banner_dest_store_help_named", {
                            fallbackKo: `고객이 배너를 누르면 ${selectedStore.storeName} 상세로 이동합니다.`,
                            fallbackEn: `Customers go to ${selectedStore.storeName} detail.`,
                          })
                        : t("owner_ads_banner_dest_store_help"),
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
              <p className="mt-2 text-[11px] text-sam-muted">
                {safeT("owner_ads_banner_dest_admin_final", {
                  fallbackKo: "Admin Studio에서 최종 확정합니다.",
                  fallbackEn: "Admin Studio finalizes the destination.",
                })}
              </p>
            </OwnerStoreAdminDashSection>

            <OwnerStoreAdminDashSection title={t("owner_ads_section_packages")}>
              {!inventoryKey ? (
                <p className="text-[13px] text-sam-muted">
                  {safeT("owner_ads_pick_placement_first", {
                    fallbackKo: "먼저 배너 노출 위치를 선택해 주세요.",
                    fallbackEn: "Select a banner placement first.",
                  })}
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
                      className="mt-2 rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2"
                      data-owner-ads-price-unset="1"
                    >
                      <p className="text-[13px] font-semibold text-amber-950">
                        {safeT("owner_ads_price_unset_title", {
                          fallbackKo: "이 광고 상품은 아직 판매 가격이 설정되지 않았습니다.",
                          fallbackEn: "This ad product does not have a sell price yet.",
                        })}
                      </p>
                      <p className="mt-1 text-[12px] text-amber-900">
                        {safeT("owner_ads_price_unset_body", {
                          fallbackKo: "가격 설정 후 신청할 수 있습니다.",
                          fallbackEn: "You can apply after a price is set.",
                        })}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </OwnerStoreAdminDashSection>

            <OwnerStoreAdminDashSection
              title={safeT("owner_ads_banner_image_prep_title", {
                fallbackKo: "배너 이미지 방식",
                fallbackEn: "Banner image prep",
              })}
            >
              <p className="mb-2 text-[13px] font-medium text-sam-fg">
                {safeT("owner_ads_banner_image_prep_question", {
                  fallbackKo: "배너 이미지는 어떻게 준비할까요?",
                  fallbackEn: "How will the banner image be prepared?",
                })}
              </p>
              {pixelGuide ? (
                <p className="mb-2 text-[12px] text-sam-muted" data-owner-ads-banner-pixel-guide="1">
                  {inventoryKey
                    ? deliveryAdCommercialPlacementLabel(inventoryKey, lang)
                    : ""}{" "}
                  · {formatBannerPixelGuideLine(pixelGuide, lang)}
                  <br />
                  {lang === "en" ? pixelGuide.safeAreaNoteEn : pixelGuide.safeAreaNoteKo}
                </p>
              ) : null}
              <div className="space-y-2" data-owner-ads-creative-mode="choice">
                <button
                  type="button"
                  className={`flex w-full flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left ${
                    creativeMode === "owner_upload"
                      ? "border-[#0A823E] bg-[#0A823E]/5"
                      : "border-sam-border bg-sam-surface"
                  }`}
                  aria-pressed={creativeMode === "owner_upload"}
                  onClick={() => setCreativeMode("owner_upload")}
                  data-owner-ads-creative-mode-option="owner_upload"
                >
                  <span className="text-[14px] font-semibold text-sam-fg">
                    {creativeMode === "owner_upload" ? "● " : "○ "}
                    {safeT("owner_ads_banner_mode_upload", {
                      fallbackKo: "직접 이미지 올리기",
                      fallbackEn: "Upload my image",
                    })}
                  </span>
                  <span className="mt-0.5 text-[12px] text-sam-muted">
                    {safeT("owner_ads_banner_mode_upload_help", {
                      fallbackKo: "규격에 맞춘 이미지를 올리면 Admin이 검수·수정할 수 있습니다.",
                      fallbackEn: "Upload a spec-compliant image. Admin can review/edit.",
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left ${
                    creativeMode === "admin_produce"
                      ? "border-[#0A823E] bg-[#0A823E]/5"
                      : "border-sam-border bg-sam-surface"
                  }`}
                  aria-pressed={creativeMode === "admin_produce"}
                  onClick={() => setCreativeMode("admin_produce")}
                  data-owner-ads-creative-mode-option="admin_produce"
                  data-owner-ads-admin-creative={creativeMode === "admin_produce" ? "true" : "false"}
                >
                  <span className="text-[14px] font-semibold text-sam-fg">
                    {creativeMode === "admin_produce" ? "● " : "○ "}
                    {safeT("owner_ads_banner_mode_admin", {
                      fallbackKo: "관리자에게 제작 요청",
                      fallbackEn: "Request admin production",
                    })}
                  </span>
                  <span className="mt-0.5 text-[12px] text-sam-muted">
                    {safeT("owner_ads_banner_mode_admin_help", {
                      fallbackKo: "이미지 없이 요청합니다. Admin이 최종 배너를 제작합니다.",
                      fallbackEn: "No image required. Admin produces the final banner.",
                    })}
                  </span>
                </button>
              </div>
              {creativeMode === "owner_upload" ? (
                <div className="mt-3 space-y-2" data-owner-ads-owner-upload="1">
                  <label className={`${DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS} min-h-[44px] w-full cursor-pointer`}>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadBusy || !inventoryKey || !storeId}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        void onUploadFile(f);
                        e.target.value = "";
                      }}
                    />
                    {uploadBusy
                      ? t("owner_ads_loading")
                      : uploaded
                        ? safeT("owner_ads_banner_image_change", {
                            fallbackKo: "이미지 변경",
                            fallbackEn: "Change image",
                          })
                        : safeT("owner_ads_banner_image_pick", {
                            fallbackKo: "이미지 선택",
                            fallbackEn: "Choose image",
                          })}
                  </label>
                  {uploaded?.url ? (
                    <div className="space-y-2">
                      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={uploaded.url}
                          alt=""
                          className={`w-full object-cover ${
                            "aspect-[39/16]"
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-sam-muted tabular-nums" data-owner-ads-upload-dims="1">
                        {uploaded.width}×{uploaded.height}px
                      </p>
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-red-600 underline-offset-2 hover:underline"
                        data-owner-ads-image-remove="1"
                        onClick={() => setUploaded(null)}
                      >
                        {safeT("owner_ads_banner_image_remove", {
                          fallbackKo: "이미지 삭제",
                          fallbackEn: "Remove image",
                        })}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-[12px] text-sam-muted" data-owner-ads-admin-creative="true">
                  {t("owner_ads_banner_pending_preview")}
                </p>
              )}
            </OwnerStoreAdminDashSection>

            <OwnerStoreAdminDashSection title={t("owner_ads_request_memo_label")}>
              <div className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
                <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS} htmlFor="owner-banner-memo">
                  {safeT("owner_ads_request_memo_admin", {
                    fallbackKo: "관리자 요청 메모",
                    fallbackEn: "Note for admin",
                  })}
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

            {inventoryKey ? (
              <OwnerStoreAdminDashSection
                title={safeT("owner_ads_customer_preview_title", {
                  fallbackKo: "고객 노출 예시",
                  fallbackEn: "Customer preview",
                })}
              >
                <DeliveryAdOwnerPreviewWorkspace
                  productKind="banner"
                  selectedInventoryKey={inventoryKey}
                  surfaceEnabled
                  bannerCreative={
                    creativeMode === "owner_upload" && uploaded?.url
                      ? {
                          assetUrl: uploaded.url,
                          headline: productLabel,
                          subcopy: null,
                          alt: selectedStore?.storeName ?? "banner",
                        }
                      : null
                  }
                  ctaLabel={ctaLabel}
                  ctaDestinationLabel={selectedStore?.storeName ?? null}
                  presentationMode="owner_product"
                />
              </OwnerStoreAdminDashSection>
            ) : null}

            <OwnerStoreAdminDashSection title={t("owner_ads_section_confirm")}>
              {quote ? (
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
                  className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-3"
                  data-owner-ads-price-unset="confirm"
                >
                  <p className="text-[13px] font-semibold text-amber-950">
                    {safeT("owner_ads_price_unset_title", {
                      fallbackKo: "이 광고 상품은 아직 판매 가격이 설정되지 않았습니다.",
                      fallbackEn: "This ad product does not have a sell price yet.",
                    })}
                  </p>
                  <p className="mt-1 text-[12px] text-amber-900">
                    {safeT("owner_ads_price_unset_body", {
                      fallbackKo: "가격 설정 후 신청할 수 있습니다.",
                      fallbackEn: "You can apply after a price is set.",
                    })}
                  </p>
                </div>
              )}
              {cashBalanceMinor != null ? (
                <p className="mt-2 text-[12px] text-sam-muted">
                  {t("owner_ads_business_cash_label")}: {formatDeliveryAdPhpMinor(cashBalanceMinor)}
                </p>
              ) : null}
            </OwnerStoreAdminDashSection>
          </div>
        )}
      </div>

      <div
        className={`${footerFixedClassName} border-t border-sam-border bg-sam-surface`}
        style={footerPadStyle}
        data-owner-ads-footer="owner-admin-ssot"
      >
        <div className={`${OWNER_STORE_ADMIN_FOOTER_INNER_CLASS} !h-auto flex flex-col gap-2 px-4 py-3`}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={`${DELIVERY_AD_OWNER_SECONDARY_BTN_CLASS} min-h-[48px] w-full sm:w-auto sm:min-w-[120px]`}
              disabled={!canSaveDraft || draftBusy || busy}
              data-owner-ads-draft-cta="save"
              onClick={() => void saveDraftOnly()}
            >
              {draftBusy ? t("owner_ads_loading") : t("owner_ads_save_draft")}
            </button>
            <button
              type="button"
              className={`${DELIVERY_AD_OWNER_PRIMARY_BTN_CLASS} min-h-[48px] w-full flex-1`}
              disabled={!canSubmit || busy || draftBusy}
              data-owner-ads-submit-cta="apply"
              onClick={() => requestSubmit()}
            >
              {busy
                ? t("owner_ads_loading")
                : safeT("owner_ads_apply_submit_cta", {
                    fallbackKo: "광고 신청",
                    fallbackEn: "Submit ad application",
                  })}
            </button>
          </div>
          <p className="text-center text-[11px] text-sam-muted">
            {safeT("owner_ads_confirm_business_cash_model_b", {
              fallbackKo: "관리자 승인 후 Cash로 결제합니다.",
              fallbackEn: "You pay with Cash after admin approval.",
            })}
          </p>
        </div>
      </div>

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
