"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayGiftCertificateFace } from "@/components/gift-certificate/DibayGiftCertificateFace";
import {
  buildGiftCertificateVisualModel,
  type GiftCertificateVisualContext,
} from "@/lib/gift-certificate/gift-certificate-visual-model";
import type { GiftVisualInput } from "@/lib/gift-certificate/resolve-gift-visual";
import {
  giftCertificateSizeShellClass,
  giftFaceVariantToSize,
  type GiftCertificateFaceSize,
  type GiftCertificateFaceVariant,
} from "@/lib/gift-certificate/gift-visual-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

export type GiftVisualSurface =
  | "mall"
  | "wallet"
  | "instance"
  | "transfer"
  | "chat"
  | "used"
  | "admin_preview";

function surfaceToContext(surface: GiftVisualSurface): GiftCertificateVisualContext {
  if (surface === "mall") return "mall";
  if (surface === "admin_preview") return "admin_preview";
  if (surface === "used") return "used";
  if (surface === "transfer") return "transfer";
  if (surface === "chat") return "chat";
  if (surface === "instance") return "detail";
  return "wallet";
}

function resolveSize(args: {
  size?: GiftCertificateFaceSize;
  faceVariant?: GiftCertificateFaceVariant;
  fullWidth?: boolean;
  compact?: boolean;
}): GiftCertificateFaceSize {
  if (args.size) return args.size;
  if (args.faceVariant) return giftFaceVariantToSize(args.faceVariant);
  if (args.fullWidth) return "lg";
  if (args.compact) return "sm";
  return "md";
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
  expirationDisplay,
  statusLabel,
  faded = false,
  detailHref,
  onDetail,
  onSend,
  sendDisabled = false,
  showSend = false,
  showValidity = true,
  showGiftNumber = false,
  footer,
  className = "",
  compact = false,
  fullWidth = false,
  faceVariant,
  size,
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
  /** Preformatted expiry from loader/policy — never invent here. */
  expirationDisplay?: string | null;
  statusLabel?: string | null;
  faded?: boolean;
  detailHref?: string;
  onDetail?: () => void;
  onSend?: () => void;
  sendDisabled?: boolean;
  showSend?: boolean;
  /** Outer validity line removed — face meta is authority when expirationDisplay is set. */
  showValidity?: boolean;
  showGiftNumber?: boolean;
  /** @deprecated unused — amounts live on face */
  amountSlot?: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** @deprecated maps to size=sm only */
  compact?: boolean;
  /** @deprecated maps to size=lg only */
  fullWidth?: boolean;
  /** @deprecated maps to size scale only */
  faceVariant?: GiftCertificateFaceVariant;
  size?: GiftCertificateFaceSize;
  /** @deprecated no-op — face has no feature footer */
  hideFooter?: boolean;
}) {
  void hideFooter;
  const { safeT } = useI18n();
  const context = surfaceToContext(surface);
  const isUsed = surface === "used" || faded;
  const faceSize = resolveSize({ size, faceVariant, fullWidth, compact });

  const badgePlatform = safeT("gift_portrait_badge_platform");
  const badgeStore = safeT("gift_portrait_badge_store");
  const resolvedExpiry =
    expirationDisplay != null && expirationDisplay.trim() !== ""
      ? expirationDisplay.trim()
      : null;

  const model = buildGiftCertificateVisualModel({
    giftScope: visual.giftScope,
    context: isUsed ? "used" : context,
    title: title ?? visual.title,
    issuerName: issuerName ?? visual.storeName,
    imageUrl: visual.imageUrl,
    storeLogoUrl: visual.storeLogoUrl,
    storeName: visual.storeName,
    faceValue,
    purchasePrice,
    remainingBalance,
    expirationDisplay: showValidity ? resolvedExpiry : null,
    certificateDisplayNumber: showGiftNumber ? publicGiftNumber : null,
    valueMode: isUsed ? "used" : undefined,
    issuerBadgePlatform: badgePlatform,
    issuerBadgeStore: badgeStore,
  });

  const labels = {
    faceAmountLabel: safeT("commerce_hub_gift_face_label"),
    purchaseLabel: safeT("commerce_hub_gift_purchase_label"),
    balanceLabel: safeT("gift_u2_wallet_remaining"),
    usedLabel: safeT("commerce_hub_used_completed"),
    issuerLabel: safeT("gift_portrait_issuer_label"),
    expiryLabel: safeT("gift_portrait_expiry_label"),
    numberLabel: safeT("gift_u2_public_number_label"),
    numberUnavailable:
      context === "mall" || context === "admin_preview"
        ? safeT("gift_portrait_number_preview")
        : safeT("gift_portrait_number_after_acceptance"),
    storeScopeNotice: safeT("gift_portrait_store_scope_notice"),
  };

  const detailBtn = detailHref ? (
    <Link
      href={detailHref}
      prefetch={false}
      className={`${Sam.btn.secondary} min-h-[40px] flex-1 px-3 text-sm`}
    >
      {safeT("commerce_hub_gift_detail_cta")}
    </Link>
  ) : onDetail ? (
    <button type="button" className={`${Sam.btn.secondary} min-h-[40px] flex-1 px-3 text-sm`} onClick={onDetail}>
      {safeT("commerce_hub_gift_detail_cta")}
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
        {safeT("gift_u3_wallet_send")}
      </button>
    ) : null;

  const shellClass = giftCertificateSizeShellClass(faceSize);

  return (
    <article
      className={`min-w-0 overflow-visible bg-transparent ${
        isUsed ? "opacity-90 saturate-[0.7]" : ""
      } ${shellClass} ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={model.kind}
      data-gift-visual-surface={surface}
      data-gift-availability={isUsed ? "USED" : "AVAILABLE"}
      data-gift-face-size={faceSize}
      {...(showGiftNumber && publicGiftNumber?.trim()
        ? { "data-gift-public-number": publicGiftNumber.trim() }
        : {})}
    >
      <DibayGiftCertificateFace model={model} labels={labels} />

      {statusLabel ? (
        <div className="space-y-1 px-1 pt-2">
          <p className="text-xs font-semibold text-sam-fg" data-gift-status-label="1">
            {statusLabel}
          </p>
        </div>
      ) : null}

      {footer ? (
        <div className="px-1 pt-2" data-gift-card-footer="1">
          {footer}
        </div>
      ) : null}
      {detailBtn || sendBtn ? (
        <div className="flex gap-2 px-1 pt-2" data-gift-card-actions="1">
          {detailBtn}
          {sendBtn}
        </div>
      ) : null}
    </article>
  );
}
