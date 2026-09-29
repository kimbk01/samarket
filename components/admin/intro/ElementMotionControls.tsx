"use client";

import type { LayerMotionTypeV1, LayerMotionV1 } from "@/lib/intro/contracts/document";
import {
  LAYER_MOTION_TYPES,
  motionSummaryKo,
  resolveLayerMotion,
  validateMotionTiming,
} from "@/lib/intro/contracts/document";

const MOTION_LABELS_KO: Record<LayerMotionTypeV1, string> = {
  NONE: "없음",
  FADE_IN: "페이드 인",
  TOP_IN: "위에서 나타남",
  BOTTOM_IN: "아래에서 나타남",
  LEFT_IN: "왼쪽에서 나타남",
  RIGHT_IN: "오른쪽에서 나타남",
  SCALE_IN: "확대하며 나타남",
};

const MOTION_LABELS_EN: Record<LayerMotionTypeV1, string> = {
  NONE: "None",
  FADE_IN: "Fade in",
  TOP_IN: "From top",
  BOTTOM_IN: "From bottom",
  LEFT_IN: "From left",
  RIGHT_IN: "From right",
  SCALE_IN: "Scale in",
};

export function ElementMotionControls({
  ko,
  motion,
  sceneDurationMs,
  onChange,
}: {
  ko: boolean;
  motion: LayerMotionV1 | undefined;
  sceneDurationMs: number;
  onChange: (next: LayerMotionV1) => void;
}) {
  const resolved = resolveLayerMotion(motion);
  const timing = validateMotionTiming(resolved, sceneDurationMs);
  const labels = ko ? MOTION_LABELS_KO : MOTION_LABELS_EN;

  return (
    <section className="space-y-2 border-t border-sam-border pt-2" data-intro-element-motion="1">
      <h4 className="text-xs font-semibold text-sam-fg">
        {ko ? "요소 애니메이션" : "Element animation"}
      </h4>
      <label className="block text-[11px] text-sam-muted">
        {ko ? "방식" : "Type"}
        <select
          className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
          value={resolved.type}
          data-intro-motion-type="1"
          onChange={(e) => {
            const type = e.target.value as LayerMotionTypeV1;
            if (type === "NONE") {
              onChange({ type: "NONE", startMs: 0, durationMs: 0 });
              return;
            }
            onChange({
              type,
              startMs: resolved.startMs,
              durationMs: resolved.durationMs > 0 ? resolved.durationMs : 400,
            });
          }}
        >
          {LAYER_MOTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {labels[t]}
            </option>
          ))}
        </select>
      </label>
      {resolved.type !== "NONE" ? (
        <>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "시작 (초)" : "Start (sec)"}
            <input
              type="number"
              min={0}
              step={0.1}
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={(resolved.startMs / 1000).toFixed(1)}
              data-intro-motion-start="1"
              onChange={(e) => {
                const sec = Number(e.target.value);
                onChange({
                  ...resolved,
                  startMs: Number.isFinite(sec)
                    ? Math.max(0, Math.round(sec * 1000))
                    : 0,
                });
              }}
            />
          </label>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "지속 (초)" : "Duration (sec)"}
            <input
              type="number"
              min={0}
              step={0.1}
              className="mt-1 w-full rounded border border-sam-border bg-sam-bg px-2 py-1 text-sm"
              value={(resolved.durationMs / 1000).toFixed(1)}
              data-intro-motion-duration="1"
              onChange={(e) => {
                const sec = Number(e.target.value);
                onChange({
                  ...resolved,
                  durationMs: Number.isFinite(sec)
                    ? Math.max(0, Math.round(sec * 1000))
                    : 0,
                });
              }}
            />
          </label>
        </>
      ) : null}
      <p className="text-[10px] text-sam-muted" data-intro-motion-summary="1">
        {motionSummaryKo(resolved)}
      </p>
      {!timing.ok ? (
        <p className="text-[11px] font-medium text-red-600" data-intro-motion-error="1">
          {timing.message}
        </p>
      ) : null}
      <p className="text-[10px] text-sam-muted">
        {ko
          ? `장면 표시 시간 이내만 허용 (최대 ${(sceneDurationMs / 1000).toFixed(1)}초)`
          : `Must fit within scene window (max ${(sceneDurationMs / 1000).toFixed(1)}s)`}
      </p>
    </section>
  );
}

export function elementTypeLabelKo(
  type: "IMAGE" | "LOGO" | "TEXT" | "CTA",
): string {
  switch (type) {
    case "IMAGE":
      return "이미지";
    case "LOGO":
      return "로고";
    case "TEXT":
      return "텍스트";
    case "CTA":
      return "버튼";
  }
}
