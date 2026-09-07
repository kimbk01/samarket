"use client";

/**
 * CUT R2 — Delivery Hero create entry from Ads Direct.
 * Reuses first-party upload/writer + DeliveryAdBanner preview + hero slot occupancy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { adsCreateConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import type { HeroPlacementSlot } from "@/lib/admin/ads-exposure/hero-placement-slots";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { bannerGeometryRejectMessage } from "@/lib/stores/advertising/validate-banner-creative-geometry";

export function AdminAdsDirectDeliveryCreateView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const lang = ko ? "ko" : "en";
  const router = useRouter();
  const search = useSearchParams();
  const preselectSlot = Number(search.get("slot") || 0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inventoryKey = "STORES_HOME_HERO" as const;
  const inventory = useMemo(() => inventoryViewFromKey(inventoryKey), []);
  const guide = DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey];
  const createCopy = adsCreateConfirmCopy(ko);

  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [headline, setHeadline] = useState("");
  const [subcopy, setSubcopy] = useState("");
  const [ctaHref, setCtaHref] = useState("/stores");
  const [assetPath, setAssetPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [slots, setSlots] = useState<HeroPlacementSlot[]>([]);

  const loadSlots = useCallback(async () => {
    const res = await fetch("/api/admin/advertising/hero-placement-slots", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      slots?: HeroPlacementSlot[];
    };
    if (res.ok && json.ok && Array.isArray(json.slots)) setSlots(json.slots);
  }, []);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const scheduleOk =
    Boolean(startAt && endAt) && new Date(endAt).getTime() > new Date(startAt).getTime();
  const canSubmit = Boolean(
    scheduleOk && headline.trim() && assetPath.trim() && ctaHref.trim() && !busy
  );

  const upload = async (file: File) => {
    setError("");
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
            placementLabel: humanPlacementLabel(inventoryKey, ko),
          })
        );
        return;
      }
      setError(
        ko ? "이미지를 업로드하지 못했습니다." : "Could not upload the image."
      );
      return;
    }
    setAssetPath(j.url);
    setFileName(file.name);
    setSourceWidth(Number(j.width ?? 0));
    setSourceHeight(Number(j.height ?? 0));
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/delivery-ads/first-party", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product: "banner",
          inventoryKey,
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          assetPath,
          sourceWidth,
          sourceHeight,
          title: headline,
          headline,
          subcopy,
          ctaHref,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaignId?: string;
        detailHref?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.campaignId) {
        setError(
          json.error === "capacity_full"
            ? ko
              ? "빈 위치가 없습니다."
              : "No vacant slots."
            : ko
              ? "처리하지 못했습니다. 다시 시도해 주세요."
              : "Could not complete. Try again."
        );
        return;
      }
      setConfirmOpen(false);
      setSuccessMsg(ko ? "광고가 등록되었습니다." : "Ad registered.");
      router.push(json.detailHref || DELIVERY_AD_ADMIN_ROUTES.detail(json.campaignId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-admin-ads-direct-delivery="1">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising/direct" className="underline">
            {ko ? "광고 등록" : "Register ad"}
          </Link>
          {" › "}
          {ko ? "배달 홈 상단 배너" : "Delivery home hero"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "배달 홈 상단 배너" : "Delivery home hero banner"}
        </h1>
        <p className="text-[12px] text-sam-muted">
          {humanPlacementLabel(inventoryKey, ko)} · {inventoryKey}
          {preselectSlot >= 1 ? ` · Slide ${preselectSlot}` : ""}
        </p>
      </header>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-delivery-slots="1">
        <h2 className="text-[14px] font-bold text-sam-fg">
          {ko ? "슬라이드 점유" : "Slide occupancy"}
        </h2>
        <ol className="mt-3 space-y-2">
          {Array.from({ length: DELIVERY_HERO_CAPACITY }, (_, i) => {
            const slot = slots.find((s) => s.slideIndex === i + 1);
            const occupied = Boolean(slot?.occupied && slot.campaignId);
            return (
              <li
                key={i}
                className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 text-[13px]"
                data-hero-slide={i + 1}
                data-hero-slot-empty={occupied ? "0" : "1"}
              >
                <span className="font-semibold text-sam-muted">Slide {i + 1}</span>
                <span className="text-sam-fg">
                  {occupied
                    ? ko
                      ? "사용중"
                      : "Occupied"
                    : ko
                      ? "비어 있음"
                      : "Empty"}
                  {occupied && slot?.campaignLabel ? ` · ${slot.campaignLabel}` : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-delivery-creative="1">
        <h2 className="text-[14px] font-bold text-sam-fg">{ko ? "이미지" : "Image"}</h2>
        <dl
          className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]"
          data-admin-delivery-creative-spec="1"
        >
          <dt className="text-sam-muted">{ko ? "비율" : "Aspect"}</dt>
          <dd className="font-semibold">{guide.ratioLabel}</dd>
          <dt className="text-sam-muted">{ko ? "권장 크기" : "Recommended"}</dt>
          <dd className="font-semibold">
            {guide.recommendedWidth} × {guide.recommendedHeight}px
          </dd>
        </dl>
        <p className="mt-2 text-[12px] text-sam-muted">{formatBannerPixelGuideLine(guide, lang)}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-app px-4 text-[14px] font-semibold"
          data-admin-delivery-image-picker="1"
          onClick={() => fileRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" aria-hidden />
          {assetPath
            ? ko
              ? "이미지 교체"
              : "Replace image"
            : ko
              ? "내 PC에서 이미지 선택"
              : "Choose image from PC"}
        </button>
        {fileName ? <p className="mt-2 text-[12px] text-sam-muted">{fileName}</p> : null}
        {assetPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetPath} alt="" className="mt-3 w-full rounded-ui-rect object-cover aspect-[39/16]" />
        ) : (
          <p className="mt-3 text-[13px] text-sam-muted">{ko ? "이미지 없음" : "No image"}</p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <label className="block text-[12px] text-sam-muted">
          {ko ? "시작" : "Start"}
          <input type="datetime-local" className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted">
          {ko ? "종료" : "End"}
          <input type="datetime-local" className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          {ko ? "헤드라인" : "Headline"}
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          {ko ? "서브카피" : "Subcopy"}
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={subcopy} onChange={(e) => setSubcopy(e.target.value)} />
        </label>
        <label className="block text-[12px] text-sam-muted sm:col-span-2">
          CTA
          <input className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-sm" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
        </label>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-app p-4" data-admin-delivery-runtime-preview="1">
        <h2 className="mb-2 text-[14px] font-bold text-sam-fg">
          {ko ? "배달 홈 상단 실제 노출 형태 미리보기" : "Delivery home hero live-style preview"}
        </h2>
        {assetPath ? (
          <DeliveryAdBanner
            inventory={inventory}
            creative={{
              assetUrl: assetPath,
              headline: headline || null,
              subcopy: subcopy || null,
            }}
            destination={{ href: ctaHref, ctaLabel: null }}
            adLabel={ko ? "광고" : "Ad"}
            renderContext="admin_preview"
            campaignId="preview"
          />
        ) : (
          <p className="text-[13px] text-sam-muted">{ko ? "이미지 없음" : "No image"}</p>
        )}
      </section>

      {error ? <p className="text-sm text-sam-danger" role="alert">{error}</p> : null}
      {successMsg ? <p className="text-sm text-sam-success" role="status">{successMsg}</p> : null}

      <button
        type="button"
        disabled={!canSubmit}
        className="min-h-12 w-full rounded-ui-rect bg-[var(--admin-console-accent,#1d4ed8)] px-4 text-[15px] font-bold text-white disabled:opacity-50"
        data-admin-delivery-register-cta="1"
        onClick={() => {
          if (!canSubmit) return;
          setConfirmOpen(true);
        }}
      >
        {ko ? "광고 등록" : "Register ad"}
      </button>

      <AdminActionConfirmDialog
        open={confirmOpen}
        title={createCopy.title}
        description={createCopy.body}
        confirmLabel={createCopy.confirmLabel}
        cancelLabel={createCopy.cancelLabel}
        tone={createCopy.tone}
        pending={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          if (busy) return;
          void submit();
        }}
      />
    </div>
  );
}
