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
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
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
};

const PREVIEW_LIVE_DATA_ONLY: ReadonlySet<string> = new Set(["list_sheet", "coupon_card", "tooltip"]);

type DeviceMode = "phone" | "tablet_portrait" | "tablet_landscape" | "desktop";

const FRAMES: Record<DeviceMode, { w: number; h: number; safeBottom: number }> = {
  phone: { w: 390, h: 844, safeBottom: 34 },
  tablet_portrait: { w: 768, h: 1024, safeBottom: 20 },
  tablet_landscape: { w: 1024, h: 768, safeBottom: 20 },
  desktop: { w: 1280, h: 800, safeBottom: 0 },
};

export function AdminPlatformPopupPreview({ source }: { source: AdminPlatformPopupPreviewSource | null }) {
  const { safeT, language } = useI18n();
  const [device, setDevice] = useState<DeviceMode>("phone");

  const winner: PlatformPopupPresentationWinner | null = useMemo(() => {
    if (!source?.imageUrl) return null;
    const presentationType: PlatformPopupInterruptivePresentation = isPlatformPopupInterruptivePresentation(
      String(source.presentationType ?? "")
    )
      ? (source.presentationType as PlatformPopupInterruptivePresentation)
      : "center_modal";
    // 진입 감사 PO-3: 목록·쿠폰·말풍선은 앱에서 고객·화면별 실제 데이터로 그린다 — 미리보기에 가짜 데이터를 넣지 않는다
    if (PREVIEW_LIVE_DATA_ONLY.has(presentationType)) return null;
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
  // 진입 감사 PO-4: 가로 허용이 기본 — 앱과 같은 판단(허용이면 폭 480 으로 그대로 보인다)
  const landscapeDenied = device === "tablet_landscape" && !PLATFORM_POPUP_LANDSCAPE_ALLOWED_DEFAULT;
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
            <div className="w-full max-w-full px-3">
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
              />
            </div>
          ) : (
            <p className="px-4 text-center text-sm text-sam-muted">
              {source?.presentationType === "benefit_dialog" && source.benefitEligible === false
                ? safeT("admin_platform_popup_benefit_requires_event")
                : source?.imageUrl && PREVIEW_LIVE_DATA_ONLY.has(String(source.presentationType ?? ""))
                  ? safeT("admin_platform_popup_preview_live_data_only")
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
