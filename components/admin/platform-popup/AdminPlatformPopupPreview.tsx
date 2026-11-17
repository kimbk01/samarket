"use client";

/**
 * Admin preview: phone / tablet P / tablet L (deny) / desktop.
 * Exact DibayPopupAd — no preview-only presentation CSS.
 */

import { useMemo, useState } from "react";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { PLATFORM_POPUP_TABLET_MAX_WIDTH_PX } from "@/lib/platform-popup/popup-geometry-tokens";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type {
  PlatformPopupCouponRow,
  PlatformPopupListStore,
  PlatformPopupPresentationWinner,
} from "@/lib/platform-popup/popup-presentation-types";
import type { MessageKey } from "@/lib/i18n/message-key";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import {
  isPlatformPopupInterruptivePresentation,
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
  type PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import { adminSurfaceModeLabel, type PlatformPopupAdminSurfaceMode } from "@/lib/platform-popup/admin-surface-target-mode";
import { PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT } from "@/lib/platform-popup/popup-runtime-context";

export type AdminPlatformPopupPreviewSource = {
  campaignId: string;
  creativeId: string;
  imageUrl: string;
  altText: string;
  ctaHref: string;
  ctaType: string;
  ctaLabel?: string | null;
  title?: string | null;
  body?: string | null;
  /** Event benefit — required for benefit_dialog preview. */
  benefit?: { title: string; body: string | null } | null;
  surface: string;
  suppressionMode: string;
  suppressionDurationSeconds: number | null;
  timezone: string;
  presentationType?: string;
  frequencyMode?: string;
  creativeMode?: string;
  aspectW?: number;
  aspectH?: number;
  unsaved?: boolean;
  ctaBgColor?: string | null;
  ctaTextColor?: string | null;
  /** When false, benefit_dialog must not pretend to render. */
  benefitEligible?: boolean;
  /** v3 ④ — 말풍선 자리(예시 홈 머리줄의 지역·알림) */
  tooltipAnchor?: "region" | "notifications";
};

/**
 * v3 ④: 목록·쿠폰·말풍선은 앱에서 회원·화면별 실제 데이터로 그린다 — 미리보기는 「예시」 표시를 단 예시 데이터로 그린다.
 * 예시 데이터는 이 화면 안에서만 쓴다(저장·앱 전송 없음).
 */
const PREVIEW_SAMPLE_DATA: ReadonlySet<string> = new Set(["list_sheet", "coupon_card", "tooltip"]);

function sampleListStores(t: (key: MessageKey, vars?: Record<string, string | number>) => string): PlatformPopupListStore[] {
  return [1, 2, 3].map((n) => ({
    id: `sample-store-${n}`,
    slug: `sample-store-${n}`,
    name: t("platform_popup_preview_sample_store_name", { n }),
    imageUrl: null,
    href: "#",
  }));
}

function sampleCoupons(t: (key: MessageKey, vars?: Record<string, string | number>) => string): PlatformPopupCouponRow[] {
  const day = 24 * 3600_000;
  return [2, 5].map((d, i) => ({
    id: `sample-coupon-${i + 1}`,
    title: t("platform_popup_preview_sample_coupon_title", { n: i + 1 }),
    storeName: t("platform_popup_preview_sample_store_name", { n: i + 1 }),
    // 미리보기 고정 시각 기준 — 「며칠 남음」 표시용
    expiresAt: new Date(SAMPLE_NOW_MS + d * day).toISOString(),
    href: "#",
  }));
}

/** 예시 쿠폰 만료 기준 시각(화면을 열 때 1번) */
const SAMPLE_NOW_MS = Date.now();

type DeviceMode = "phone" | "tablet_portrait" | "tablet_landscape" | "desktop";

const FRAMES: Record<DeviceMode, { w: number; h: number; safeBottom: number }> = {
  phone: { w: 390, h: 844, safeBottom: 34 },
  tablet_portrait: { w: 768, h: 1024, safeBottom: 20 },
  tablet_landscape: { w: 1024, h: 768, safeBottom: 20 },
  desktop: { w: 1280, h: 800, safeBottom: 0 },
};

export function AdminPlatformPopupPreview({
  source,
  allowLandscape = PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT,
}: {
  source: AdminPlatformPopupPreviewSource | null;
  /** v3 ④: 저장된 전체 설정 「가로 화면에서도」 — 없으면 기본값 */
  allowLandscape?: boolean;
}) {
  const { safeT, language, t } = useI18n();
  const [device, setDevice] = useState<DeviceMode>("phone");

  const winner: PlatformPopupPresentationWinner | null = useMemo(() => {
    if (!source?.imageUrl) return null;
    const presentationType: PlatformPopupInterruptivePresentation = isPlatformPopupInterruptivePresentation(
      String(source.presentationType ?? "")
    )
      ? (source.presentationType as PlatformPopupInterruptivePresentation)
      : "center_modal";
    if (presentationType === "benefit_dialog") {
      if (source.benefitEligible === false || !source.benefit?.title?.trim()) return null;
    }
    const frequencyMode = normalizePlatformPopupFrequencyMode(source.frequencyMode);
    const creativeMode = normalizePlatformPopupCreativeMode(source.creativeMode);
    return {
      campaignId: source.campaignId,
      creativeId: source.creativeId || "preview-creative",
      surface: source.surface || "TRADE",
      presentationType,
      frequencyMode,
      creative: {
        id: source.creativeId || "preview-creative",
        imageUrl: source.imageUrl,
        altText: source.altText || "Advertisement",
        aspectW: source.aspectW ?? 36,
        aspectH: source.aspectH ?? 25,
        creativeMode,
      },
      title: source.title?.trim() || null,
      body: source.body?.trim() || null,
      benefit:
        presentationType === "benefit_dialog" && source.benefit?.title?.trim()
          ? { title: source.benefit.title.trim(), body: source.benefit.body?.trim() || null }
          : null,
      cta: {
        type: source.ctaType || "internal_page",
        href: source.ctaHref || "/market",
        label: source.ctaLabel?.trim() || null,
      },
      suppressionOptions: resolvePlatformPopupPresentationSuppressionOptions({
        suppressionMode: source.suppressionMode,
        suppressionDurationSeconds: source.suppressionDurationSeconds,
        frequencyMode,
      }),
      timezone: source.timezone,
      suppressionDurationSeconds: source.suppressionDurationSeconds,
      ctaColors:
        source.ctaBgColor || source.ctaTextColor
          ? { bg: source.ctaBgColor?.trim() || null, text: source.ctaTextColor?.trim() || null }
          : null,
    };
  }, [source]);

  const frame = FRAMES[device];
  // 진입 감사 PO-4 · v3 ④: 저장된 전체 설정 「가로 화면에서도」 그대로 — 허용이면 폭 480 으로 보인다
  const landscapeDenied = device === "tablet_landscape" && !allowLandscape;
  const sampleKind = winner && PREVIEW_SAMPLE_DATA.has(winner.presentationType) ? winner.presentationType : null;
  const sampleStores = useMemo(() => sampleListStores(t), [t]);
  const sampleCouponRows = useMemo(() => sampleCoupons(t), [t]);
  const tooltipAnchor = source?.tooltipAnchor === "notifications" ? "notifications" : "region";
  const surfaceLabel = source?.surface
    ? adminSurfaceModeLabel(
        source.surface as PlatformPopupAdminSurfaceMode,
        language === "en" ? "en" : "ko"
      )
    : "";

  const contextTone =
    source?.surface === "ADMIN"
      ? "linear-gradient(180deg,var(--sam-bg-ink) 0%,var(--sam-bg-surface-dark) 100%)"
      : source?.surface === "DELIVERY_OWNER"
        ? "linear-gradient(180deg,var(--sam-success-soft) 0%,var(--sam-bg-app) 100%)"
        : source?.surface === "DELIVERY"
          ? "linear-gradient(180deg,var(--sam-warning-soft) 0%,var(--sam-bg-app) 100%)"
          : "linear-gradient(180deg,var(--sam-bg-app) 0%,var(--sam-bg-surface-muted) 100%)";

  const modeBtn = (mode: DeviceMode) => (
    <AdminChipButton key={mode} selected={device === mode} onClick={() => setDevice(mode)}>
      {safeT(`admin_platform_popup_preview_${mode}`)}
    </AdminChipButton>
  );

  return (
    <div data-admin-popup-preview="1" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {modeBtn("phone")}
        {modeBtn("tablet_portrait")}
        {modeBtn("tablet_landscape")}
        {modeBtn("desktop")}
        {surfaceLabel ? <span className="text-xs text-sam-muted">{surfaceLabel}</span> : null}
        {source?.unsaved ? (
          <span className="text-xs text-sam-warning">
            {safeT("admin_platform_popup_preview_unsaved")}
          </span>
        ) : null}
      </div>

      <div
        className="mx-auto overflow-hidden rounded-2xl border border-sam-border shadow-sm"
        style={{
          width: Math.min(frame.w, device === "desktop" ? 720 : PLATFORM_POPUP_TABLET_MAX_WIDTH_PX + 80),
          maxWidth: "100%",
        }}
      >
        <div
          className="relative flex items-center justify-center"
          style={{
            height: Math.min(frame.h * 0.72, device === "desktop" ? 520 : 560),
            background: contextTone,
            /* Labeled simulated inset for sheet proof — not production token mutation. */
            ["--safe-bottom" as string]: `${frame.safeBottom}px`,
            ["--safe-top" as string]: device === "phone" ? "47px" : "24px",
          }}
          data-preview-simulated-safe-bottom={frame.safeBottom}
        >
          {landscapeDenied ? (
            <p
              className="px-4 text-center text-sm font-medium text-sam-fg"
              data-admin-popup-preview-landscape-deny="1"
            >
              {safeT("admin_platform_popup_preview_landscape_deny")}
            </p>
          ) : winner ? (
            <div
              className={`relative w-full max-w-full px-3 ${sampleKind === "tooltip" ? "self-start pt-2" : ""}`}
              data-admin-popup-preview-sample={sampleKind ?? undefined}
            >
              {sampleKind ? (
                <span
                  className="absolute right-4 top-1 z-10 rounded-ui-rect bg-sam-warning px-2 py-0.5 text-[12px] font-semibold text-sam-surface"
                  data-admin-popup-sample-badge="1"
                >
                  {t(
                    sampleKind === "list_sheet"
                      ? "platform_popup_preview_sample_badge_store"
                      : sampleKind === "coupon_card"
                        ? "platform_popup_preview_sample_badge_coupon"
                        : "platform_popup_preview_sample_badge_home"
                  )}
                </span>
              ) : null}
              {sampleKind === "tooltip" ? (
                /* 말풍선은 홈 머리줄의 자리(지역·알림) 옆에 붙는다 — 예시 홈 머리줄 */
                <div
                  className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                  data-admin-popup-mock-home-header="1"
                >
                  <span data-popup-anchor="region" className="font-semibold">
                    {t("platform_popup_preview_sample_region")} ▾
                  </span>
                  <span data-popup-anchor="notifications" className="text-xs text-sam-muted">
                    {t("platform_popup_preview_sample_alerts")}
                  </span>
                </div>
              ) : null}
              <DibayPopupAd
                key={`${winner.presentationType}-${winner.creative.creativeMode}-${winner.benefit?.title ?? ""}-${winner.title ?? ""}`}
                campaignId={winner.campaignId}
                surface={winner.surface}
                creative={winner.creative}
                cta={winner.cta}
                title={winner.title}
                body={winner.body}
                benefit={winner.benefit}
                suppressionOptions={winner.suppressionOptions}
                exposureId="admin-preview"
                presentationType={winner.presentationType}
                embedded
                onClose={() => undefined}
                onSuppress={(_mode: PlatformPopupSuppressionMode) => undefined}
                onCta={() => undefined}
                onImpression={() => {
                  /* preview must NOT emit production impression */
                }}
                onImageError={() => undefined}
                ctaColors={winner.ctaColors ?? null}
                listStores={sampleKind === "list_sheet" ? sampleStores : undefined}
                coupons={sampleKind === "coupon_card" ? sampleCouponRows : undefined}
                tooltipAnchor={tooltipAnchor}
                onUnavailable={() => undefined}
              />
            </div>
          ) : (
            <p className="px-4 text-center text-sm text-sam-muted">
              {source?.presentationType === "benefit_dialog" && source.benefitEligible === false
                ? safeT("admin_platform_popup_benefit_requires_event")
                : safeT("admin_platform_popup_preview_empty")}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-sam-muted">
        {safeT("admin_platform_popup_preview_renderer_note")}
      </p>
      <p className="text-xs text-sam-muted" data-admin-popup-preview-safe-note="1">
        {safeT("admin_platform_popup_preview_safe_simulated", { vars: { px: frame.safeBottom } })}
      </p>
    </div>
  );
}
