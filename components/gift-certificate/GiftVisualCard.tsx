"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DibayGiftCertificateFace,
  type GiftCertificateValueMode,
} from "@/components/gift-certificate/DibayGiftCertificateFace";
import {
  resolveGiftVisual,
  type GiftScope,
  type GiftVisualInput,
} from "@/lib/gift-certificate/resolve-gift-visual";
import {
  GIFT_CARD_SHELL_CLASS,
  GIFT_DETAIL_CARD_SHELL_CLASS,
  type GiftCertificateFaceVariant,
} from "@/lib/gift-certificate/gift-visual-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

export type GiftVisualSurface = "mall" | "wallet" | "instance" | "transfer" | "chat" | "used";

function resolveValueMode(surface: GiftVisualSurface, faded: boolean): GiftCertificateValueMode {
  if (surface === "mall") return "mall";
  if (surface === "used" || faded) return "used";
  return "wallet";
}

function resolveFaceVariant(
  faceVariant: GiftCertificateFaceVariant | undefined,
  fullWidth: boolean,
  compact: boolean
): GiftCertificateFaceVariant {
  if (faceVariant) return faceVariant;
  if (fullWidth) return "hero";
  if (compact) return "compact";
  return "standard";
}

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
  fullWidth = false,
  faceVariant,
  hideFooter = false,
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
  fullWidth?: boolean;
  faceVariant?: GiftCertificateFaceVariant;
  hideFooter?: boolean;
}) {
  const { safeT } = useI18n();
  const resolved = resolveGiftVisual(visual);
  const scope: GiftScope = resolved.badgeScope;
  const isStore = scope === "STORE";
  const displayTitle = title?.trim() || visual.title?.trim() || "";
  const issuer = issuerName?.trim() || (scope === "PLATFORM" ? "DIBAY" : visual.storeName?.trim() || "");
  const isUsed = surface === "used" || faded;
  const variant = resolveFaceVariant(faceVariant, fullWidth, compact);
  const valueMode = resolveValueMode(surface, isUsed);

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

  const shellClass =
    variant === "hero" ? GIFT_DETAIL_CARD_SHELL_CLASS : variant === "standard" ? GIFT_CARD_SHELL_CLASS : "";

  return (
    <article
      className={`overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm ${
        isUsed ? "opacity-75 saturate-[0.7]" : ""
      } ${shellClass} ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={scope}
      data-gift-visual-surface={surface}
      data-gift-face-variant={variant}
    >
      <DibayGiftCertificateFace
        variant={variant}
        valueMode={valueMode}
        faceValue={faceValue ?? null}
        purchasePrice={purchasePrice ?? null}
        remainingBalance={remainingBalance ?? null}
        valueSlot={amountSlot}
        priority={variant === "hero"}
        hideFooter={hideFooter}
      />

      <div className="space-y-1 border-t border-sam-border/70 px-3 py-2.5">
        {displayTitle && displayTitle !== issuer ? (
          <p className="truncate text-sm font-semibold text-sam-fg">{displayTitle}</p>
        ) : null}
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
