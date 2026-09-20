"use client";

/**
 * Admin preview: phone / tablet. Exact DibayPopupAd — no preview-only CSS.
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
};

type DeviceMode = "phone" | "tablet";

const PHONE = { w: 390, h: 844 };
const TABLET = { w: 768, h: 1024 };

export function AdminPlatformPopupPreview({ source }: { source: AdminPlatformPopupPreviewSource | null }) {
  const { safeT, language } = useI18n();
  const [device, setDevice] = useState<DeviceMode>("phone");

  const winner: PlatformPopupPresentationWinner | null = useMemo(() => {
    if (!source?.imageUrl) return null;
    const presentationType = (
      source.presentationType === "bottom_sheet" ? "bottom_sheet" : "center_modal"
    ) as PlatformPopupInterruptivePresentation;
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
      cta: {
        type: source.ctaType || "internal_page",
        href: source.ctaHref || "/market",
        label: null,
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

  const frame = device === "phone" ? PHONE : TABLET;
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

  return (
    <div data-admin-popup-preview="1" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded px-2 py-1 text-xs font-medium ${device === "phone" ? "bg-sam-fg text-white" : "border border-sam-border"}`}
          onClick={() => setDevice("phone")}
        >
          {safeT("admin_platform_popup_preview_phone", {
            fallbackKo: "휴대폰",
            fallbackEn: "Phone",
          })}
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 text-xs font-medium ${device === "tablet" ? "bg-sam-fg text-white" : "border border-sam-border"}`}
          onClick={() => setDevice("tablet")}
        >
          {safeT("admin_platform_popup_preview_tablet", {
            fallbackKo: "태블릿",
            fallbackEn: "Tablet",
          })}
        </button>
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
        style={{ width: Math.min(frame.w, PLATFORM_POPUP_TABLET_MAX_WIDTH_PX + 40), maxWidth: "100%" }}
      >
        <div
          className="relative flex items-center justify-center"
          style={{
            height: Math.min(frame.h * 0.72, 560),
            background: contextTone,
          }}
        >
          {winner ? (
            <div className="w-full max-w-full px-3">
              <DibayPopupAd
                campaignId={winner.campaignId}
                surface={winner.surface}
                creative={winner.creative}
                cta={winner.cta}
                suppressionOptions={winner.suppressionOptions}
                exposureId="admin-preview"
                presentationType={winner.presentationType}
                embedded
                onClose={() => undefined}
                onSuppress={(_mode: PlatformPopupSuppressionMode) => undefined}
                onCta={() => undefined}
                onRenderComplete={() => {
                  /* preview must NOT emit production impression */
                }}
                onImageError={() => undefined}
              />
            </div>
          ) : (
            <p className="px-4 text-center text-sm text-sam-muted">
              {safeT("admin_platform_popup_preview_empty", {
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
      <p className="text-xs text-sam-muted" data-admin-popup-preview-landscape-note="1">
        {safeT("admin_platform_popup_preview_landscape", {
          fallbackKo: "가로 모드에서는 팝업이 표시되지 않습니다.",
          fallbackEn: "Popup is not shown in landscape.",
        })}
      </p>
    </div>
  );
}
