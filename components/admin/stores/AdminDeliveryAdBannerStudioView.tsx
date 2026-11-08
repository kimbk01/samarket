"use client";

import { AdminActionButton, AdminActionLabel } from "@/components/admin/ui/AdminActionButton";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DeliveryAdCampaignPlacementPreviews } from "@/components/stores/advertising/DeliveryAdCampaignPlacementPreviews";
import type { AdminDeliveryAdListItem } from "@/lib/stores/advertising/admin-delivery-ad-loader";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  DELIVERY_AD_CTA_TARGETS,
  type DeliveryAdCtaTarget,
} from "@/lib/stores/advertising/delivery-ad-creative";
import {
  isDeliveryBannerCreativeAssetReady,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import {
  adminDeliveryAdInventoryAspectLabel,
  adminDeliveryAdInventoryHumanLabel,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { translateBy } from "@/lib/i18n/translate-by";

type Props = {
  campaignId: string;
  productHint?: "banner" | null;
};

export function AdminDeliveryAdBannerStudioView({ campaignId, productHint = "banner" }: Props) {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<AdminDeliveryAdListItem | null>(null);
  const [creative, setCreative] = useState<{
    assetPath: string;
    ctaType?: string | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    createdAt?: string | null;
  } | null>(null);
  const [placementPreview, setPlacementPreview] =
    useState<DeliveryAdPlacementPreviewPayload | null>(null);
  const [editCtaType, setEditCtaType] = useState<DeliveryAdCtaTarget>("store_detail");
  const [fileInputKey, setFileInputKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = productHint ? `?product=${productHint}` : "";
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        campaign?: AdminDeliveryAdListItem;
        creative?: typeof creative;
        placementPreview?: DeliveryAdPlacementPreviewPayload | null;
      };
      if (!res.ok || !json.ok || !json.campaign) {
        setError(json.error || "load_failed");
        return;
      }
      if (json.campaign.productKind !== "banner") {
        setError("not_banner");
        return;
      }
      setCampaign(json.campaign);
      setCreative(json.creative ?? null);
      setPlacementPreview(json.placementPreview ?? null);
      const cta = json.creative?.ctaType;
      if (cta && (DELIVERY_AD_CTA_TARGETS as readonly string[]).includes(cta)) {
        setEditCtaType(cta as DeliveryAdCtaTarget);
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [campaignId, productHint]);

  useEffect(() => {
    void load();
  }, [load]);

  const inventoryKey = campaign?.inventoryKeys[0] ?? "STORES_HOME_HERO";
  const aspect = adminDeliveryAdInventoryAspectLabel(inventoryKey);

  const bannerCreative = useMemo(() => {
    const asset = creative?.assetPath || campaign?.imageUrl;
    if (!isDeliveryBannerCreativeAssetReady(asset)) return null;
    return {
      assetUrl: String(asset),
      headline: campaign?.headline ?? campaign?.title ?? null,
      subcopy: null,
      alt: campaign?.title || "banner",
    };
  }, [campaign, creative]);

  async function uploadAndReplaceCreative(file: File) {
    if (!campaign || busy) return;
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaignId", campaignId);
      form.append("inventoryKey", inventoryKey);
      const upRes = await fetch("/api/admin/delivery-ads/upload-banner-image", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const upJson = (await upRes.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        url?: string;
        width?: number;
        height?: number;
      };
      if (!upRes.ok || !upJson.ok || !upJson.url) {
        setError(upJson.error || "upload_failed");
        return;
      }
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "replace_creative",
          expectedUpdatedAt: campaign.updatedAt,
          assetPath: upJson.url,
          sourceWidth: Number(upJson.width ?? 0),
          sourceHeight: Number(upJson.height ?? 0),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "replace_failed");
        return;
      }
      setFileInputKey((k) => k + 1);
      await load();
      setSaveNotice(
        translateBy(lang, "admin_banner_creative_saved")
      );
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function removeCreative() {
    if (!campaign || busy) return;
    // v4 UI-10 — 소재 삭제는 확인 후 실행
    const ko = lang !== "en";
    const confirmed = await confirmAdminAction({
      // 다시 올리면 복구되는 노출 중지 성격 — 확인 1회
      level: adminActionLevel("exposeStop"),
      ko,
      title: ko ? "배너 이미지를 삭제할까요?" : "Remove the banner image?",
      description: ko
        ? "삭제하면 이 캠페인은 다시 「제작 필요」 상태가 되고, 새 이미지를 올리기 전까지 고객 화면에 배너가 보이지 않습니다."
        : "The campaign returns to 'Needs production' and the banner is not shown to customers until a new image is uploaded.",
      confirmLabel: ko ? "이미지 삭제" : "Remove image",
      destructive: true,
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "remove_creative",
          expectedUpdatedAt: campaign.updatedAt,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "remove_failed");
      else {
        await load();
        setSaveNotice(translateBy(lang, "admin_creative_removed"));
      }
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  async function saveDestination() {
    if (!campaign || busy) return;
    setBusy(true);
    setError(null);
    setSaveNotice(null);
    try {
      const res = await fetch(`/api/admin/delivery-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productKind: "banner",
          op: "destination",
          expectedUpdatedAt: campaign.updatedAt,
          ctaType: editCtaType,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "destination_failed");
      else {
        await load();
        setSaveNotice(
          translateBy(lang, "admin_destination_saved")
        );
      }
    } catch {
      setError("network_error");
    } finally {
      setBusy(false);
    }
  }

  const backHref = `${DELIVERY_AD_ADMIN_ROUTES.detail(campaignId)}?product=banner${
    searchParams.get("focus") === "operations" ? "&focus=operations" : ""
  }`;

  return (
    <AdminDeliveryCmsChrome help="home">
      <div className="space-y-4 pb-10" data-admin-delivery-ads-creative-studio="design-board">
        <div>
          <Link href={backHref} className="text-[12px] text-signature underline">
            ←{" "}
            {safeT("admin_delivery_ads_creative_studio_back")}
          </Link>
          <h1 className="mt-1 text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_creative_studio_title")}
          </h1>
          {campaign ? (
            <p className="mt-1 text-[13px] text-sam-muted">
              {campaign.storeName || campaign.storeId} ·{" "}
              {adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)}
            </p>
          ) : null}
        </div>

        <AdminDeliveryAdsSectionNav />

        {loading ? (
          <p className="text-[13px] text-sam-muted">{safeT("admin_delivery_ads_loading")}</p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {adminOperatorErrorMessage(error, lang !== "en")}
          </p>
        ) : null}
        {saveNotice ? (
          <p
            className="rounded-ui-rect border border-sam-primary/30 bg-sam-primary/5 px-3 py-2 text-[13px] font-medium text-sam-fg"
            role="status"
            data-admin-banner-save-notice="1"
          >
            {saveNotice}
          </p>
        ) : null}

        {campaign ? (
          <>
          <AdminCard title={translateBy(lang, "admin_request_summary")}>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2" data-admin-banner-request-summary="1">
              <div>
                <dt className="text-sam-muted">Owner</dt>
                <dd>{campaign.ownerDisplayName || campaign.ownerUserId || "—"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{translateBy(lang, "admin_store")}</dt>
                <dd>{campaign.storeName || campaign.storeId || "—"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{translateBy(lang, "admin_placement")}</dt>
                <dd>{adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{translateBy(lang, "admin_period")}</dt>
                <dd className="text-sam-muted">
                  {formatAdminManilaDateTime(campaign.startAt)} ~ {formatAdminManilaDateTime(campaign.endAt)} PHT
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sam-muted">{translateBy(lang, "admin_requested_copy")}</dt>
                <dd className="whitespace-pre-wrap">{campaign.headline || campaign.title || "—"}</dd>
              </div>
            </dl>
          </AdminCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard titleKey="admin_delivery_ads_section_creative_produce">
              {(() => {
                const g = DELIVERY_AD_BANNER_PIXEL_GUIDE[
                  inventoryKey === "STORES_SEARCH_TOP" ? "STORES_SEARCH_TOP" : "STORES_HOME_HERO"
                ];
                return (
                  <p className="text-[12px] text-sam-muted" data-admin-banner-pixel-guide="1">
                    {formatBannerPixelGuideLine(g, lang)}
                    <br />
                    {lang === "en" ? g.safeAreaNoteEn : g.safeAreaNoteKo}
                  </p>
                );
              })()}
              {aspect ? (
                <p className="sr-only" data-admin-banner-aspect={aspect}>
                  {aspect}
                </p>
              ) : null}
              <p className="mt-2 text-[13px] font-medium">
                {isDeliveryBannerCreativeAssetReady(creative?.assetPath || campaign.imageUrl)
                  ? safeT("admin_delivery_ads_creative_status_ready")
                  : safeT("admin_delivery_ads_creative_status_needs_production")}
              </p>
              {bannerCreative ? (
                <div className="relative mt-3 h-[160px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
                  <SamarketThumbnail
                    src={bannerCreative.assetUrl}
                    alt=""
                    fill
                    className="object-contain"
                  />
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-sam-muted">
                  {safeT("admin_delivery_ads_creative_placeholder_hint")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <AdminActionLabel variant="primary" data-admin-banner-pc-upload="1">
                  {bannerCreative
                    ? safeT("admin_delivery_ads_creative_replace")
                    : safeT("admin_delivery_ads_creative_pc_load")}
                  <input
                    key={fileInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadAndReplaceCreative(f);
                    }}
                  />
                </AdminActionLabel>
                <AdminActionButton variant="secondary" size="sm"
                  disabled={busy || !bannerCreative}
                  onClick={() => void removeCreative()}
                >
                  {safeT("admin_delivery_ads_creative_remove")}
                </AdminActionButton>
              </div>
              <div className="mt-4 border-t border-sam-border pt-4">
                <p className="text-[12px] font-semibold text-sam-fg">
                  {safeT("admin_delivery_ads_section_destination")}
                </p>
                <select
                  className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                  value={editCtaType}
                  disabled={busy}
                  onChange={(e) => setEditCtaType(e.target.value as DeliveryAdCtaTarget)}
                >
                  <option value="store_detail">
                    {safeT("owner_ads_banner_cta_store")}
                  </option>
                  <option value="store_menu">
                    {safeT("owner_ads_banner_cta_menu")}
                  </option>
                  <option value="store_promotion">
                    {safeT("owner_ads_banner_cta_promo")}
                  </option>
                </select>
                <AdminActionButton variant="secondary" size="sm" className="mt-3"
                  disabled={busy}
                  onClick={() => void saveDestination()}
                >
                  {safeT("admin_delivery_ads_destination_save")}
                </AdminActionButton>
              </div>
              <AdminActionButton variant="secondary" className="mt-4 w-full"
                onClick={() => router.push(backHref)}
              >
                {safeT("admin_delivery_ads_creative_studio_back")}
              </AdminActionButton>
            </AdminCard>

            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
              <p className="mb-2 text-[12px] font-semibold text-sam-muted">
                {safeT("admin_delivery_ads_section_preview")}
              </p>
              <DeliveryAdCampaignPlacementPreviews
                productKind="banner"
                inventoryKeys={campaign.inventoryKeys ?? [inventoryKey]}
                renderContext="admin_preview"
                placementPreview={placementPreview}
                bannerCreative={bannerCreative}
                ctaLabel={safeT("owner_ads_banner_cta_store")}
              />
            </div>
          </div>
          </>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
