"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftHeroArtwork } from "@/components/gift-certificate/GiftHeroArtwork";
import {
  resolveGiftVisual,
  type GiftScope,
  type GiftVisualInput,
} from "@/lib/gift-certificate/resolve-gift-visual";
import {
  GIFT_CARD_SHELL_CLASS,
  GIFT_HERO_ASPECT_CLASS,
  GIFT_HERO_ASPECT_COMPACT_CLASS,
} from "@/lib/gift-certificate/gift-visual-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { formatMoneyPhp } from "@/lib/utils/format";

export type GiftVisualSurface = "mall" | "wallet" | "instance" | "transfer" | "chat" | "used";

const STORE_TONE = {
  ring: "ring-[#E11D48]/20",
  badge: "bg-[#E11D48]/90 text-white",
  amountBg: "from-black/55 via-black/25 to-transparent",
};
const PLATFORM_TONE = {
  ring: "ring-[#059669]/20",
  badge: "bg-[#059669]/90 text-white",
  amountBg: "from-black/55 via-black/25 to-transparent",
};

export function GiftVisualCard({
  visual,
  surface,
  title,
  issuerName,
  faceValue,
  remainingBalance,
  purchasePrice,
  publicGiftNumber,
  statusLabel,
  faded = false,
  detailHref,
  onDetail,
  onSend,
  sendDisabled = false,
  showSend = false,
  showValidity = true,
  showGiftNumber = false,
  amountSlot,
  footer,
  className = "",
  compact = false,
}: {
  visual: GiftVisualInput;
  surface: GiftVisualSurface;
  title?: string | null;
  issuerName?: string | null;
  faceValue?: number | null;
  remainingBalance?: number | null;
  purchasePrice?: number | null;
  publicGiftNumber?: string | null;
  statusLabel?: string | null;
  faded?: boolean;
  detailHref?: string;
  onDetail?: () => void;
  onSend?: () => void;
  sendDisabled?: boolean;
  showSend?: boolean;
  showValidity?: boolean;
  showGiftNumber?: boolean;
  amountSlot?: ReactNode;
  footer?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const { safeT } = useI18n();
  const resolved = resolveGiftVisual(visual);
  const scope: GiftScope = resolved.badgeScope;
  const isStore = scope === "STORE";
  const tone = isStore ? STORE_TONE : PLATFORM_TONE;
  const displayTitle = title?.trim() || visual.title?.trim() || "";
  const issuer = issuerName?.trim() || (scope === "PLATFORM" ? "DIBAY" : visual.storeName?.trim() || "");
  const isUsed = surface === "used" || faded;

  const badgeLabel = safeT(
    isStore ? "commerce_hub_gift_badge_store" : "commerce_hub_gift_badge_platform",
    {
      fallbackKo: isStore ? "매장 상품권" : "DIBAY 상품권",
      fallbackEn: isStore ? "Store gift" : "DIBAY gift",
    }
  );

  const scopeLine = isStore
    ? safeT("commerce_hub_gift_scope_store_named", {
        vars: { store: issuer },
        fallbackKo: `이 상품권은 ${issuer}에서 사용할 수 있습니다.`,
        fallbackEn: `Usable at ${issuer}.`,
      })
    : safeT("commerce_hub_gift_scope_platform", {
        fallbackKo: "DIBAY 이용 가능 매장",
        fallbackEn: "Eligible DIBAY stores",
      });

  const validityLine = safeT("commerce_hub_gift_validity_never", {
    fallbackKo: "유효기간 · 만료되지 않음",
    fallbackEn: "Validity · Never expires",
  });

  const face = faceValue ?? null;
  const remaining = remainingBalance ?? null;
  const purchase = purchasePrice ?? null;
  const promoGap =
    face != null && purchase != null && face > purchase ? face - purchase : null;

  const amountBlock =
    amountSlot ??
    (surface === "mall" ? (
      <div className="text-right">
        {face != null && purchase != null && face > purchase ? (
          <>
            <p className="text-sm tabular-nums text-white/75 line-through">{formatMoneyPhp(face)}</p>
            <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl">
              {formatMoneyPhp(purchase)}
            </p>
            {promoGap != null && promoGap > 0 ? (
              <p className="mt-1 text-xs font-semibold text-emerald-200">
                {safeT("commerce_hub_gift_mall_savings", {
                  vars: { savings: formatMoneyPhp(promoGap) },
                  fallbackKo: `${formatMoneyPhp(promoGap)} 할인`,
                  fallbackEn: `Save ${formatMoneyPhp(promoGap)}`,
                })}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-white/85">
              {safeT("commerce_hub_gift_mall_buy_use_copy", {
                vars: { purchase: formatMoneyPhp(purchase), face: formatMoneyPhp(face) },
                fallbackKo: `${formatMoneyPhp(purchase)}에 구매 · ${formatMoneyPhp(face)}까지 사용`,
                fallbackEn: `Buy for ${formatMoneyPhp(purchase)} · use up to ${formatMoneyPhp(face)}`,
              })}
            </p>
          </>
        ) : (
          <>
            {face != null ? (
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/85">
                {safeT("commerce_hub_gift_face_label", {
                  fallbackKo: "액면가",
                  fallbackEn: "Face value",
                })}
              </p>
            ) : null}
            {face != null ? (
              <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl">
                {formatMoneyPhp(face)}
              </p>
            ) : null}
            {purchase != null ? (
              <p className="mt-1 text-sm tabular-nums text-white/90">
                {safeT("commerce_hub_gift_purchase_label", {
                  fallbackKo: "구매가",
                  fallbackEn: "Purchase",
                })}{" "}
                {formatMoneyPhp(purchase)}
              </p>
            ) : null}
          </>
        )}
      </div>
    ) : isUsed ? (
      <div className="text-right">
        <p className="text-base font-bold text-white/90">
          {safeT("commerce_hub_used_completed", {
            fallbackKo: "사용 완료",
            fallbackEn: "Fully used",
          })}
        </p>
        {face != null ? (
          <p className="mt-0.5 text-sm tabular-nums text-white/80">
            {formatMoneyPhp(face)}
          </p>
        ) : null}
      </div>
    ) : (
      <div className="text-right">
        {remaining != null ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/85">
              {safeT("gift_u2_wallet_remaining", {
                fallbackKo: "잔액",
                fallbackEn: "Balance",
              })}
            </p>
            <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl">
              {formatMoneyPhp(remaining)}
            </p>
          </>
        ) : face != null ? (
          <p className="text-2xl font-bold tabular-nums leading-none tracking-tight text-white sm:text-3xl">
            {formatMoneyPhp(face)}
          </p>
        ) : null}
        {face != null && remaining != null && face !== remaining ? (
          <p className="mt-0.5 text-xs tabular-nums text-white/80">
            / {formatMoneyPhp(face)}
          </p>
        ) : null}
      </div>
    ));

  const detailBtn = detailHref ? (
    <Link
      href={detailHref}
      prefetch={false}
      className={`${Sam.btn.secondary} min-h-[40px] flex-1 px-3 text-sm`}
    >
      {safeT("commerce_hub_gift_detail_cta", {
        fallbackKo: "상세보기",
        fallbackEn: "Details",
      })}
    </Link>
  ) : onDetail ? (
    <button type="button" className={`${Sam.btn.secondary} min-h-[40px] flex-1 px-3 text-sm`} onClick={onDetail}>
      {safeT("commerce_hub_gift_detail_cta", {
        fallbackKo: "상세보기",
        fallbackEn: "Details",
      })}
    </button>
  ) : null;

  const sendBtn =
    showSend && onSend ? (
      <button
        type="button"
        className={`${Sam.btn.ghost} min-h-[40px] flex-1 px-3 text-sm font-semibold text-sam-primary disabled:opacity-50`}
        disabled={sendDisabled}
        onClick={onSend}
      >
        {safeT("gift_u3_wallet_send", {
          fallbackKo: "선물하기",
          fallbackEn: "Send as gift",
        })}
      </button>
    ) : null;

  const shellClass = compact ? "" : GIFT_CARD_SHELL_CLASS;
  const aspectClass = compact ? GIFT_HERO_ASPECT_COMPACT_CLASS : GIFT_HERO_ASPECT_CLASS;

  return (
    <article
      className={`overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm ring-1 ${tone.ring} ${
        isUsed ? "opacity-75 saturate-[0.7]" : ""
      } ${shellClass} ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={scope}
      data-gift-visual-surface={surface}
    >
      {/* Monetary asset — hero first */}
      <div className={`relative min-h-[120px] w-full overflow-hidden ${aspectClass}`}>
        <GiftHeroArtwork resolved={resolved} issuer={issuer} compact={compact} />
        <div className={`absolute inset-0 bg-gradient-to-t ${tone.amountBg}`} aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
          <div className="min-w-0">
            <span className={`inline-flex rounded-ui-rect px-2 py-0.5 text-[10px] font-bold tracking-wide ${tone.badge}`}>
              {badgeLabel}
            </span>
            <p className="mt-1 truncate text-sm font-bold text-white drop-shadow-sm">{issuer}</p>
            {displayTitle && displayTitle !== issuer ? (
              <p className="truncate text-xs text-white/85">{displayTitle}</p>
            ) : null}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3">{amountBlock}</div>
      </div>

      {/* Metadata — second */}
      <div className="space-y-1 border-t border-sam-border/70 px-3 py-2.5">
        <p className="text-xs leading-snug text-sam-muted">{scopeLine}</p>
        {showValidity ? (
          <p className="text-xs text-sam-muted" data-gift-validity="1">
            {validityLine}
          </p>
        ) : null}
        {statusLabel ? (
          <p className="text-xs font-semibold text-sam-fg" data-gift-status-label="1">
            {statusLabel}
          </p>
        ) : null}
        {showGiftNumber && publicGiftNumber?.trim() ? (
          <p className="text-xs text-sam-fg" data-gift-public-number={publicGiftNumber.trim()}>
            {safeT("gift_u2_public_number_label", {
              fallbackKo: "상품권 번호",
              fallbackEn: "Gift number",
            })}
            : <span className="font-medium tabular-nums">{publicGiftNumber.trim()}</span>
          </p>
        ) : null}
      </div>

      {footer ? (
        <div className="border-t border-sam-border/60 px-3 py-2.5">{footer}</div>
      ) : detailBtn || sendBtn ? (
        <div className="flex gap-2 border-t border-sam-border/60 px-3 py-2.5">
          {detailBtn}
          {sendBtn}
        </div>
      ) : null}
    </article>
  );
}
