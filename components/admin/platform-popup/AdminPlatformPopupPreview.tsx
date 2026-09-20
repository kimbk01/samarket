"use client";

/**
 * Admin preview: phone / tablet P / tablet L (deny) / desktop.
 * Exact DibayPopupAd — no preview-only presentation CSS.
 */

import { useMemo, useState } from "react";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PLATFORM_POPUP_TABLET_MAX_WIDTH_PX } from "@/lib/platform-popup/popup-geometry-tokens";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import {
  normalizePlatformPopupCreativeMode,
  normalizePlatformPopupFrequencyMode,
  type PlatformPopupInterruptivePresentation,
} from "@/lib/platform-popup/presentation-contract";
import { adminSurfaceModeLabel, type PlatformPopupAdminSurfaceMode } from "@/lib/platform-popup/admin-surface-target-mode";

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
  /** When false, benefit_dialog must not pretend to render. */
  benefitEligible?: boolean;
};

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
    const presentationType = (
      source.presentationType === "bottom_sheet"
        ? "bottom_sheet"
        : source.presentationType === "benefit_dialog"
          ? "benefit_dialog"
          : "center_modal"
    ) as PlatformPopupInterruptivePresentation;
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
    };
  }, [source]);

  const frame = FRAMES[device];
  const landscapeDenied = device === "tablet_landscape";
  const surfaceLabel = source?.surface
    ? adminSurfaceModeLabel(
        source.surface as PlatformPopupAdminSurfaceMode,
        language === "en" ? "en" : "ko"
      )
    : "";

  const contextTone =
    source?.surface === "ADMIN"
      ? "linear-gradient(180deg,#1e293b 0%,#0f172a 40%,#334155 100%)"
      : source?.surface === "DELIVERY_OWNER"
        ? "linear-gradient(180deg,#ecfdf5 0%,#d1fae5 35%,#f8fafc 100%)"
        : source?.surface === "DELIVERY"
          ? "linear-gradient(180deg,#fff7ed 0%,#ffedd5 40%,#f8fafc 100%)"
          : "linear-gradient(180deg,#f8fafc 0%,#e2e8f0 100%)";

  const modeBtn = (mode: DeviceMode, labelKo: string, labelEn: string) => (
    <button
      key={mode}
      type="button"
      className={`rounded px-2 py-1 text-xs font-medium ${device === mode ? "bg-sam-fg text-white" : "border border-sam-border"}`}
      onClick={() => setDevice(mode)}
    >
      {safeT(`admin_platform_popup_preview_${mode}`, {
        fallbackKo: labelKo,
        fallbackEn: labelEn,
      })}
    </button>
  );

  return (
    <div data-admin-popup-preview="1" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {modeBtn("phone", "휴대폰", "Phone")}
        {modeBtn("tablet_portrait", "태블릿 세로", "Tablet portrait")}
        {modeBtn("tablet_landscape", "태블릿 가로", "Tablet landscape")}
        {modeBtn("desktop", "데스크톱", "Desktop")}
        {surfaceLabel ? <span className="text-xs text-sam-muted">{surfaceLabel}</span> : null}
        {source?.unsaved ? (
          <span className="text-xs text-amber-700">
            {safeT("admin_platform_popup_preview_unsaved", {
              fallbackKo: "저장되지 않은 미리보기",
              fallbackEn: "Unsaved preview",
            })}
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
              {safeT("admin_platform_popup_preview_landscape_deny", {
                fallbackKo: "가로 화면에서는 팝업을 노출하지 않습니다.",
                fallbackEn: "Popups are not shown in landscape.",
              })}
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
              />
            </div>
          ) : (
            <p className="px-4 text-center text-sm text-sam-muted">
              {source?.presentationType === "benefit_dialog" && source.benefitEligible === false
                ? safeT("admin_platform_popup_benefit_requires_event", {
                    fallbackKo: "연결된 이벤트에 혜택 정보가 필요합니다.",
                    fallbackEn: "Linked event benefit content is required.",
                  })
                : safeT("admin_platform_popup_preview_empty", {
                    fallbackKo: "미리볼 크리에이티브가 없습니다.",
                    fallbackEn: "No creative to preview.",
                  })}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-sam-muted">
        {safeT("admin_platform_popup_preview_renderer_note", {
          fallbackKo: "미리보기는 프로덕션 DibayPopupAd를 그대로 사용합니다.",
          fallbackEn: "Preview uses the production DibayPopupAd renderer.",
        })}
      </p>
      <p className="text-xs text-sam-muted" data-admin-popup-preview-safe-note="1">
        {safeT("admin_platform_popup_preview_safe_simulated", {
          fallbackKo: `시뮬레이션 safe-bottom: ${frame.safeBottom}px (미리보기 셸)`,
          fallbackEn: `Simulated safe-bottom: ${frame.safeBottom}px (preview shell)`,
          vars: { px: frame.safeBottom },
        })}
      </p>
    </div>
  );
}
