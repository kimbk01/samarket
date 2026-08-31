"use client";

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
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";

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
      const json = (await res.json()) as {
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
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("campaignId", campaignId);
      const upRes = await fetch("/api/admin/delivery-ads/upload-banner-image", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const upJson = (await upRes.json()) as {
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "replace_failed");
        return;
      }
      setFileInputKey((k) => k + 1);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeCreative() {
    if (!campaign || busy) return;
    setBusy(true);
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "remove_failed");
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveDestination() {
    if (!campaign || busy) return;
    setBusy(true);
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setError(json.error || "destination_failed");
      else await load();
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
            {safeT("admin_delivery_ads_creative_studio_back", {
              fallbackKo: "캠페인 workspace",
              fallbackEn: "Campaign workspace",
            })}
          </Link>
          <h1 className="mt-1 text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_creative_studio_title", {
              fallbackKo: "배너 제작 스튜디오",
              fallbackEn: "Banner creative studio",
            })}
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
          <p className="text-[13px] text-sam-muted">{safeT("admin_delivery_ads_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}</p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {campaign ? (
          <>
          <AdminCard title={lang === "en" ? "Request summary" : "요청 요약"}>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2" data-admin-banner-request-summary="1">
              <div>
                <dt className="text-sam-muted">Owner</dt>
                <dd>{campaign.ownerDisplayName || campaign.ownerUserId || "—"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{lang === "en" ? "Store" : "매장"}</dt>
                <dd>{campaign.storeName || campaign.storeId || "—"}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{lang === "en" ? "Placement" : "요청 위치"}</dt>
                <dd>{adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)}</dd>
              </div>
              <div>
                <dt className="text-sam-muted">{lang === "en" ? "Period" : "기간"}</dt>
                <dd className="text-sam-muted">{campaign.startAt.slice(0, 16)} ~ {campaign.endAt.slice(0, 16)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sam-muted">{lang === "en" ? "Requested copy" : "요청 문구"}</dt>
                <dd className="whitespace-pre-wrap">{campaign.headline || campaign.title || "—"}</dd>
              </div>
            </dl>
          </AdminCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <AdminCard titleKey="admin_delivery_ads_section_creative_produce">
              {aspect ? (
                <p className="text-[12px] text-sam-muted" data-admin-banner-aspect={aspect}>
                  {safeT("admin_delivery_ads_creative_aspect_hint", {
                    fallbackKo: `업로드 전 확인 · JPEG/PNG/WebP · 권장 비율 ${aspect}`,
                    fallbackEn: `Before upload · JPEG/PNG/WebP · recommended ${aspect}`,
                    vars: { ratio: aspect },
                  })}
                </p>
              ) : null}
              <p className="mt-2 text-[13px] font-medium">
                {isDeliveryBannerCreativeAssetReady(creative?.assetPath || campaign.imageUrl)
                  ? safeT("admin_delivery_ads_creative_status_ready", {
                      fallbackKo: "제작 완료",
                      fallbackEn: "Ready",
                    })
                  : safeT("admin_delivery_ads_creative_status_needs_production", {
                      fallbackKo: "제작 필요",
                      fallbackEn: "Needs production",
                    })}
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
                  {safeT("admin_delivery_ads_creative_placeholder_hint", {
                    fallbackKo:
                      "Owner 요청만 있습니다. Admin이 최종 배너 이미지를 업로드해야 합니다.",
                    fallbackEn:
                      "Owner request only. Admin must upload the final banner image.",
                  })}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <label
                  className="inline-flex min-h-[40px] cursor-pointer items-center rounded-ui-rect bg-[#0A823E] px-4 text-[13px] font-semibold text-white transition hover:bg-[#087a38] focus-within:ring-2 focus-within:ring-[#0A823E]/40 active:scale-[0.99]"
                  data-admin-banner-pc-upload="1"
                >
                  {bannerCreative
                    ? safeT("admin_delivery_ads_creative_replace", {
                        fallbackKo: "이미지 변경",
                        fallbackEn: "Replace image",
                      })
                    : safeT("admin_delivery_ads_creative_pc_load", {
                        fallbackKo: "내 PC에서 이미지 불러오기",
                        fallbackEn: "Load image from PC",
                      })}
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
                </label>
                <button
                  type="button"
                  disabled={busy || !bannerCreative}
                  className="rounded-ui-rect border border-sam-danger/40 px-3 py-2 text-[12px] text-sam-danger"
                  onClick={() => void removeCreative()}
                >
                  {safeT("admin_delivery_ads_creative_remove", {
                    fallbackKo: "이미지 삭제",
                    fallbackEn: "Remove image",
                  })}
                </button>
              </div>
              <div className="mt-4 border-t border-sam-border pt-4">
                <p className="text-[12px] font-semibold text-sam-fg">
                  {safeT("admin_delivery_ads_section_destination", {
                    fallbackKo: "이동 위치",
                    fallbackEn: "Destination",
                  })}
                </p>
                <select
                  className="mt-2 w-full rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1.5 text-[13px]"
                  value={editCtaType}
                  disabled={busy}
                  onChange={(e) => setEditCtaType(e.target.value as DeliveryAdCtaTarget)}
                >
                  <option value="store_detail">
                    {safeT("owner_ads_banner_cta_store", {
                      fallbackKo: "매장 상세",
                      fallbackEn: "Store detail",
                    })}
                  </option>
                  <option value="store_menu">
                    {safeT("owner_ads_banner_cta_menu", {
                      fallbackKo: "메뉴",
                      fallbackEn: "Menu",
                    })}
                  </option>
                  <option value="store_promotion">
                    {safeT("owner_ads_banner_cta_promo", {
                      fallbackKo: "프로모션",
                      fallbackEn: "Promotion",
                    })}
                  </option>
                </select>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                  onClick={() => void saveDestination()}
                >
                  {safeT("admin_delivery_ads_destination_save", {
                    fallbackKo: "목적지 확정 저장",
                    fallbackEn: "Save destination",
                  })}
                </button>
              </div>
              <button
                type="button"
                className="mt-4 min-h-[44px] w-full rounded-ui-rect border border-[#BDBDBD] bg-white text-[14px] font-semibold text-sam-fg"
                onClick={() => router.push(backHref)}
              >
                {safeT("admin_delivery_ads_creative_studio_back", {
                  fallbackKo: "workspace로 돌아가기",
                  fallbackEn: "Back to workspace",
                })}
              </button>
            </AdminCard>

            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
              <p className="mb-2 text-[12px] font-semibold text-sam-muted">
                {safeT("admin_delivery_ads_section_preview", {
                  fallbackKo: "고객 미리보기",
                  fallbackEn: "Customer preview",
                })}
              </p>
              <DeliveryAdCampaignPlacementPreviews
                productKind="banner"
                inventoryKeys={campaign.inventoryKeys ?? [inventoryKey]}
                renderContext="admin_preview"
                placementPreview={placementPreview}
                bannerCreative={bannerCreative}
                ctaLabel={safeT("owner_ads_banner_cta_store", {
                  fallbackKo: "매장 보기",
                  fallbackEn: "View store",
                })}
              />
            </div>
          </div>
          </>
        ) : null}
      </div>
    </AdminDeliveryCmsChrome>
  );
}
