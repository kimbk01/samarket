"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_EDGE_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DeliveryAdPlacementPreview } from "@/components/stores/advertising/DeliveryAdPlacementPreview";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  isOwnerBannerInventoryKey,
  ownerBannerAspectGuideCopy,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import type { OwnerBannerCampaignRow } from "@/lib/stores/advertising/owner-banner-writer";
import type { DeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import { isDeliveryAdCtaTarget } from "@/lib/stores/advertising/delivery-ad-creative";
import { uploadStoreOwnerProductImage } from "@/lib/stores/upload-store-product-image-client";

type EligibleStore = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  eligible: boolean;
};

type Step = "store" | "setup" | "preview" | "review" | "done";
type PreviewMode = "mobile" | "tablet";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function dateInputToStartIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}
function dateInputToEndIso(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

/** Crop source image to inventory aspect (center crop) — no stretch. */
async function cropImageToAspect(
  file: File,
  aspectW: number,
  aspectH: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const target = aspectW / aspectH;
  const src = bitmap.width / bitmap.height;
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (src > target) {
    sw = Math.round(bitmap.height * target);
    sx = Math.round((bitmap.width - sw) / 2);
  } else if (src < target) {
    sh = Math.round(bitmap.width / target);
    sy = Math.round((bitmap.height - sh) / 2);
  }
  const outW = Math.min(sw, 1920);
  const outH = Math.round(outW / target);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("crop_failed");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("crop_failed"))),
      "image/jpeg",
      0.92
    );
  });
  return { blob, width: outW, height: outH };
}

export function OwnerBannerCreateView() {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = useId();
  const [step, setStep] = useState<Step>("store");
  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storeId, setStoreId] = useState("");
  const [inventoryKey, setInventoryKey] = useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [ctaType, setCtaType] = useState<DeliveryAdCtaTarget>("store_detail");
  const [headline, setHeadline] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return toDateInputValue(d);
  });
  const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<OwnerBannerCampaignRow | null>(null);
  const [clientRequestId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `req_${Date.now()}`
  );
  const preloadCampaignId = searchParams.get("campaignId")?.trim() ?? "";
  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";

  const aspectGuide = useMemo(() => ownerBannerAspectGuideCopy(inventoryKey), [inventoryKey]);

  const selectedStore = useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/delivery-ads", { credentials: "include" });
        const json = (await res.json()) as {
          ok?: boolean;
          stores?: EligibleStore[];
        };
        if (cancelled) return;
        const list = (json.stores ?? []).filter((s) => s.eligible);
        setStores(list);
        if (preloadStoreId && list.some((s) => s.id === preloadStoreId)) {
          setStoreId(preloadStoreId);
        } else if (list.length === 1) {
          setStoreId(list[0]!.id);
        }
      } catch {
        if (!cancelled) setStores([]);
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
        setCampaign(row);
        setStoreId(row.storeId);
        const inv = row.inventoryKeys[0];
        if (inv && isOwnerBannerInventoryKey(inv)) setInventoryKey(inv);
        setHeadline(row.creative?.headline ?? row.title ?? "");
        setAssetUrl(row.imageUrl || row.creative?.assetPath || "");
        if (row.creative?.sourceWidth) setSourceWidth(row.creative.sourceWidth);
        if (row.creative?.sourceHeight) setSourceHeight(row.creative.sourceHeight);
        const cta = row.creative?.ctaType;
        if (cta && isDeliveryAdCtaTarget(cta)) setCtaType(cta);
        setStartDate(row.startAt.slice(0, 10));
        setEndDate(row.endAt.slice(0, 10));
        setStep(row.imageUrl ? "preview" : "setup");
      } catch {
        /* keep empty create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadCampaignId, preloadStoreId]);

  const onPickImage = useCallback(
    async (file: File | null) => {
      if (!file || !storeId) return;
      setError(null);
      setBusy(true);
      try {
        const cropped = await cropImageToAspect(
          file,
          aspectGuide.width,
          aspectGuide.height
        );
        const croppedFile = new File([cropped.blob], "banner-crop.jpg", {
          type: "image/jpeg",
        });
        const uploaded = await uploadStoreOwnerProductImage(storeId, croppedFile);
        setAssetUrl(uploaded.url);
        setSourceWidth(cropped.width);
        setSourceHeight(cropped.height);
      } catch {
        setError("aspect_mismatch");
      } finally {
        setBusy(false);
      }
    },
    [aspectGuide.height, aspectGuide.width, storeId]
  );

  const saveDraft = useCallback(async () => {
    if (!storeId || !assetUrl || !sourceWidth || !sourceHeight) {
      setError("empty_asset_path");
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(storeId)}/delivery-ads/banner`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryKey,
            assetPath: assetUrl,
            sourceWidth,
            sourceHeight,
            headline: headline.trim() || null,
            ctaType,
            startAt: dateInputToStartIso(startDate),
            endAt: dateInputToEndIso(endDate),
            clientRequestId,
            campaignId: campaign?.id ?? null,
            supersedeCreativeId: campaign?.creativeId ?? null,
          }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerBannerCampaignRow;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "db_error");
        return null;
      }
      setCampaign(json.campaign);
      return json.campaign;
    } catch {
      setError("network");
      return null;
    } finally {
      setBusy(false);
    }
  }, [
    assetUrl,
    campaign?.creativeId,
    campaign?.id,
    clientRequestId,
    ctaType,
    endDate,
    headline,
    inventoryKey,
    sourceHeight,
    sourceWidth,
    startDate,
    storeId,
  ]);

  const submit = useCallback(async () => {
    const draft = campaign ?? (await saveDraft());
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/stores/${encodeURIComponent(draft.storeId)}/delivery-ads/${encodeURIComponent(draft.id)}/actions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action:
              draft.lifecycleStatus === "CHANGES_REQUESTED" ? "resubmit" : "submit",
            productKind: "banner",
          }),
        }
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        campaign?: OwnerBannerCampaignRow;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "db_error");
        return;
      }
      if (json.campaign) setCampaign(json.campaign);
      setStep("done");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }, [campaign, saveDraft]);

  const ctaLabel = t(
    ctaType === "store_menu"
      ? "owner_ads_banner_cta_menu"
      : ctaType === "store_promotion"
        ? "owner_ads_banner_cta_promo"
        : "owner_ads_banner_cta_store"
  );

  const previewWidthClass =
    previewMode === "tablet" ? "max-w-[768px]" : "max-w-[390px]";

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} px-4 pb-28 pt-4`}>
      <h1 className="text-[18px] font-bold text-sam-fg">{t("owner_ads_banner_create_title")}</h1>
      <p className="mt-1 text-[13px] text-sam-muted">{t("owner_ads_banner_create_desc")}</p>

      {error ? (
        <p className="mt-3 text-[13px] text-red-600" role="alert">
          {error === "aspect_mismatch"
            ? safeT("owner_ads_banner_aspect_error", {
                fallbackKo: `이 배너 지면은 ${aspectGuide.ratioLabel} 비율을 사용합니다. 이미지를 잘라 맞추거나 다른 이미지를 선택해 주세요.`,
                fallbackEn: `This placement uses a ${aspectGuide.ratioLabel} ratio. Crop the image or choose another.`,
              })
            : safeT("owner_ads_error_generic", {
                fallbackKo: "처리에 실패했습니다. 다시 시도해 주세요.",
                fallbackEn: "Something went wrong. Please try again.",
              })}
        </p>
      ) : null}

      {step === "store" ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_select_store")}>
          {!loaded ? (
            <p className="text-[13px] text-sam-muted">{t("owner_ads_loading")}</p>
          ) : stores.length === 0 ? (
            <p className="text-[13px] text-sam-muted">{t("owner_ads_no_eligible_store")}</p>
          ) : (
            <ul className="space-y-2">
              {stores.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full rounded-ui-rect border px-3 py-3 text-left text-[14px] ${
                      storeId === s.id
                        ? "border-sam-brand bg-sam-brand/5 font-semibold"
                        : "border-sam-border bg-sam-surface"
                    }`}
                    onClick={() => setStoreId(s.id)}
                  >
                    {s.storeName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </OwnerStoreAdminDashSection>
      ) : null}

      {step === "setup" || step === "preview" || step === "review" ? (
        <>
          <OwnerStoreAdminDashSection title={t("owner_ads_inventory_title")}>
            {OWNER_BANNER_INVENTORY_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-[14px]">
                <input
                  type="radio"
                  name={`${formId}-inv`}
                  checked={inventoryKey === key}
                  onChange={() => setInventoryKey(key)}
                />
                {t(
                  key === "STORES_SEARCH_TOP"
                    ? "owner_ads_inventory_search_top"
                    : "owner_ads_inventory_home_hero"
                )}
              </label>
            ))}
            <p className="mt-2 text-[12px] text-sam-muted">
              {safeT("owner_ads_banner_ratio_hint", {
                fallbackKo: `비율 ${aspectGuide.ratioLabel}`,
                fallbackEn: `Ratio ${aspectGuide.ratioLabel}`,
              })}
            </p>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_banner_upload_title")}>
            <div className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
              <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
                {t("owner_ads_banner_upload_cta")}
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`}
                onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                disabled={!storeId || busy}
              />
            </div>
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_banner_cta_title")}>
            <select
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              value={ctaType}
              onChange={(e) => setCtaType(e.target.value as DeliveryAdCtaTarget)}
            >
              <option value="store_detail">{t("owner_ads_banner_cta_store")}</option>
              <option value="store_menu">{t("owner_ads_banner_cta_menu")}</option>
              <option value="store_promotion">{t("owner_ads_banner_cta_promo")}</option>
            </select>
            <input
              className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} mt-2`}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={t("owner_ads_banner_headline_optional")}
            />
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={t("owner_ads_schedule_title")}>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
                  {t("owner_ads_start_date")}
                </label>
                <input
                  type="date"
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
                  {t("owner_ads_end_date")}
                </label>
                <input
                  type="date"
                  className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </OwnerStoreAdminDashSection>
        </>
      ) : null}

      {(step === "preview" || step === "review") && assetUrl ? (
        <OwnerStoreAdminDashSection title={t("delivery_ads_preview_section_title")}>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              className={`rounded-ui-rect border px-3 py-1 text-[12px] ${
                previewMode === "mobile" ? "border-sam-brand font-semibold" : "border-sam-border"
              }`}
              onClick={() => setPreviewMode("mobile")}
            >
              {t("owner_ads_banner_preview_mobile")}
            </button>
            <button
              type="button"
              className={`rounded-ui-rect border px-3 py-1 text-[12px] ${
                previewMode === "tablet" ? "border-sam-brand font-semibold" : "border-sam-border"
              }`}
              onClick={() => setPreviewMode("tablet")}
            >
              {t("owner_ads_banner_preview_tablet")}
            </button>
          </div>
          <div className={`mx-auto w-full ${previewWidthClass}`}>
            <DeliveryAdPlacementPreview
              productKind="banner"
              inventoryKey={inventoryKey}
              renderContext="owner_preview"
              surfaceEnabled
              bannerCreative={{
                assetUrl,
                headline: headline || null,
                subcopy: null,
                alt: headline || "banner",
              }}
              ctaLabel={ctaLabel}
              ctaDestinationLabel={selectedStore?.storeName ?? null}
            />
          </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      {step === "review" ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_review_title")}>
          <p className="text-[13px] text-sam-muted">{t("owner_ads_pricing_not_configured")}</p>
          <p className="mt-2 text-[13px] text-sam-muted">{t("owner_ads_review_admin_note")}</p>
        </OwnerStoreAdminDashSection>
      ) : null}

      {step === "done" && campaign ? (
        <OwnerStoreAdminDashSection title={t("owner_ads_success_title")}>
          <p className="text-[13px] text-sam-muted">{t("owner_ads_success_body")}</p>
          <button
            type="button"
            className={`${OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS} mt-4`}
            onClick={() =>
              router.push(
                `${DELIVERY_AD_OWNER_ROUTES.detail(campaign.id)}?storeId=${encodeURIComponent(campaign.storeId)}&product=banner`
              )
            }
          >
            {t("owner_ads_view_detail")}
          </button>
        </OwnerStoreAdminDashSection>
      ) : null}

      {step !== "done" ? (
        <BodyPortal>
          <div className={ownerStoreAdminFooterFixedClass()}>
            <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
              <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
                <button
                  type="button"
                  className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                  onClick={() => {
                    if (step === "store") router.push(DELIVERY_AD_OWNER_ROUTES.hub);
                    else if (step === "setup") setStep("store");
                    else if (step === "preview") setStep("setup");
                    else setStep("preview");
                  }}
                >
                  {t("owner_ads_back")}
                </button>
                {step === "store" ? (
                  <button
                    type="button"
                    className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                    disabled={!storeId}
                    onClick={() => setStep("setup")}
                  >
                    {t("owner_ads_next")}
                  </button>
                ) : null}
                {step === "setup" ? (
                  <button
                    type="button"
                    className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                    disabled={!assetUrl || busy}
                    onClick={() => setStep("preview")}
                  >
                    {t("owner_ads_banner_preview_title")}
                  </button>
                ) : null}
                {step === "preview" ? (
                  <button
                    type="button"
                    className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                    disabled={busy}
                    onClick={() => void saveDraft().then((c) => c && setStep("review"))}
                  >
                    {busy ? t("owner_ads_saving") : t("owner_ads_save_draft")}
                  </button>
                ) : null}
                {step === "review" ? (
                  <button
                    type="button"
                    className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    {busy ? t("owner_ads_submitting") : t("owner_ads_submit_cta")}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </BodyPortal>
      ) : null}
    </div>
  );
}
