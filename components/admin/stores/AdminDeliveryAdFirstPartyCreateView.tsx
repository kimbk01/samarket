"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { DeliveryAdAdminFirstPartyStepProgress } from "@/components/stores/advertising/DeliveryAdAdminFirstPartyStepProgress";
import { DeliveryAdOwnerPhoneFrame } from "@/components/stores/advertising/DeliveryAdOwnerPhoneFrame";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS,
  type AdminFirstPartyBannerInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-admin-first-party-writer";
import {
  adminDeliveryAdInventoryHumanLabel,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { bannerGeometryRejectMessage } from "@/lib/stores/advertising/validate-banner-creative-geometry";
import { deliveryBannerCreativeSpec } from "@/lib/ads/placement-creative-spec-ssot";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type DeviceMode = "phone" | "tablet";

/**
 * Admin DIBAY first-party Banner — MASTER wizard (Domain→…→Publish).
 * Uses ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS (HERO / INLINE_1 / CATEGORY_TOP).
 * Same DeliveryAdBanner renderer as Owner after publish.
 */
export function AdminDeliveryAdFirstPartyCreateView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>(1);
  const [device, setDevice] = useState<DeviceMode>("phone");
  const [inventoryKey, setInventoryKey] =
    useState<AdminFirstPartyBannerInventoryKey>("STORES_HOME_HERO");
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
  const [doneId, setDoneId] = useState<string | null>(null);

  const inventory = useMemo(() => inventoryViewFromKey(inventoryKey), [inventoryKey]);
  const guide = DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey];
  const creativeSpec = deliveryBannerCreativeSpec(inventoryKey);
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
      setDoneId(j.campaignId);
      setStep(7);
    } finally {
      setBusy(false);
    }
  };

  const goNext = () => {
    setError(null);
    if (step === 3 && !inventoryKey) return;
    if (step === 4 && !assetPath.trim()) {
      setError(lang === "en" ? "Upload a creative first." : "이미지를 먼저 업로드하세요.");
      return;
    }
    if (step === 5 && !scheduleOk) {
      setError(
        safeT("admin_delivery_ads_fp_schedule_invalid", {
          fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
          fallbackEn: "End must be after start.",
        })
      );
      return;
    }
    if (step < 6) setStep((s) => (s + 1) as WizardStep);
  };

  if (doneId) {
    return (
      <AdminDeliveryCmsChrome>
        <div
          className="mx-auto max-w-lg space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-center"
          data-admin-first-party-success="1"
        >
          <p className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_fp_done_title", {
              fallbackKo: "디바이 광고가 등록되었습니다.",
              fallbackEn: "DIBAY ad published.",
            })}
          </p>
          <p className="text-[13px] text-sam-muted tabular-nums" data-admin-fp-campaign-id={doneId}>
            {lang === "en" ? "Campaign #" : "캠페인 번호 "}
            {doneId}
          </p>
          <p className="text-[12px] text-sam-muted">
            {adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)} · {startAt} → {endAt}
          </p>
          <button
            type="button"
            className="min-h-[44px] w-full rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white"
            onClick={() => router.push(DELIVERY_AD_ADMIN_ROUTES.detail(doneId))}
          >
            {safeT("admin_delivery_ads_fp_view_detail", {
              fallbackKo: "상세 보기",
              fallbackEn: "View detail",
            })}
          </button>
        </div>
      </AdminDeliveryCmsChrome>
    );
  }

  return (
    <AdminDeliveryCmsChrome>
      <div
        className="space-y-4 pb-10"
        data-admin-first-party-create="design-board"
        data-admin-first-party-wizard="stepped"
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
                "DIBAY가 직접 운영하는 배너 광고입니다. Owner 결제와 Cash를 사용하지 않습니다.",
              fallbackEn: "DIBAY-operated banner. No Owner payment and no Cash.",
            })}
          </p>
          <p
            className="mt-2 text-[12px] text-sam-muted"
            data-store-promotion-fp="NOT_IMPLEMENTED_MODEL_BLOCKED"
          >
            {safeT("admin_delivery_ads_first_party_store_promo_blocked", {
              fallbackKo: `매장 홍보 first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
              fallbackEn: `Store promotion first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />
        <DeliveryAdAdminFirstPartyStepProgress activeStep={step} />

        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-[14px] font-bold">{lang === "en" ? "Domain" : "도메인"}</h2>
            <p className="mt-2 rounded-ui-rect border border-[#0A823E] bg-[#0A823E]/5 px-3 py-2 text-[14px] font-semibold">
              Delivery
            </p>
            <p className="mt-2 text-[12px] text-sam-muted">
              {lang === "en"
                ? "Feed / Boost create flows stay on their domain queues."
                : "Feed·Boost 만들기는 각 도메인 큐에서 진행합니다."}
            </p>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-2">
            <h2 className="text-[14px] font-bold">{lang === "en" ? "Product" : "상품"}</h2>
            <button
              type="button"
              className="flex w-full items-center rounded-ui-rect border border-[#0A823E] bg-[#0A823E]/5 px-3 py-2.5 text-left font-semibold"
              aria-pressed
            >
              ● Banner
            </button>
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center rounded-ui-rect border border-sam-border px-3 py-2.5 text-left text-sam-muted opacity-60"
              data-store-promotion-fp="NOT_IMPLEMENTED_MODEL_BLOCKED"
            >
              ○ Store Sponsored — {R4_STORE_PROMOTION_FIRST_PARTY.status}
            </button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-[14px] font-bold text-sam-fg">
              {safeT("admin_delivery_ads_first_party_placement", {
                fallbackKo: "노출 위치",
                fallbackEn: "Placement",
              })}
            </h2>
            <div className="space-y-2">
              {ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS.map((k) => {
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
                      {formatBannerPixelGuideLine(g, lang)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-[14px] font-bold text-sam-fg">
              {safeT("admin_delivery_ads_first_party_creative", {
                fallbackKo: "Creative",
                fallbackEn: "Creative",
              })}
            </h2>
            {creativeSpec ? (
              <aside
                className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app p-3 text-[12px] text-sam-muted"
                data-admin-fp-creative-spec="1"
              >
                <p>
                  {creativeSpec.ratioLabel} · {creativeSpec.recommendedWidth}×
                  {creativeSpec.recommendedHeight}px (min {creativeSpec.minWidth}×
                  {creativeSpec.minHeight})
                </p>
                <p className="mt-1">{lang === "en" ? creativeSpec.safeAreaNoteEn : creativeSpec.safeAreaNoteKo}</p>
              </aside>
            ) : null}
            <p className="text-[12px] text-sam-muted" data-admin-fp-pixel-guide="1">
              {formatBannerPixelGuideLine(guide, lang)}
            </p>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white">
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetPath} alt="" className="w-full rounded-ui-rect border object-cover" />
                <p className="text-[11px] tabular-nums text-sam-muted">
                  {sourceWidth}×{sourceHeight}px
                </p>
              </div>
            ) : null}
            <label className="block text-[12px] text-sam-muted">
              Headline
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </label>
            <label className="block text-[12px] text-sam-muted">
              CTA path
              <input
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                value={ctaHref}
                onChange={(e) => setCtaHref(e.target.value)}
              />
            </label>
          </section>
        ) : null}

        {step === 5 ? (
          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-[14px] font-bold">
              {safeT("admin_delivery_ads_first_party_schedule", {
                fallbackKo: "기간 · 금액",
                fallbackEn: "Schedule · amount",
              })}
            </h2>
            <p className="text-[12px] text-sam-muted">
              {lang === "en" ? "Admin Direct: ADMIN_NO_CHARGE" : "Admin Direct: 과금 없음 (ADMIN_NO_CHARGE)"}
            </p>
            <label className="block text-[12px] text-sam-muted">
              Start
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </label>
            <label className="block text-[12px] text-sam-muted">
              End
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </label>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex gap-2">
              {(["phone", "tablet"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`rounded-ui-rect px-3 py-1.5 text-[12px] font-semibold ${
                    device === d ? "bg-[#0A823E] text-white" : "border border-sam-border"
                  }`}
                  onClick={() => setDevice(d)}
                  data-admin-fp-preview-device={d}
                >
                  {d === "phone" ? "Mobile" : "Tablet"}
                </button>
              ))}
            </div>
            <div className={device === "tablet" ? "mx-auto max-w-[420px]" : "mx-auto max-w-[280px]"}>
              <DeliveryAdOwnerPhoneFrame
                label={adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)}
              >
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
                  <p className="p-4 text-[13px] text-sam-muted">—</p>
                )}
              </DeliveryAdOwnerPhoneFrame>
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-ui-rect border border-sam-border px-4 text-[14px] font-semibold"
            onClick={() => {
              if (step === 1) router.push(DELIVERY_AD_ADMIN_ROUTES.hub);
              else setStep((s) => (s - 1) as WizardStep);
            }}
          >
            {step === 1
              ? safeT("admin_delivery_ads_fp_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })
              : lang === "en"
                ? "Back"
                : "이전"}
          </button>
          {step < 6 ? (
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white"
              onClick={goNext}
            >
              {lang === "en" ? "Next" : "다음"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit}
              className="min-h-[44px] flex-1 rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
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
          )}
        </div>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
