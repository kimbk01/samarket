"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayPtrRevealBand } from "@/components/ptr/DibayPtrRevealBand";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import {
  ensurePtrRevealAd,
  finishPtrRevealExposure,
  getPtrRevealAdsVersion,
  readPtrRevealAd,
  subscribePtrRevealAds,
  type PtrRevealAd,
} from "@/lib/platform-popup/ptr-reveal-client";
import {
  computePtrBandLayout,
  PTR_BAND_SPECS,
  resolvePtrBandVariantForViewport,
} from "@/lib/platform-popup/ptr-reveal-contract";
import { recordPlatformPopupEvent } from "@/lib/platform-popup/record-popup-event-client";
import { recordPromotionContentVisitClient } from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import { DIBAY_PTR_THRESHOLD_PX } from "@/lib/ui/ptr/dibay-ptr-ssot";

type Exposure = {
  id: string;
  ad: PtrRevealAd;
  impressed: boolean;
  finished: boolean;
  /** 실제 노출된 띠 소재 — 접힘(dismiss) 이벤트에 동일 소재 기록 */
  creativeId?: string;
};

function newExposureId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `ptr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isHrefSafe(href: string): boolean {
  const h = href.trim();
  if (!h) return false;
  return h.startsWith("/")
    ? validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: h }).ok
    : validatePlatformPopupCta({ ctaType: "external_url", externalUrl: h }).ok;
}

/**
 * PTR 띠 광고 런타임 — 사전 디코드된 광고가 있을 때만 슬롯 뒤에 그린다.
 *
 * - 노출(impression): 새로고침 유지 단계(REFRESHING/SUCCESS/ERROR)에서 슬롯 ≥ 임계 높이로 이미지가 실제 그려졌을 때 1회.
 *   당기다 취소한 경우는 노출 아님.
 * - 노출 종료(띠 접힘)·CTA 후 캠페인 빈도 정책으로 억제 기록 → 다음 유휴에 재조회(회전).
 * - PTR 엔진과 완전히 분리 — 어떤 예외도 새로고침에 전파하지 않는다.
 */
/** 관리자 미리보기 — 캐시·조회·이벤트·억제 없이 주어진 광고로만 그린다 */
export type DibayPtrRevealPreview = { ad: PtrRevealAd | null; showGuides?: boolean };

export function useDibayPtrRevealAd(
  snap: DibayPtrSnapshot,
  frameWidthPx: number,
  preview?: DibayPtrRevealPreview
) {
  const pathname = usePathname() ?? "/";
  // 캐시 버전 — 노출 종료로 항목이 비워지면 즉시 다음 유휴 조회(회전·빈도 반영)
  const adsVersion = useSyncExternalStore(subscribePtrRevealAds, getPtrRevealAdsVersion, () => 0);
  const deviceVariant = resolvePtrBandVariantForViewport(frameWidthPx);
  const exposureRef = useRef<Exposure | null>(null);
  const [, force] = useState(0);
  const isPreview = preview !== undefined;
  const previewAd = preview?.ad ?? null;

  useEffect(() => {
    if (isPreview) return;
    if (frameWidthPx > 0) ensurePtrRevealAd(pathname, deviceVariant);
  }, [isPreview, pathname, deviceVariant, frameWidthPx, snap.phase, adsVersion]);

  const holding = snap.phase === "REFRESHING" || snap.phase === "SUCCESS" || snap.phase === "ERROR";

  // 사이클 시작 시 광고 고정(당김 중 교체 금지), IDLE 복귀 시 노출 종료 처리
  useEffect(() => {
    const cur = exposureRef.current;
    if (isPreview) {
      exposureRef.current =
        previewAd && snap.phase !== "IDLE"
          ? { id: "preview", ad: previewAd, impressed: true, finished: true }
          : null;
      force((n) => n + 1);
      return;
    }
    if (snap.phase === "IDLE") {
      if (cur && !cur.finished) {
        cur.finished = true;
        if (cur.impressed) {
          try {
            // 띠 접힘 = 팝업의 닫힘에 대응 — 노출(impression)·빈도 억제(suppress 행)와 분리된 이벤트로 기록
            void recordPlatformPopupEvent({
              campaignId: cur.ad.campaignId,
              creativeId: cur.creativeId ?? cur.ad.bands.default.creativeId,
              surface: cur.ad.surface,
              eventType: "dismiss",
              source: "dismiss_handler",
              exposureId: cur.id,
              deviceKey: ensureClientInstanceId(),
              meta: { placement: "ptr_reveal", reason: "band_collapse" },
            }).catch(() => {});
            finishPtrRevealExposure(pathname, cur.ad);
          } catch {
            /* 광고 실패는 새로고침과 무관 */
          }
        }
      }
      if (cur) {
        exposureRef.current = null;
        loadedUrlRef.current = null;
        force((n) => n + 1);
      }
      return;
    }
    if (!cur) {
      const ad = readPtrRevealAd(pathname);
      if (ad) {
        exposureRef.current = { id: newExposureId(), ad, impressed: false, finished: false };
        force((n) => n + 1);
      }
    }
  }, [snap.phase, pathname, isPreview, previewAd]);

  const exposure = exposureRef.current;
  const band = exposure
    ? deviceVariant === "tablet"
      ? exposure.ad.bands.tablet
      : exposure.ad.bands.default
    : null;

  const deviceKeyRef = useRef<string | null>(null);
  const deviceKey = () => (deviceKeyRef.current ??= ensureClientInstanceId());

  const loadedUrlRef = useRef<string | null>(null);
  const onImageShown = useCallback((url: string) => {
    loadedUrlRef.current = url;
    force((n) => n + 1);
  }, []);

  // 노출 = 유지 단계 + 임계 높이 이상 + 이 띠 이미지가 실제 로드·표시됨 + 화면 전면
  useEffect(() => {
    const ex = exposureRef.current;
    if (!ex || ex.impressed || ex.finished || !band) return;
    if (!holding || snap.pullPx < DIBAY_PTR_THRESHOLD_PX) return;
    if (loadedUrlRef.current !== band.imageUrl) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    ex.impressed = true;
    ex.creativeId = band.creativeId;
    void recordPlatformPopupEvent({
      campaignId: ex.ad.campaignId,
      creativeId: band.creativeId,
      surface: ex.ad.surface,
      eventType: "impression",
      source: "renderer",
      exposureId: ex.id,
      deviceKey: deviceKey(),
      meta: { placement: "ptr_reveal", variant: deviceVariant },
    }).catch(() => {});
  });

  const router = useRouter();
  const onCta = useCallback(() => {
    const ex = exposureRef.current;
    if (isPreview || !ex || !band) return;
    const href = ex.ad.href.trim();
    if (!isHrefSafe(href)) return;
    const base = {
      campaignId: ex.ad.campaignId,
      creativeId: band.creativeId,
      surface: ex.ad.surface,
      source: "click_handler" as const,
      exposureId: ex.id,
      deviceKey: deviceKey(),
    };
    void recordPlatformPopupEvent({ ...base, eventType: "click", meta: { placement: "ptr_reveal", href } }).catch(() => {});
    try {
      if (href.startsWith("/")) {
        recordPromotionContentVisitClient({ hrefOrEventId: href, sourceChannel: "BANNER" });
        router.push(href);
      } else {
        window.location.assign(href);
      }
      void recordPlatformPopupEvent({ ...base, eventType: "landing_success", meta: { placement: "ptr_reveal", href } }).catch(() => {});
    } catch {
      void recordPlatformPopupEvent({ ...base, eventType: "landing_failure", meta: { placement: "ptr_reveal", href } }).catch(() => {});
    }
    if (!ex.finished) {
      ex.finished = true;
      finishPtrRevealExposure(pathname, ex.ad);
    }
  }, [band, pathname, router, isPreview]);

  // 상태 표시(스피너·문구) 최대 폭 = 소재의 statusZone 폭 — 광고 표기·CTA 영역 침범 금지
  const statusZone = PTR_BAND_SPECS[deviceVariant].statusZone;
  const statusMaxWidthPx =
    statusZone && frameWidthPx > 0
      ? Math.floor(
          (statusZone.x1 - statusZone.x0) *
            computePtrBandLayout({ variant: deviceVariant, frameWidthPx, slotHeightPx: snap.pullPx }).imageWidthPx
        )
      : null;

  return {
    active: Boolean(exposure && band),
    statusMaxWidthPx,
    exposure,
    band,
    deviceVariant,
    holding,
    showGuides: Boolean(preview?.showGuides),
    onImageShown,
    onCta,
  };
}

export function DibayPtrRevealAdLayer({
  reveal,
  frameWidthPx,
  slotHeightPx,
}: {
  reveal: ReturnType<typeof useDibayPtrRevealAd>;
  frameWidthPx: number;
  slotHeightPx: number;
}) {
  const { t } = useI18n();
  const { exposure, band } = reveal;
  if (!exposure || !band || frameWidthPx <= 0) return null;
  return (
    <DibayPtrRevealBand
      variant={reveal.deviceVariant}
      imageUrl={band.imageUrl}
      altText={band.altText}
      logoUrl={exposure.ad.bands.logo?.imageUrl ?? null}
      frameWidthPx={frameWidthPx}
      slotHeightPx={slotHeightPx}
      adLabel={t("ptr_ad_label")}
      ctaLabel={exposure.ad.ctaLabel || t("ptr_ad_cta_default")}
      interactive={reveal.holding}
      onCta={reveal.onCta}
      onImageShown={reveal.onImageShown}
      showGuides={reveal.showGuides}
    />
  );
}
