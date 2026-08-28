"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { DibayPlatformGiftFallback } from "@/components/gift-certificate/DibayPlatformGiftFallback";
import { StoreGiftFallback } from "@/components/gift-certificate/StoreGiftFallback";
import {
  resolveGiftVisual,
  type GiftScope,
  type GiftVisualInput,
} from "@/lib/gift-certificate/resolve-gift-visual";
import { Sam } from "@/lib/ui/sam-component-classes";
import { formatMoneyPhp } from "@/lib/utils/format";

export type GiftVisualSurface = "mall" | "wallet" | "instance" | "transfer" | "chat" | "used";

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
  /** Chat / inline mini variant */
  compact?: boolean;
}) {
  const { safeT } = useI18n();
  const resolved = resolveGiftVisual(visual);
  const scope: GiftScope = resolved.badgeScope;
  const displayTitle = title?.trim() || visual.title?.trim() || "";
  const issuer = issuerName?.trim() || (scope === "PLATFORM" ? "DIBAY" : visual.storeName?.trim() || "");
  const isStore = scope === "STORE";
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
        fallbackKo: "DIBAY 이용 가능 매장에서 사용할 수 있습니다.",
        fallbackEn: "Usable at eligible DIBAY stores.",
      });

  const validityLine = safeT("commerce_hub_gift_validity_never", {
    fallbackKo: "유효기간 · 만료되지 않음",
    fallbackEn: "Validity · Never expires",
  });

  const face = faceValue ?? null;
  const remaining = remainingBalance ?? null;
  const artSize = compact ? 88 : 128;

  const amountBlock =
    amountSlot ??
    (surface === "mall" ? (
      <div className="space-y-1">
        {face != null ? (
          <p className="text-xs font-medium text-white/80">
            {safeT("commerce_hub_gift_face_label", {
              fallbackKo: "상품권 금액",
              fallbackEn: "Face value",
            })}
          </p>
        ) : null}
        {face != null ? (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
            {formatMoneyPhp(face)}
          </p>
        ) : null}
        {purchasePrice != null ? (
          <p className="text-sm tabular-nums text-white/90">
            {safeT("commerce_hub_gift_purchase_label", {
              fallbackKo: "구매가",
              fallbackEn: "Purchase price",
            })}{" "}
            {formatMoneyPhp(purchasePrice)}
          </p>
        ) : null}
      </div>
    ) : isUsed ? (
      <div className="space-y-1">
        <p className="text-lg font-bold text-sam-muted">
          {safeT("commerce_hub_used_completed", {
            fallbackKo: "사용 완료",
            fallbackEn: "Fully used",
          })}
        </p>
        {face != null ? (
          <p className="text-sm tabular-nums text-sam-muted">
            {safeT("commerce_hub_gift_original_amount", {
              fallbackKo: "원래 금액",
              fallbackEn: "Original",
            })}{" "}
            {formatMoneyPhp(face)}
          </p>
        ) : null}
      </div>
    ) : (
      <div className="space-y-1">
        {remaining != null ? (
          <>
            <p className="text-xs font-medium text-white/80">
              {safeT("gift_u2_wallet_remaining", {
                fallbackKo: "잔액",
                fallbackEn: "Balance",
              })}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
              {formatMoneyPhp(remaining)}
            </p>
          </>
        ) : face != null ? (
          <p className="text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
            {formatMoneyPhp(face)}
          </p>
        ) : null}
        {face != null && remaining != null && face !== remaining ? (
          <p className="text-sm tabular-nums text-white/85">
            / {formatMoneyPhp(face)}
          </p>
        ) : null}
      </div>
    ));

  const shellTone = isStore
    ? "border-[#EE3635]/30 bg-gradient-to-br from-[#FFF5F5] via-white to-[#FFF0EF]"
    : "border-[#045E3A]/25 bg-gradient-to-br from-[#F0FAF5] via-white to-[#E8F6EF]";

  const headerTone = isStore ? "bg-[#EE3635] text-white" : "bg-[#045E3A] text-white";

  const detailBtn = detailHref ? (
    <Link href={detailHref} prefetch={false} className={`${Sam.btn.secondary} min-h-[44px] flex-1 px-3 text-sm`}>
      {safeT("commerce_hub_gift_detail_cta", {
        fallbackKo: "상세보기",
        fallbackEn: "Details",
      })}
    </Link>
  ) : onDetail ? (
    <button type="button" className={`${Sam.btn.secondary} min-h-[44px] flex-1 px-3 text-sm`} onClick={onDetail}>
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
        className={`${Sam.btn.primary} min-h-[44px] flex-1 px-3 text-sm disabled:opacity-50`}
        disabled={sendDisabled}
        onClick={onSend}
      >
        {safeT("gift_u3_wallet_send", {
          fallbackKo: "선물하기",
          fallbackEn: "Send as gift",
        })}
      </button>
    ) : null;

  return (
    <article
      className={`mx-auto w-full min-w-0 max-w-[42rem] overflow-hidden rounded-ui-rect border shadow-sm ${shellTone} ${
        isUsed ? "opacity-80 saturate-[0.85]" : ""
      } ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={scope}
      data-gift-visual-surface={surface}
    >
      <div className={`px-3 py-2 text-xs font-semibold tracking-wide ${headerTone}`}>{badgeLabel}</div>

      <div className={`grid min-w-0 gap-3 p-3 ${compact ? "grid-cols-[1fr_88px]" : "grid-cols-1 sm:grid-cols-[1fr_128px]"}`}>
        <div className="min-w-0 order-2 sm:order-1">
          <p className="truncate text-base font-bold text-sam-fg">{issuer}</p>
          {displayTitle && displayTitle !== issuer ? (
            <p className="mt-0.5 truncate text-sm text-sam-muted">{displayTitle}</p>
          ) : null}
          <div
            className={`mt-3 rounded-ui-rect px-3 py-2 ${
              isStore ? "bg-[#EE3635] text-white" : "bg-[#045E3A] text-white"
            }`}
          >
            {amountBlock}
          </div>
          {statusLabel ? (
            <p className="mt-2 text-sm font-medium text-sam-fg" data-gift-status-label="1">
              {statusLabel}
            </p>
          ) : null}
          {showValidity ? (
            <p className="mt-2 text-xs text-sam-muted" data-gift-validity="1">
              {validityLine}
            </p>
          ) : null}
          <p className="mt-1 text-xs leading-snug text-sam-muted">{scopeLine}</p>
          {showGiftNumber && publicGiftNumber?.trim() ? (
            <p className="mt-2 text-xs text-sam-fg" data-gift-public-number={publicGiftNumber.trim()}>
              {safeT("gift_u2_public_number_label", {
                fallbackKo: "상품권 번호",
                fallbackEn: "Gift number",
              })}
              : <span className="font-medium tabular-nums">{publicGiftNumber.trim()}</span>
            </p>
          ) : null}
        </div>

        <div className={`order-1 sm:order-2 ${compact ? "justify-self-end" : "justify-self-center sm:justify-self-end"}`}>
          {resolved.imageSrc ? (
            <GiftArtwork
              src={resolved.imageSrc}
              alt={displayTitle || issuer}
              size={artSize}
              className="shadow-md"
              roundedClassName="rounded-ui-rect"
            />
          ) : resolved.usePlatformFallback ? (
            <DibayPlatformGiftFallback className={`${compact ? "h-[88px] w-[88px]" : "h-[128px] w-[128px]"} rounded-ui-rect shadow-md`} />
          ) : (
            <StoreGiftFallback
              initial={resolved.storeInitial}
              className={`${compact ? "h-[88px] w-[88px]" : "h-[128px] w-[128px]"} rounded-ui-rect shadow-md`}
            />
          )}
        </div>
      </div>

      {footer ? (
        <div className="border-t border-sam-border/60 px-3 py-3">{footer}</div>
      ) : detailBtn || sendBtn ? (
        <div className="flex gap-2 border-t border-sam-border/60 px-3 py-3">
          {detailBtn}
          {sendBtn}
        </div>
      ) : null}
    </article>
  );
}
