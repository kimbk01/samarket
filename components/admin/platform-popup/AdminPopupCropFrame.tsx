"use client";

/**
 * 앱 진입 어드민 v3 §4 (Owner 2026-11-17 「v3대로 진행」) — 카드형 팝업 36:25 자르기 틀.
 * 틀을 끌어서 위치를 옮기고, 오른쪽 아래 모서리로 크기를 바꾼다(비율 36:25 고정).
 * 결과는 원본 픽셀 사각형 — 서버가 같은 검사(`validatePlatformPopupCropRect`)를 한 뒤 그 부분을 잘라 1440×1000 으로 맞춘다.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  PLATFORM_POPUP_CROP_MIN,
  centerCropBoxTo3625,
  validatePlatformPopupCropRect,
  type PlatformPopupCropRect,
} from "@/lib/platform-popup/creative-pipeline-geometry";
import { POPUP_CARD_OUTPUT } from "@/lib/platform-popup/creative-size-spec";

const RATIO = 36 / 25;
const VIEW_MAX_W = 420;

function heightFor(width: number): number {
  return Math.round(width / RATIO);
}

/** 틀 크기를 원본 안으로 · 최소 크기 이상으로 맞춘다(원본이 최소보다 작으면 가능한 최대) */
function clampRect(r: PlatformPopupCropRect, src: { width: number; height: number }): PlatformPopupCropRect {
  const maxW = Math.min(src.width, Math.floor(src.height * RATIO));
  const minW = Math.min(maxW, PLATFORM_POPUP_CROP_MIN.width);
  let width = Math.max(minW, Math.min(maxW, Math.round(r.width)));
  let height = heightFor(width);
  if (height > src.height) {
    height = src.height;
    width = Math.min(maxW, Math.floor(height * RATIO));
  }
  const x = Math.max(0, Math.min(src.width - width, Math.round(r.x)));
  const y = Math.max(0, Math.min(src.height - height, Math.round(r.y)));
  return { x, y, width, height };
}

function centeredRect(src: { width: number; height: number }, width?: number): PlatformPopupCropRect {
  if (width == null) {
    const c = centerCropBoxTo3625(src.width, src.height);
    return clampRect({ x: c.left, y: c.top, width: c.width, height: c.height }, src);
  }
  const height = heightFor(width);
  return clampRect({ x: (src.width - width) / 2, y: (src.height - height) / 2, width, height }, src);
}

export function AdminPopupCropFrame({
  imageUrl,
  sourceWidth,
  sourceHeight,
  fileName,
  disabled,
  onConfirm,
  onPickOther,
}: {
  imageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  fileName?: string | null;
  disabled?: boolean;
  onConfirm: (rect: PlatformPopupCropRect) => void;
  onPickOther?: () => void;
}) {
  const { t } = useI18n();
  const src = { width: sourceWidth, height: sourceHeight };
  const [rect, setRect] = useState<PlatformPopupCropRect>(() => centeredRect(src));
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(VIEW_MAX_W);
  const drag = useRef<{ mode: "move" | "resize"; startX: number; startY: number; start: PlatformPopupCropRect } | null>(
    null
  );

  useEffect(() => {
    setRect(centeredRect({ width: sourceWidth, height: sourceHeight }));
  }, [sourceWidth, sourceHeight, imageUrl]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewW(Math.min(VIEW_MAX_W, el.parentElement?.clientWidth ?? VIEW_MAX_W)));
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, []);

  const scale = viewW / sourceWidth;
  const viewH = Math.round(sourceHeight * scale);

  const onPointerDown = useCallback(
    (mode: "move" | "resize") => (e: ReactPointerEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
    },
    [disabled, rect]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;
      if (d.mode === "move") {
        setRect(clampRect({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, { width: sourceWidth, height: sourceHeight }));
      } else {
        // 모서리 — 대각선 이동 중 큰 쪽을 따라 폭을 바꾸고 높이는 36:25 로
        const dw = Math.max(dx, dy * RATIO);
        const maxW = Math.min(sourceWidth - d.start.x, Math.floor((sourceHeight - d.start.y) * RATIO));
        const width = Math.max(Math.min(PLATFORM_POPUP_CROP_MIN.width, maxW), Math.min(maxW, d.start.width + dw));
        setRect(clampRect({ x: d.start.x, y: d.start.y, width, height: heightFor(width) }, { width: sourceWidth, height: sourceHeight }));
      }
    },
    [scale, sourceWidth, sourceHeight]
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  const check = validatePlatformPopupCropRect(rect, src);
  const resultLine = check.ok
    ? t("admin_popup_v3_crop_result_ok", {
        w: rect.width,
        h: rect.height,
        ow: POPUP_CARD_OUTPUT.width,
        oh: POPUP_CARD_OUTPUT.height,
      })
    : t("admin_popup_v3_crop_result_small", {
        w: rect.width,
        h: rect.height,
        minW: PLATFORM_POPUP_CROP_MIN.width,
        minH: PLATFORM_POPUP_CROP_MIN.height,
      });

  return (
    <div className="space-y-2" data-admin-popup-crop-frame="1">
      <p className="text-xs text-sam-fg">
        {t("admin_popup_v3_crop_opened", {
          file: fileName ?? "",
          w: sourceWidth,
          h: sourceHeight,
        })}
      </p>
      <div ref={boxRef} className="relative select-none overflow-hidden rounded-ui-rect bg-sam-surface-muted" style={{ width: viewW, height: viewH, touchAction: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 자르기 틀 (blob 주소) */}
        <img src={imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
        <div
          role="group"
          aria-label={`${t("admin_popup_v3_crop_frame_label")} · ${rect.width}×${rect.height}`}
          tabIndex={0}
          className="absolute cursor-move border-2 border-sam-warning"
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.width * scale,
            height: rect.height * scale,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: `${viewW}px ${viewH}px`,
            backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
          }}
          onPointerDown={onPointerDown("move")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
            const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
            if (!dx && !dy) return;
            e.preventDefault();
            setRect((r) => clampRect({ ...r, x: r.x + dx, y: r.y + dy }, { width: sourceWidth, height: sourceHeight }));
          }}
          data-admin-popup-crop-box="1"
        >
          <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-fg/70 px-1 text-[12px] text-sam-surface">
            {t("admin_popup_v3_crop_frame_label")}
          </span>
          <span
            aria-hidden
            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-sam-surface bg-sam-warning"
            onPointerDown={onPointerDown("resize")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-admin-popup-crop-handle="1"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminActionButton
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setRect((r) => centeredRect({ width: sourceWidth, height: sourceHeight }, r.width))}
          data-admin-popup-crop-center="1"
        >
          {t("admin_popup_v3_crop_center")}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          size="sm"
          disabled={disabled || !check.ok}
          onClick={() => onConfirm(rect)}
          data-admin-popup-crop-apply="1"
        >
          {t("admin_popup_v3_crop_apply")}
        </AdminActionButton>
        {onPickOther ? (
          <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={onPickOther}>
            {t("admin_popup_v3_crop_other")}
          </AdminActionButton>
        ) : null}
      </div>
      <p
        role={check.ok ? "status" : "alert"}
        className={`rounded-ui-rect px-3 py-2 text-xs ${check.ok ? "bg-sam-primary/10 text-sam-primary" : "bg-sam-danger-soft text-sam-danger"}`}
        data-admin-popup-crop-result={check.ok ? "ok" : check.error}
      >
        {check.ok ? "✓ " : "✕ "}
        {resultLine}
      </p>
    </div>
  );
}
