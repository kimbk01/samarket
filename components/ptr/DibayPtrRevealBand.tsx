"use client";

import { useEffect, useRef } from "react";
import {
  computePtrBandLayout,
  PTR_BAND_SPECS,
  type PtrBandDeviceVariant,
  type PtrBandZone,
} from "@/lib/platform-popup/ptr-reveal-contract";
import { DIBAY_PTR_THRESHOLD_PX } from "@/lib/ui/ptr/dibay-ptr-ssot";

/** 표기·로고가 들어갈 최소 슬롯 높이 — 이보다 낮으면 띠 이미지만 */
const PTR_BAND_CHROME_MIN_PX = 24;

/** chromeZone 가로 범위 + 실제 보이는 슬롯 높이 전체(세로 중앙 정렬) */
function chromeBoxStyle(zone: { left: string; width: string }, slotHeightPx: number) {
  return { left: zone.left, width: zone.width, top: "0px", height: `${slotHeightPx}px` };
}

/**
 * PTR 띠 광고 렌더 — 앱 런타임(`DibayPtrSlot`)과 관리자 미리보기가 같은 컴포넌트·같은 배치 함수
 * (`computePtrBandLayout`)를 쓴다. 상태 문구·스피너는 슬롯이 이 레이어 위에 그린다.
 */
export function DibayPtrRevealBand({
  variant,
  imageUrl,
  altText,
  logoUrl,
  frameWidthPx,
  slotHeightPx,
  adLabel,
  ctaLabel,
  interactive,
  onCta,
  onImageShown,
  showGuides = false,
}: {
  variant: PtrBandDeviceVariant;
  imageUrl: string;
  altText: string;
  logoUrl?: string | null;
  frameWidthPx: number;
  slotHeightPx: number;
  adLabel: string;
  ctaLabel: string;
  /** 새로고침 중·결과 표시 중에만 true — 당기는 동안 오탭 방지 */
  interactive: boolean;
  onCta?: () => void;
  /** 이미지가 실제로 로드된 뒤 URL 별 1회 */
  onImageShown?: (imageUrl: string) => void;
  /** 관리자 미리보기 — 안전영역·상태 영역·잘림 표시 */
  showGuides?: boolean;
}) {
  const layout = computePtrBandLayout({ variant, frameWidthPx, slotHeightPx });
  const imgRef = useRef<HTMLImageElement | null>(null);
  const shownRef = useRef<string | null>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && shownRef.current !== imageUrl) {
      shownRef.current = imageUrl;
      onImageShown?.(imageUrl);
    }
  }, [imageUrl, onImageShown]);

  const showChrome = slotHeightPx >= PTR_BAND_CHROME_MIN_PX;
  const showCta = interactive && slotHeightPx >= DIBAY_PTR_THRESHOLD_PX;
  const spec = PTR_BAND_SPECS[variant];

  const zoneStyle = (z: PtrBandZone) => ({
    left: `${layout.offsetLeftPx + z.x0 * layout.imageWidthPx}px`,
    width: `${(z.x1 - z.x0) * layout.imageWidthPx}px`,
    top: `${layout.offsetTopPx + z.y0 * layout.imageHeightPx}px`,
    height: `${(z.y1 - z.y0) * layout.imageHeightPx}px`,
  });

  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- 사전 디코드된 광고 원본(WebP), 최적화 프록시 금지
    <img
      ref={imgRef}
      src={imageUrl}
      alt=""
      draggable={false}
      decoding="async"
      onLoad={() => {
        if (shownRef.current === imageUrl) return;
        shownRef.current = imageUrl;
        onImageShown?.(imageUrl);
      }}
      className="pointer-events-none absolute max-w-none select-none"
      style={{
        left: `${layout.offsetLeftPx}px`,
        top: `${layout.offsetTopPx}px`,
        width: `${layout.imageWidthPx}px`,
        height: `${layout.imageHeightPx}px`,
        // 전역 `img { max-width: 100% }`(레이어 밖)가 유틸리티를 이기므로 인라인으로 해제 — 폭 cover 유지
        maxWidth: "none",
      }}
    />
  );

  return (
    <div data-ptr-reveal-band={variant} className="absolute inset-0 overflow-hidden">
      {interactive && onCta ?
        <button
          type="button"
          onClick={onCta}
          aria-label={`${adLabel} · ${altText} · ${ctaLabel}`}
          className="absolute inset-0 block h-full w-full cursor-pointer"
        >
          {image}
        </button>
      : image}
      {showGuides ?
        <div className="pointer-events-none absolute inset-0" data-ptr-reveal-guides="">
          {spec.safeZones.map((z, i) => (
            <div
              key={i}
              className="absolute border border-dashed border-emerald-400 bg-emerald-400/15"
              style={zoneStyle(z)}
            />
          ))}
          {spec.statusZone ?
            <div className="absolute border border-dashed border-rose-400 bg-rose-400/20" style={zoneStyle(spec.statusZone)} />
          : null}
          {spec.chromeZone ?
            <div className="absolute border border-dashed border-sky-400 bg-sky-400/20" style={zoneStyle(spec.chromeZone)} />
          : null}
        </div>
      : null}
      {spec.chromeZone && showChrome ?
        // 앱 표시물은 소재의 chromeZone(오른쪽) 안에만 — 핵심 문구 안전영역·상태 영역을 덮지 않는다
        <div
          className="pointer-events-none absolute flex flex-col items-center justify-center gap-1"
          style={{ ...chromeBoxStyle(zoneStyle(spec.chromeZone), slotHeightPx) }}
          data-ptr-reveal-chrome=""
        >
          <div className="flex items-center gap-1">
            <span className="rounded-[4px] bg-black/55 px-1 py-px text-[10px] font-semibold leading-[14px] text-white">
              {adLabel}
            </span>
            {logoUrl ?
              // eslint-disable-next-line @next/next/no-img-element -- 사전 디코드된 광고주 로고
              <img src={logoUrl} alt="" draggable={false} className="h-5 w-5 rounded-full bg-white object-cover" />
            : null}
          </div>
          {showCta ?
            <span className="max-w-full truncate rounded-full bg-white/92 px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#1b1b1f] shadow-sm">
              {ctaLabel}
            </span>
          : null}
        </div>
      : null}
    </div>
  );
}
