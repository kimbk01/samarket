"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { DibayPlatformGiftFallback } from "@/components/gift-certificate/DibayPlatformGiftFallback";
import {
  resolveGiftVisual,
  type GiftScope,
  type GiftVisualInput,
} from "@/lib/gift-certificate/resolve-gift-visual";

export type GiftVisualSurface = "mall" | "wallet" | "instance" | "transfer" | "chat" | "used";

export function GiftVisualCard({
  visual,
  surface,
  title,
  issuerName,
  faceValue,
  remainingBalance,
  purchasePrice,
  amountSlot,
  footer,
  className = "",
}: {
  visual: GiftVisualInput;
  surface: GiftVisualSurface;
  title?: string | null;
  issuerName?: string | null;
  faceValue?: number | null;
  remainingBalance?: number | null;
  purchasePrice?: number | null;
  amountSlot?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const { safeT } = useI18n();
  const resolved = resolveGiftVisual(visual);
  const scope: GiftScope = resolved.badgeScope;
  const displayTitle = title?.trim() || visual.title?.trim() || "";
  const issuer = issuerName?.trim() || (scope === "PLATFORM" ? "DIBAY" : visual.storeName?.trim() || "");

  const badgeLabel = safeT(
    scope === "PLATFORM" ? "commerce_hub_gift_badge_platform" : "commerce_hub_gift_badge_store",
    {
      fallbackKo: scope === "PLATFORM" ? "DIBAY 상품권" : "매장 상품권",
      fallbackEn: scope === "PLATFORM" ? "DIBAY gift" : "Store gift",
    }
  );

  const scopeLine = safeT(
    scope === "PLATFORM" ? "commerce_hub_gift_scope_platform" : "commerce_hub_gift_scope_store",
    {
      fallbackKo:
        scope === "PLATFORM"
          ? "DIBAY 이용 가능 매장에서 사용할 수 있습니다."
          : "이 매장에서만 사용할 수 있습니다.",
      fallbackEn:
        scope === "PLATFORM"
          ? "Usable at eligible DIBAY stores."
          : "Usable only at this store.",
    }
  );

  const defaultAmount = (() => {
    if (amountSlot) return amountSlot;
    const face = faceValue ?? null;
    const remaining = remainingBalance ?? null;
    if (surface === "mall") {
      return (
        <div className="space-y-0.5">
          {face != null ? (
            <p className="text-sm font-semibold tabular-nums text-sam-fg">
              {face.toLocaleString()}
            </p>
          ) : null}
          {purchasePrice != null ? (
            <p className="text-xs tabular-nums text-sam-muted">
              {purchasePrice.toLocaleString()} Point
            </p>
          ) : null}
        </div>
      );
    }
    if (surface === "used") {
      return (
        <p className="text-sm font-semibold text-sam-muted">
          {safeT("commerce_hub_used_completed", {
            fallbackKo: "사용 완료",
            fallbackEn: "Fully used",
          })}
        </p>
      );
    }
    if (remaining != null) {
      return (
        <div className="space-y-0.5">
          <p className="text-base font-semibold tabular-nums text-sam-fg">
            {remaining.toLocaleString()}
          </p>
          {face != null && face !== remaining ? (
            <p className="text-xs tabular-nums text-sam-muted">/ {face.toLocaleString()}</p>
          ) : null}
        </div>
      );
    }
    if (face != null) {
      return (
        <p className="text-base font-semibold tabular-nums text-sam-fg">{face.toLocaleString()}</p>
      );
    }
    return null;
  })();

  const borderTone =
    scope === "PLATFORM"
      ? "border-emerald-600/30 bg-emerald-50/40 dark:bg-emerald-950/20"
      : "border-red-500/25 bg-red-50/30 dark:bg-red-950/15";

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-ui-rect border ${borderTone} ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={scope}
      data-gift-visual-surface={surface}
    >
      <div className="flex min-w-0 gap-3 p-3">
        <div className="relative shrink-0">
          {resolved.imageSrc ? (
            <GiftArtwork src={resolved.imageSrc} alt={displayTitle} size={72} />
          ) : resolved.usePlatformFallback ? (
            <DibayPlatformGiftFallback className="h-[72px] w-[72px] rounded-ui-rect" />
          ) : (
            <div
              className="flex h-[72px] w-[72px] items-center justify-center rounded-ui-rect bg-signature/15 text-lg font-bold text-signature"
              data-gift-store-initial="1"
            >
              {resolved.storeInitial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sam-muted">{badgeLabel}</p>
          {displayTitle ? (
            <p className="truncate text-sm font-semibold text-sam-fg">{displayTitle}</p>
          ) : null}
          {issuer ? <p className="truncate text-xs text-sam-muted">{issuer}</p> : null}
          <div className="mt-1">{defaultAmount}</div>
          <p className="mt-1 text-[11px] leading-snug text-sam-muted">{scopeLine}</p>
          {footer ? <div className="mt-2">{footer}</div> : null}
        </div>
      </div>
    </article>
  );
}
