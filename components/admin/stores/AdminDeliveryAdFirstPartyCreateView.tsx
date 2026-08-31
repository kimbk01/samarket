"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { DeliveryAdAdminFirstPartyStepProgress } from "@/components/stores/advertising/DeliveryAdAdminFirstPartyStepProgress";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import {
  adminDeliveryAdInventoryHumanLabel,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import { parseAdminDeliveryAdFirstPartyStep } from "@/lib/stores/advertising/admin-delivery-ad-first-party-step";

/**
 * R4 — Admin DIBAY first-party Banner create workspace (UI-2 step-gated).
 * Store Promotion first-party: NOT_IMPLEMENTED_MODEL_BLOCKED.
 */
export function AdminDeliveryAdFirstPartyCreateView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const step = parseAdminDeliveryAdFirstPartyStep(searchParams.get("step"));

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

  const step1Ready = Boolean(inventoryKey && startAt && endAt && headline.trim());
  const step2Ready = Boolean(assetPath.trim());
  const step3Ready = Boolean(ctaHref.trim());

  const goStep = (next: 1 | 2 | 3 | 4) => {
    const q = new URLSearchParams(searchParams.toString());
    q.set("step", String(next));
    router.push(`${pathname}?${q.toString()}`);
  };

  const upload = async (file: File) => {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
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
      setError(j.error ?? "upload_failed");
      return;
    }
    setAssetPath(j.url);
    setSourceWidth(Number(j.width ?? 0));
    setSourceHeight(Number(j.height ?? 0));
  };

  const submit = async () => {
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
        data-admin-first-party-wizard="step-gated"
        data-admin-first-party-step={step}
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
            {safeT("admin_delivery_ads_first_party_desc", {
              fallbackKo: "배너 전용 · Owner 없이 DIBAY_FIRST_PARTY 캠페인 생성",
              fallbackEn: "Banner only · create DIBAY_FIRST_PARTY without a fake Owner",
            })}
          </p>
          <p className="mt-2 text-[12px] text-sam-muted" data-store-promotion-fp="NOT_IMPLEMENTED_MODEL_BLOCKED">
            {safeT("admin_delivery_ads_first_party_store_promo_blocked", {
              fallbackKo: `매장 홍보 first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
              fallbackEn: `Store promotion first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
            })}
          </p>
          <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="mt-2 inline-block text-[13px] text-signature underline">
            {safeT("admin_delivery_ads_back", { fallbackKo: "광고 운영", fallbackEn: "Ad ops" })}
          </Link>
        </div>

        {error ? (
          <p className="text-[13px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <DeliveryAdAdminFirstPartyStepProgress activeStep={step} />

        {step === 1 ? (
          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-first-party-panel="1">
            <label className="block text-[12px] text-sam-muted">
              {safeT("admin_delivery_ads_first_party_placement", {
                fallbackKo: "노출 위치",
                fallbackEn: "Placement",
              })}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                value={inventoryKey}
                onChange={(e) => setInventoryKey(e.target.value as OwnerBannerInventoryKey)}
              >
                {OWNER_BANNER_INVENTORY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {adminDeliveryAdInventoryHumanLabel(k, lang)}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-first-party-panel="2">
            <label className="block text-[12px] text-sam-muted">
              {safeT("admin_delivery_ads_first_party_creative", {
                fallbackKo: "배너 이미지",
                fallbackEn: "Banner image",
              })}
              <input
                type="file"
                accept="image/*"
                className="mt-1 block w-full text-[13px]"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
            {assetPath ? (
              <p className="text-[12px] text-sam-muted">{assetPath.split("/").pop()}</p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-first-party-panel="3">
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
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4 lg:grid-cols-2" data-admin-first-party-panel="4">
            <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
              <p className="mb-2 text-[12px] font-semibold text-sam-muted">
                {safeT("admin_delivery_ads_first_party_preview", {
                  fallbackKo: "미리보기",
                  fallbackEn: "Preview",
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
            </div>
            <div className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px] text-sam-fg">
              <p>
                {adminDeliveryAdInventoryHumanLabel(inventoryKey, lang)} · {startAt.slice(0, 16)} ~{" "}
                {endAt.slice(0, 16)}
              </p>
              <p>{headline}</p>
              {subcopy ? <p className="text-sam-muted">{subcopy}</p> : null}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {step > 1 ? (
            <button
              type="button"
              className="min-h-[44px] rounded-ui-rect border border-sam-border px-4 text-[14px] font-semibold text-sam-fg"
              onClick={() => goStep((step - 1) as 1 | 2 | 3 | 4)}
            >
              {safeT("admin_delivery_ads_fp_back", { fallbackKo: "이전", fallbackEn: "Back" })}
            </button>
          ) : null}
          {step < 4 ? (
            <button
              type="button"
              disabled={
                (step === 1 && !step1Ready) ||
                (step === 2 && !step2Ready) ||
                (step === 3 && !step3Ready)
              }
              className="min-h-[44px] flex-1 rounded-ui-rect bg-[#0A823E] px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              onClick={() => goStep((step + 1) as 2 | 3 | 4)}
            >
              {safeT("admin_delivery_ads_fp_next", { fallbackKo: "다음", fallbackEn: "Next" })}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !assetPath || !startAt || !endAt}
              className="min-h-[44px] flex-1 rounded-ui-rect bg-signature px-4 text-[14px] font-semibold text-white disabled:opacity-50"
              data-first-party-submit="1"
              onClick={() => void submit()}
            >
              {safeT("admin_delivery_ads_first_party_submit", {
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
