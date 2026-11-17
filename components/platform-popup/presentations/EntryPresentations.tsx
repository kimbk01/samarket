"use client";

/**
 * 진입 감사 PO-3 (2026-11-17 · Owner 「설계안대로 진행」) — 배민 실측 형태 4종.
 * - artwork_full: 투명 PNG 그림 전체 + 어드민 색 버튼 (배민 중앙 그림형)
 * - coupon_card: 그림 + 이 회원의 곧 만료되는 쿠폰 목록(서버가 채움) + 쿠폰함 버튼
 * - list_sheet: 하단 시트 + 어드민이 고른 매장 가로 목록 + 종료까지 남은 시간
 * - tooltip: 화면을 가리지 않는 말풍선(지역 선택·알림 옆)
 * 닫기·숨김·노출 기록은 기존 팝업과 같은 호스트 경로(DismissSSOT) — 이 파일은 그리기만 한다.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ArtworkModalProps } from "@/components/platform-popup/presentations/ArtworkModalPresentation";
import { PopupCloseControl, PopupSuppressActions } from "@/components/platform-popup/primitives/PopupChrome";
import { PopupCreativeMedia } from "@/components/platform-popup/primitives/PopupCreativeMedia";
import type {
  PlatformPopupCouponRow,
  PlatformPopupListStore,
} from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupTooltipAnchor } from "@/lib/platform-popup/presentation-contract";

export type EntryPresentationBaseProps = ArtworkModalProps & {
  ctaColors?: { bg: string | null; text: string | null } | null;
  /** 목록 칸(매장) 눌림 — 호스트가 같은 CTA 경로(기록·숨김)로 그 주소를 연다 */
  onCtaHref?: (href: string) => void;
};

function ctaStyle(colors: EntryPresentationBaseProps["ctaColors"]) {
  if (!colors?.bg && !colors?.text) return undefined;
  return {
    ...(colors.bg ? { background: colors.bg } : {}),
    ...(colors.text ? { color: colors.text } : {}),
  };
}

function Suppress(p: EntryPresentationBaseProps) {
  return (
    <PopupSuppressActions
      options={p.suppressionOptions}
      todayLabel={p.todayLabel}
      durationLabel={p.durationLabel}
      campaignLabel={p.campaignLabel}
      groupLabel={p.closeLabel}
      onSuppress={p.onSuppress}
      tone="on-light"
    />
  );
}

function dataAttrs(p: EntryPresentationBaseProps, composition: string) {
  return {
    "data-platform-popup-card": "1",
    "data-composition": composition,
    "data-presentation": composition,
    "data-creative-mode": p.creative.creativeMode,
    "data-campaign-id": p.campaignId,
    "data-creative-id": p.creative.id,
    "data-surface": p.surface,
    "data-exposure-id": p.exposureId,
    "aria-labelledby": p.titleId,
  } as const;
}

/** 그림 전체형 — 투명 PNG 가 틀 없이 떠 있고 아래에 버튼 하나 */
export function ArtworkFullPresentation(p: EntryPresentationBaseProps) {
  const ctaLabel = p.cta.label?.trim() || null;
  return (
    <div className="dibay-promo-frame dibay-promo-frame--artwork-full" {...dataAttrs(p, "artwork_full")}>
      <PopupCloseControl variant="floating" label={p.closeLabel} onClose={p.onClose} className="dibay-promo-close-x--frame" />
      <div className="dibay-promo-artwork-full" id={p.titleId}>
        <PopupCreativeMedia
          composition="artwork_full"
          creative={p.creative}
          ariaLabel={p.creativeAria}
          onCta={p.onCta}
          onLoad={p.onMediaReady}
          onError={p.onImageError}
        />
        {p.title ? <h2 className="sr-only">{p.title}</h2> : null}
        {ctaLabel ? (
          <button
            type="button"
            className="dibay-promo-cta dibay-promo-cta--artwork-full"
            style={ctaStyle(p.ctaColors)}
            data-platform-popup-cta="1"
            onClick={p.onCta}
          >
            {ctaLabel}
          </button>
        ) : null}
        <Suppress {...p} />
      </div>
      <span className="sr-only">
        {p.ctaAria}: {p.cta.href}
      </span>
    </div>
  );
}

function daysUntil(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now) / 86_400_000) - 0);
}

/** 쿠폰 카드 — 서버가 채운 쿠폰이 없으면 서버가 이 팝업을 대기열에서 뺀다(빈 카드 금지) */
export function CouponCardPresentation(p: EntryPresentationBaseProps & { coupons: readonly PlatformPopupCouponRow[] }) {
  const { t } = useI18n();
  const [now] = useState(() => Date.now());
  const ctaLabel = p.cta.label?.trim() || null;
  return (
    <div className="dibay-promo-frame dibay-promo-frame--coupon-card" {...dataAttrs(p, "coupon_card")}>
      <PopupCloseControl variant="floating" label={p.closeLabel} onClose={p.onClose} className="dibay-promo-close-x--frame" />
      <div className="dibay-promo-coupon" id={p.titleId}>
        <PopupCreativeMedia
          composition="coupon_card"
          creative={p.creative}
          ariaLabel={p.creativeAria}
          onCta={p.onCta}
          onLoad={p.onMediaReady}
          onError={p.onImageError}
        />
        <div className="dibay-promo-coupon__body">
          {p.title ? <h2 className="dibay-promo-title">{p.title}</h2> : null}
          {p.body ? <p className="dibay-promo-body">{p.body}</p> : null}
          <ul className="dibay-promo-coupon__list">
            {p.coupons.map((c) => {
              const d = daysUntil(c.expiresAt, now);
              return (
                <li key={c.id} className="dibay-promo-coupon__row">
                  <span className="min-w-0 flex-1">
                    <span className="dibay-promo-coupon__name">{c.title}</span>
                    {c.storeName ? <span className="dibay-promo-coupon__store">{c.storeName}</span> : null}
                  </span>
                  {d != null ? (
                    <span className="dibay-promo-coupon__due">
                      {d <= 0 ? t("platform_popup_coupon_expires_today") : t("platform_popup_coupon_expires_in_days", { days: d })}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {ctaLabel ? (
            <button
              type="button"
              className="dibay-promo-cta dibay-promo-cta--in-card"
              style={ctaStyle(p.ctaColors)}
              data-platform-popup-cta="1"
              onClick={p.onCta}
            >
              {ctaLabel}
            </button>
          ) : null}
          <Suppress {...p} />
        </div>
      </div>
      <span className="sr-only">
        {p.ctaAria}: {p.cta.href}
      </span>
    </div>
  );
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** 남은 시간 — 종료 시각이 24시간 안일 때만 보인다(먼 날짜는 숫자가 의미 없음) */
function useTimeLeft(endsAt: string | null | undefined): number | null {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  const [left, setLeft] = useState<number | null>(() => (Number.isFinite(end) ? end - Date.now() : null));
  useEffect(() => {
    if (!Number.isFinite(end)) return;
    const id = window.setInterval(() => setLeft(end - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  return left;
}

export function ListSheetPresentation(
  p: EntryPresentationBaseProps & { stores: readonly PlatformPopupListStore[]; endsAt: string | null }
) {
  const { t } = useI18n();
  const left = useTimeLeft(p.endsAt);
  const ctaLabel = p.cta.label?.trim() || null;
  const showLeft = left != null && left <= 24 * 3600_000;
  return (
    <div className="dibay-promo-sheet dibay-promo-sheet--list" {...dataAttrs(p, "list_sheet")}>
      <PopupCloseControl variant="floating" label={p.closeLabel} onClose={p.onClose} className="dibay-promo-close-x--sheet" />
      <div className="dibay-promo-sheet__content" id={p.titleId}>
        <PopupCreativeMedia
          composition="list_sheet"
          creative={p.creative}
          ariaLabel={p.creativeAria}
          onCta={p.onCta}
          onLoad={p.onMediaReady}
          onError={p.onImageError}
        />
        {p.title || p.body || showLeft ? (
          <div className="dibay-promo-sheet__copy">
            {p.title ? <h2 className="dibay-promo-title">{p.title}</h2> : null}
            {p.body ? <p className="dibay-promo-body">{p.body}</p> : null}
            {showLeft ? (
              <p className="dibay-promo-list__left" data-popup-time-left="1">
                {left! <= 0 ? t("platform_popup_list_ended") : t("platform_popup_list_time_left", { time: formatLeft(left!) })}
              </p>
            ) : null}
          </div>
        ) : null}
        <ul className="dibay-promo-list">
          {p.stores.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="dibay-promo-list__item"
                data-platform-popup-list-store={s.id}
                onClick={() => (p.onCtaHref ? p.onCtaHref(s.href) : p.onCta())}
              >
                <span className="dibay-promo-list__thumb">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 매장 썸네일(작은 크기) · 변환 CDN 없음
                    <img src={s.imageUrl} alt="" loading="lazy" decoding="async" />
                  ) : null}
                </span>
                <span className="dibay-promo-list__name">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {ctaLabel ? (
          <button
            type="button"
            className="dibay-promo-cta dibay-promo-cta--in-sheet"
            style={ctaStyle(p.ctaColors)}
            data-platform-popup-cta="1"
            onClick={p.onCta}
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>
      <div className="dibay-promo-sheet__safe-bottom" data-promo-safe-bottom="1" aria-hidden="true" />
      {p.suppressionOptions.length > 0 ? (
        <div className="dibay-promo-sheet__actions" data-promo-sheet-actions="1">
          <Suppress {...p} />
        </div>
      ) : null}
      <span className="sr-only">
        {p.ctaAria}: {p.cta.href}
      </span>
    </div>
  );
}

type AnchorBox = { left: number; top: number; bottom: number; width: number };

function readAnchor(anchor: PlatformPopupTooltipAnchor): AnchorBox | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-popup-anchor="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { left: r.left, top: r.top, bottom: r.bottom, width: r.width };
}

/**
 * 말풍선 — 배경을 어둡게 하지 않고 화면을 막지 않는다. 붙을 자리(지역 선택·알림)가 이 화면에 없으면
 * `onAnchorMissing`(호스트: 이번 실행 동안 건너뜀 · 숨김 기록 없음).
 */
export function TooltipPresentation(
  p: EntryPresentationBaseProps & { anchor: PlatformPopupTooltipAnchor; onAnchorMissing: () => void }
) {
  const [box, setBox] = useState<AnchorBox | null>(null);
  const { anchor, onAnchorMissing } = p;
  useLayoutEffect(() => {
    const b = readAnchor(anchor);
    if (!b) {
      onAnchorMissing();
      return;
    }
    setBox(b);
    const onResize = () => setBox(readAnchor(anchor));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [anchor, onAnchorMissing]);

  if (!box || typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const width = Math.min(280, vw - 24);
  const center = box.left + box.width / 2;
  const left = Math.min(Math.max(12, center - width / 2), vw - 12 - width);
  const arrowLeft = Math.min(Math.max(16, center - left), width - 16);

  return createPortal(
    <div
      className="dibay-promo-tooltip"
      role="dialog"
      aria-modal="false"
      style={{ left, top: box.bottom + 10, width, ["--dibay-tooltip-arrow-left" as string]: `${arrowLeft}px` }}
      {...dataAttrs(p, "tooltip")}
    >
      <div className="dibay-promo-tooltip__row" id={p.titleId}>
        <PopupCreativeMedia
          composition="tooltip"
          creative={p.creative}
          ariaLabel={p.creativeAria}
          onCta={p.onCta}
          onLoad={p.onMediaReady}
          onError={p.onImageError}
        />
        <button type="button" className="dibay-promo-tooltip__text" data-platform-popup-cta="1" onClick={p.onCta}>
          <span className="dibay-promo-tooltip__ad" aria-hidden="true">
            {p.creativeAria}
          </span>
          {p.title ? <span className="dibay-promo-tooltip__title">{p.title}</span> : null}
          {p.body ? <span className="dibay-promo-tooltip__body">{p.body}</span> : null}
        </button>
        <PopupCloseControl variant="floating" label={p.closeLabel} onClose={p.onClose} className="dibay-promo-tooltip__close" />
      </div>
    </div>,
    document.body
  );
}
