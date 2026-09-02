"use client";

/**
 * CUT 4 — Admin preview uses EXACT production DibayPopupAd.
 * No production analytics (callbacks are no-ops).
 */

import { useMemo, useState } from "react";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PLATFORM_POPUP_TABLET_MAX_WIDTH_PX } from "@/lib/platform-popup/popup-geometry-tokens";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

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
  unsaved?: boolean;
};

type DeviceMode = "phone" | "tablet" | "landscape";

const PHONE = { w: 390, h: 844 };
const TABLET = { w: 768, h: 1024 };
const LANDSCAPE = { w: 844, h: 390 };

export function AdminPlatformPopupPreview({ source }: { source: AdminPlatformPopupPreviewSource | null }) {
  const { safeT } = useI18n();
  const [device, setDevice] = useState<DeviceMode>("phone");

  const winner: PlatformPopupPresentationWinner | null = useMemo(() => {
    if (!source?.imageUrl) return null;
    return {
      campaignId: source.campaignId,
      creativeId: source.creativeId || "preview-creative",
      surface: source.surface || "TRADE",
      creative: {
        id: source.creativeId || "preview-creative",
        imageUrl: source.imageUrl,
        altText: source.altText || "Advertisement",
        aspectW: 36,
        aspectH: 25,
      },
      cta: {
        type: source.ctaType || "internal_page",
        href: source.ctaHref || "/market",
        label: null,
      },
      suppressionOptions: resolvePlatformPopupPresentationSuppressionOptions({
        suppressionMode: source.suppressionMode,
        suppressionDurationSeconds: source.suppressionDurationSeconds,
      }),
      timezone: source.timezone,
      suppressionDurationSeconds: source.suppressionDurationSeconds,
    };
  }, [source]);

  const frame = device === "phone" ? PHONE : device === "tablet" ? TABLET : LANDSCAPE;

  return (
    <div className="space-y-3" data-admin-platform-popup-preview="1">
      <div className="flex flex-wrap items-center gap-2">
        {(["phone", "tablet", "landscape"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`rounded border px-2 py-1 text-xs ${
              device === mode ? "border-sam-brand bg-sam-brand/10" : "border-sam-border"
            }`}
            onClick={() => setDevice(mode)}
          >
            {mode}
          </button>
        ))}
        {source?.unsaved ? (
          <span className="text-xs font-semibold text-amber-700">
            {safeT("admin_platform_popup_preview_unsaved", {
              fallbackKo: "저장되지 않은 미리보기",
              fallbackEn: "UNSAVED PREVIEW DATA",
            })}
          </span>
        ) : (
          <span className="text-xs text-sam-muted">
            {safeT("admin_platform_popup_preview_saved", {
              fallbackKo: "저장된 데이터 미리보기",
              fallbackEn: "SAVED PRODUCTION DATA preview",
            })}
          </span>
        )}
      </div>

      <div
        className="relative mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app"
        style={{ width: frame.w, height: frame.h, maxWidth: "100%" }}
        data-preview-device={device}
        data-tablet-max-width={PLATFORM_POPUP_TABLET_MAX_WIDTH_PX}
      >
        {device === "landscape" ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-sam-muted">
            {safeT("admin_platform_popup_preview_landscape", {
              fallbackKo: "가로 모드에서는 팝업이 표시되지 않습니다 — v1 정책",
              fallbackEn: "Popup not displayed in landscape — v1 policy",
            })}
          </div>
        ) : !winner ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-sam-muted">
            {safeT("admin_platform_popup_preview_empty", {
              fallbackKo: "미리볼 크리에이티브가 없습니다.",
              fallbackEn: "No creative to preview.",
            })}
          </div>
        ) : (
          <div className="relative h-full w-full">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "rgba(0,0,0,0.45)" }}
              aria-hidden
            />
            <div className="absolute inset-x-0 bottom-0">
              <DibayPopupAd
                campaignId={winner.campaignId}
                surface={String(winner.surface)}
                creative={winner.creative}
                cta={winner.cta}
                suppressionOptions={winner.suppressionOptions}
                exposureId={`admin-preview:${winner.campaignId}`}
                embedded
                onClose={() => {}}
                onSuppress={(_mode: PlatformPopupSuppressionMode) => {}}
                onCta={() => {}}
                onRenderComplete={() => {
                  /* CUT 4: preview must NOT emit production impression */
                }}
                onImageError={() => {}}
              />
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-sam-muted">
        {safeT("admin_platform_popup_preview_renderer_note", {
          fallbackKo: "미리보기는 프로덕션 DibayPopupAd 렌더러를 그대로 사용합니다. 분석 이벤트는 기록되지 않습니다.",
          fallbackEn: "Preview uses the exact production DibayPopupAd renderer. Analytics events are not written.",
        })}
      </p>
    </div>
  );
}
