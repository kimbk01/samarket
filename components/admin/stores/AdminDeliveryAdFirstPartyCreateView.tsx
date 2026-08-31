"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import {
  adminDeliveryAdInventoryHumanLabel,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { bannerGeometryRejectMessage } from "@/lib/stores/advertising/validate-banner-creative-geometry";

/**
 * Admin DIBAY first-party Banner — single-page workspace (no step wizard).
 */
export function AdminDeliveryAdFirstPartyCreateView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();

  const [inventoryKey, setInventoryKey] = useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [headline, setHeadline] = useState("");
  const [subcopy, setSubcopy] = useState("");
  const [ctaHref, setCtaHref] = useState("/stores");
  const [assetPath, setAssetPath] = useState("");
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inventory = useMemo(() => inventoryViewFromKey(inventoryKey), [inventoryKey]);
  const guide = DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey];
  const scheduleOk =
    Boolean(startAt && endAt) && new Date(endAt).getTime() > new Date(startAt).getTime();
  const canSubmit = Boolean(
    inventoryKey && scheduleOk && headline.trim() && assetPath.trim() && ctaHref.trim() && !busy
  );

  const upload = async (file: File) => {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("inventoryKey", inventoryKey);
    const res = await adminFetch("/api/admin/delivery-ads/upload-banner-image", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      width?: number;
      height?: number;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.url) {
      if (
        j.error === "aspect_mismatch" ||
        j.error === "below_min_pixels" ||
        j.error === "invalid_dimensions"
      ) {
        setError(
          bannerGeometryRejectMessage({
            error: j.error as "aspect_mismatch" | "below_min_pixels" | "invalid_dimensions",
            guide,
            lang,
            placementLabel: adminDeliveryAdInventoryHumanLabel(inventoryKey, lang),
          })
        );
        return;
      }
      setError(j.error ?? "upload_failed");
      return;
    }
    setAssetPath(j.url);
    setSourceWidth(Number(j.width ?? 0));
    setSourceHeight(Number(j.height ?? 0));
  };

  const submit = async () => {
    if (!canSubmit) {
      if (!scheduleOk) {
        setError(
          safeT("admin_delivery_ads_fp_schedule_invalid", {
            fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
            fallbackEn: "End must be after start.",
          })
        );
      }
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/first-party", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "banner",
          inventoryKey,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          assetPath,
          sourceWidth,
          sourceHeight,
          headline: headline || null,
          subcopy: subcopy || null,
          ctaHref,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaignId?: string;
        detailHref?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !j.ok || !j.campaignId) {
        setError(j.detail ? `${j.error}: ${j.detail}` : j.error ?? "create_failed");
        return;
      }
      router.push(j.detailHref ?? DELIVERY_AD_ADMIN_ROUTES.detail(j.campaignId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDeliveryCmsChrome>
      <div
        className="space-y-4 pb-10"
        data-admin-first-party-create="design-board"
        data-admin-first-party-wizard="single-page"
      >
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › First-party</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_first_party_title", {
              fallbackKo: "디바이 광고 만들기",
              fallbackEn: "Create DIBAY ad",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_first_party_single_desc", {
              fallbackKo:
                "DIBAY가 직접 운영하는 배너 광고입니다. Owner 결제와 Business Cash를 사용하지 않습니다.",
              fallbackEn:
                "DIBAY-operated banner. No Owner payment and no Business Cash.",
            })}
          </p>
          <p className="mt-2 text-[12px] text-sam-muted" data-store-promotion-fp="NOT_IMPLEMENTED_MODEL_BLOCKED">
            {safeT("admin_delivery_ads_first_party_store_promo_blocked", {
              fallbackKo: `매장 홍보 first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
              fallbackEn: `Store promotion first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4 min-w-0">
            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_placement", {
                  fallbackKo: "노출 위치",
                  fallbackEn: "Placement",
                })}
              </h2>
              <div className="space-y-2">
                {OWNER_BANNER_INVENTORY_KEYS.map((k) => {
                  const selected = inventoryKey === k;
                  const g = DELIVERY_AD_BANNER_PIXEL_GUIDE[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`flex w-full flex-col items-start rounded-ui-rect border px-3 py-2.5 text-left transition ${
                        selected
                          ? "border-[#0A823E] bg-[#0A823E]/5"
                          : "border-sam-border hover:border-[#0A823E]/40"
                      }`}
                      aria-pressed={selected}
                      onClick={() => {
                        setInventoryKey(k);
                        setAssetPath("");
                        setSourceWidth(0);
                        setSourceHeight(0);
                      }}
                    >
                      <span className="text-[14px] font-semibold">
                        {selected ? "● " : "○ "}
                        {adminDeliveryAdInventoryHumanLabel(k, lang)}
                      </span>
                      <span className="mt-0.5 text-[12px] text-sam-muted">
                        {k === "STORES_HOME_HERO"
                          ? safeT("admin_fp_home_hero_ops", {
                              fallbackKo: "슬라이드 배너 · 5초 · 1장 · dots · swipe · loop",
                              fallbackEn: "Carousel · 5s · 1 visible · dots · swipe · loop",
                            })
                          : safeT("admin_fp_search_ops", {
                              fallbackKo: "검색 결과 위 · 동시 1개",
                              fallbackEn: "Above search results · max 1",
                            })}{" "}
                        · {formatBannerPixelGuideLine(g, lang)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_schedule", {
                  fallbackKo: "일정",
                  fallbackEn: "Schedule",
                })}
              </h2>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_start", {
                  fallbackKo: "시작",
                  fallbackEn: "Start",
                })}
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_end", {
                  fallbackKo: "종료",
                  fallbackEn: "End",
                })}
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </label>
              {startAt && endAt && !scheduleOk ? (
                <p className="text-[12px] text-red-600" data-admin-fp-schedule-invalid="1">
                  {safeT("admin_delivery_ads_fp_schedule_invalid", {
                    fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
                    fallbackEn: "End must be after start.",
                  })}
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_creative", {
                  fallbackKo: "배너 이미지",
                  fallbackEn: "Banner image",
                })}
              </h2>
              <p className="text-[12px] text-sam-muted" data-admin-fp-pixel-guide="1">
                {formatBannerPixelGuideLine(guide, lang)}
                <br />
                {lang === "en" ? guide.safeAreaNoteEn : guide.safeAreaNoteKo}
              </p>
              <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white transition hover:bg-[#087a38] focus-within:ring-2 focus-within:ring-[#0A823E]/40">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                {safeT("admin_delivery_ads_fp_pc_upload", {
                  fallbackKo: "내 PC에서 이미지 불러오기",
                  fallbackEn: "Upload from PC",
                })}
              </label>
              {assetPath ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-ui-rect border border-sam-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetPath}
                      alt=""
                      className={`w-full object-cover ${
                        inventoryKey === "STORES_SEARCH_TOP" ? "aspect-[3/1]" : "aspect-[39/16]"
                      }`}
                    />
                  </div>
                  <p className="text-[11px] tabular-nums text-sam-muted">
                    {sourceWidth}×{sourceHeight}px
                  </p>
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-red-600"
                    onClick={() => {
                      setAssetPath("");
                      setSourceWidth(0);
                      setSourceHeight(0);
                    }}
                  >
                    {safeT("admin_delivery_ads_fp_remove_image", {
                      fallbackKo: "이미지 삭제",
                      fallbackEn: "Remove image",
                    })}
                  </button>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_copy_dest", {
                  fallbackKo: "배너 문구 / 목적지",
                  fallbackEn: "Copy / destination",
                })}
              </h2>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_headline", {
                  fallbackKo: "헤드라인",
                  fallbackEn: "Headline",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_subcopy", {
                  fallbackKo: "서브카피",
                  fallbackEn: "Subcopy",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={subcopy}
                  onChange={(e) => setSubcopy(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_destination", {
                  fallbackKo: "이동 경로 (앱 내부)",
                  fallbackEn: "Destination (in-app path)",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="/stores/..."
                />
              </label>
            </section>
          </div>

          <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
            <section className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
              <p className="mb-2 text-[12px] font-semibold text-sam-muted">
                {safeT("admin_delivery_ads_first_party_preview", {
                  fallbackKo: "고객 화면 미리보기",
                  fallbackEn: "Customer preview",
                })}
              </p>
              {assetPath ? (
                <DeliveryAdBanner
                  inventory={inventory}
                  creative={{
                    assetUrl: assetPath,
                    headline: headline || null,
                    subcopy: subcopy || null,
                  }}
                  destination={{ href: ctaHref, ctaLabel: null }}
                  adLabel={lang === "en" ? "Ad" : "광고"}
                  renderContext="admin_preview"
                  campaignId="preview"
                />
              ) : (
                <p className="text-[13px] text-sam-muted">—</p>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-ui-rect border border-sam-border px-4 text-[14px] font-semibold text-sam-fg transition hover:bg-sam-app"
            onClick={() => router.push(DELIVERY_AD_ADMIN_ROUTES.hub)}
          >
            {safeT("admin_delivery_ads_fp_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="min-h-[44px] flex-1 rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white transition hover:bg-[#087a38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            data-first-party-submit="1"
            onClick={() => void submit()}
          >
            {busy
              ? "…"
              : safeT("admin_delivery_ads_first_party_submit", {
                  fallbackKo: "디바이 광고 등록",
                  fallbackEn: "Publish DIBAY ad",
                })}
          </button>
        </div>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
