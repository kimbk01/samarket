"use client";

import { useMemo, useState } from "react";
import { DibayPtrSlot, type DibayPtrSlotStore } from "@/components/ptr/DibayPtrSlot";
import type { DibayPtrSnapshot } from "@/lib/ui/ptr/create-dibay-ptr-store";
import {
  computePtrBandLayout,
  PTR_BAND_SPECS,
  resolvePtrBandVariantForViewport,
} from "@/lib/platform-popup/ptr-reveal-contract";
import type { PtrRevealAd } from "@/lib/platform-popup/ptr-reveal-payload";
import {
  DIBAY_PTR_MAX_PX,
  DIBAY_PTR_THRESHOLD_PX,
  resolveDibayPtrSlotPx,
} from "@/lib/ui/ptr/dibay-ptr-ssot";

/** 미리보기 기기 — CSS px(뷰포트) 기준. 실제 기기 검증 전 대표값(삼성·아이폰·안드로이드 태블릿·아이패드). */
export const PTR_PREVIEW_DEVICES = [
  { id: "galaxy-s", ko: "삼성 갤럭시 S (360)", en: "Samsung Galaxy S (360)", w: 360, h: 780 },
  { id: "galaxy-plus", ko: "삼성 갤럭시 플러스 (384)", en: "Samsung Galaxy Plus (384)", w: 384, h: 832 },
  { id: "iphone", ko: "iPhone 15 (393)", en: "iPhone 15 (393)", w: 393, h: 852 },
  { id: "iphone-max", ko: "iPhone Pro Max (430)", en: "iPhone Pro Max (430)", w: 430, h: 932 },
  { id: "android-tab-7", ko: "안드로이드 태블릿 7\" (600)", en: "Android tablet 7\" (600)", w: 600, h: 960 },
  { id: "android-tab-10", ko: "안드로이드 태블릿 10\" (800)", en: "Android tablet 10\" (800)", w: 800, h: 1280 },
  { id: "ipad", ko: "iPad (820)", en: "iPad (820)", w: 820, h: 1180 },
  { id: "ipad-pro", ko: "iPad Pro 12.9 (1024)", en: "iPad Pro 12.9 (1024)", w: 1024, h: 1366 },
] as const;

export const PTR_PREVIEW_STATES = [
  { id: "pulling", ko: "당기는 중", en: "Pulling" },
  { id: "ready", ko: "놓으면 새로고침", en: "Release" },
  { id: "refreshing", ko: "새로고침 중", en: "Refreshing" },
  { id: "success", ko: "성공", en: "Success" },
  { id: "error", ko: "실패", en: "Failure" },
  { id: "no_ad", ko: "광고 없음", en: "No ad" },
] as const;
type PreviewStateId = (typeof PTR_PREVIEW_STATES)[number]["id"];

function snapshotFor(state: PreviewStateId, holdPx: number): DibayPtrSnapshot {
  switch (state) {
    case "pulling":
      return { phase: "PULLING", pullPx: Math.round(DIBAY_PTR_THRESHOLD_PX * 0.6), refreshing: false, outcome: null };
    case "ready":
      return { phase: "READY", pullPx: Math.max(DIBAY_PTR_THRESHOLD_PX, holdPx), refreshing: false, outcome: null };
    case "success":
      return { phase: "SUCCESS", pullPx: holdPx, refreshing: false, outcome: { status: "success", partial: false, timedOut: false } };
    case "error":
      return { phase: "ERROR", pullPx: holdPx, refreshing: false, outcome: { status: "error", partial: false, timedOut: false } };
    default:
      return { phase: "REFRESHING", pullPx: holdPx, refreshing: true, outcome: null };
  }
}

function staticStore(snap: DibayPtrSnapshot): DibayPtrSlotStore {
  return { subscribe: () => () => {}, getSnapshot: () => snap, getServerSnapshot: () => snap };
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/**
 * 관리자 기기별 미리보기 — 앱과 같은 `DibayPtrSlot`(같은 배치 함수·스피너·문구)을 기기 폭으로 렌더.
 * 세로·가로, 6개 상태, 슬롯 높이(58~106) 조절, 안전영역·상태 영역·잘림 표시.
 */
export function AdminPtrRevealPreview({ ad, lang }: { ad: PtrRevealAd | null; lang: "ko" | "en" }) {
  const [deviceId, setDeviceId] = useState<string>(PTR_PREVIEW_DEVICES[0].id);
  const [landscape, setLandscape] = useState(false);
  const [state, setState] = useState<PreviewStateId>("refreshing");
  const [releasePx, setReleasePx] = useState(72);
  const [guides, setGuides] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const holdPx = resolveDibayPtrSlotPx(releasePx);

  return (
    <div className="space-y-3" data-admin-ptr-preview="">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          className="rounded border border-sam-border px-2 py-1"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label={lang === "en" ? "Device" : "기기"}
        >
          {PTR_PREVIEW_DEVICES.map((d) => (
            <option key={d.id} value={d.id}>
              {lang === "en" ? d.en : d.ko}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-sam-border">
          {[false, true].map((ls) => (
            <button
              key={String(ls)}
              type="button"
              onClick={() => setLandscape(ls)}
              className={`px-2 py-1 ${landscape === ls ? "bg-sam-primary text-white" : ""}`}
            >
              {ls ? (lang === "en" ? "Landscape" : "가로") : lang === "en" ? "Portrait" : "세로"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
          {lang === "en" ? "Safe zones" : "안전영역 표시"}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {lang === "en" ? "All devices" : "전체 기기 한눈에"}
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        {PTR_PREVIEW_STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setState(s.id)}
            data-admin-ptr-preview-state={s.id}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              state === s.id ? "border-sam-primary bg-sam-primary text-white" : "border-sam-border"
            }`}
          >
            {lang === "en" ? s.en : s.ko}
          </button>
        ))}
      </div>
      {guides ?
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-sam-muted" data-admin-ptr-guide-legend="">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 border border-dashed border-emerald-500 bg-emerald-400/30 align-middle" />{lang === "en" ? "Key copy (always visible)" : "핵심 문구 (항상 보임)"}</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 border border-dashed border-rose-500 bg-rose-400/30 align-middle" />{lang === "en" ? "Spinner & status text" : "스피너·상태 문구"}</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 border border-dashed border-sky-500 bg-sky-400/30 align-middle" />{lang === "en" ? "Ad label · logo · button" : "광고 표기·로고·버튼"}</span>
          <span>{lang === "en" ? "Outside the boxes may be cropped on some devices." : "상자 밖은 기기에 따라 잘릴 수 있습니다."}</span>
        </p>
      : null}
      <label className="flex items-center gap-2 text-xs text-sam-muted">
        {lang === "en" ? "Release position" : "놓은 위치"}
        <input
          type="range"
          min={DIBAY_PTR_THRESHOLD_PX}
          max={DIBAY_PTR_MAX_PX}
          value={releasePx}
          onChange={(e) => setReleasePx(Number(e.target.value))}
        />
        <span className="tabular-nums">
          {lang === "en" ? "slot" : "슬롯"} {holdPx}px
        </span>
      </label>

      <div className="space-y-4">
        {(showAll ? PTR_PREVIEW_DEVICES : PTR_PREVIEW_DEVICES.filter((d) => d.id === deviceId)).map((d) => (
          <PreviewFrame
            key={d.id}
            device={d}
            landscape={landscape}
            state={state}
            holdPx={holdPx}
            ad={ad}
            guides={guides}
            lang={lang}
          />
        ))}
      </div>
    </div>
  );
}

function PreviewFrame({
  device,
  landscape,
  state,
  holdPx,
  ad,
  guides,
  lang,
}: {
  device: (typeof PTR_PREVIEW_DEVICES)[number];
  landscape: boolean;
  state: PreviewStateId;
  holdPx: number;
  ad: PtrRevealAd | null;
  guides: boolean;
  lang: "ko" | "en";
}) {
  const frameW = landscape ? device.h : device.w;
  const snap = useMemo(() => snapshotFor(state, holdPx), [state, holdPx]);
  const store = useMemo(() => staticStore(snap), [snap]);
  const variant = resolvePtrBandVariantForViewport(frameW);
  const effectiveAd = state === "no_ad" ? null : ad;
  const band = effectiveAd ? (variant === "tablet" ? effectiveAd.bands.tablet : effectiveAd.bands.default) : null;
  const slotH = snap.pullPx;
  const layout = computePtrBandLayout({ variant, frameWidthPx: frameW, slotHeightPx: slotH });
  const spec = PTR_BAND_SPECS[variant];
  // 미리보기 표시 폭 — 최대 640px 로 축소(레이아웃 폭은 실제 기기 CSS px 유지)
  const scale = Math.min(1, 640 / frameW);

  const missingTablet = Boolean(effectiveAd && variant === "tablet" && !effectiveAd.bands.tablet);

  return (
    <div className="space-y-1" data-admin-ptr-preview-device={device.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 text-xs">
        <span className="font-semibold">{lang === "en" ? device.en : device.ko}</span>
        <span className="text-sam-muted">
          {frameW}×{landscape ? device.w : device.h} · {lang === "en" ? spec.labelEn : spec.labelKo} {spec.width}×{spec.height}
        </span>
        {band ?
          <span className="text-sam-muted">
            {lang === "en" ? "Visible" : "보이는 영역"} {lang === "en" ? "x" : "가로"} {pct(layout.visible.x0)}–
            {pct(layout.visible.x1)} · {lang === "en" ? "y" : "세로"} {pct(layout.visible.y0)}–{pct(layout.visible.y1)}
            {layout.sideFillPx > 0 ? ` · ${lang === "en" ? "side fill" : "좌우 여백"} ${Math.round(layout.sideFillPx)}px` : ""}
          </span>
        : null}
      </div>
      {missingTablet ?
        <p className="text-xs text-amber-700">
          {lang === "en"
            ? "No tablet band uploaded — this device shows normal pull-to-refresh without an ad."
            : "태블릿 띠가 없어 이 기기에서는 광고 없이 일반 새로고침만 표시됩니다."}
        </p>
      : null}
      <div
        className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app"
        style={{ width: frameW * scale, height: 220 * scale }}
      >
        <div style={{ width: frameW, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div className="flex h-11 items-center bg-sam-primary px-4 text-sm font-semibold text-white">DIBAY</div>
          <DibayPtrSlot
            store={store}
            tone="onBrand"
            className="bg-sam-primary"
            dataAttribute="data-admin-ptr-preview-slot"
            adPreview={{ ad: effectiveAd, showGuides: guides }}
          />
          <div className="space-y-2 p-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-14 w-14 rounded-ui-rect bg-sam-surface-muted" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className="h-3 w-3/4 rounded bg-sam-surface-muted" />
                  <div className="h-3 w-1/2 rounded bg-sam-surface-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
