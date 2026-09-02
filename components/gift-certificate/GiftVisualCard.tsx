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

  const badgePlatform = safeT("gift_portrait_badge_platform", {
    fallbackKo: "DIBAY 상품권",
    fallbackEn: "DIBAY gift",
  });
  const badgeStore = safeT("gift_portrait_badge_store", {
    fallbackKo: "매장 상품권",
    fallbackEn: "Store gift",
  });
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
    faceAmountLabel: safeT("commerce_hub_gift_face_label", {
      fallbackKo: "상품권 금액",
      fallbackEn: "Gift certificate amount",
    }),
    purchaseLabel: safeT("commerce_hub_gift_purchase_label", {
      fallbackKo: "구매가",
      fallbackEn: "Purchase price",
    }),
    balanceLabel: safeT("gift_u2_wallet_remaining", {
      fallbackKo: "잔액",
      fallbackEn: "Balance",
    }),
    originalFaceLabel: safeT("gift_portrait_original_face", {
      fallbackKo: "원래 금액",
      fallbackEn: "Original amount",
    }),
    usedLabel: safeT("commerce_hub_used_completed", {
      fallbackKo: "사용 완료",
      fallbackEn: "Fully used",
    }),
    issuerLabel: safeT("gift_portrait_issuer_label", {
      fallbackKo: "발행처",
      fallbackEn: "Issuer",
    }),
    expiryLabel: safeT("gift_portrait_expiry_label", {
      fallbackKo: "유효기간",
      fallbackEn: "Valid until",
    }),
    numberLabel: safeT("gift_u2_public_number_label", {
      fallbackKo: "상품권 번호",
      fallbackEn: "Gift number",
    }),
    numberUnavailable:
      context === "mall" || context === "admin_preview"
        ? safeT("gift_portrait_number_preview", {
            fallbackKo: "구매 후 발급",
            fallbackEn: "Issued after purchase",
          })
        : safeT("gift_portrait_number_after_acceptance", {
            fallbackKo: "수령 후 표시",
            fallbackEn: "Shown after acceptance",
          }),
  };

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

  const shellClass = giftCertificateSizeShellClass(faceSize);

  return (
    <article
      className={`overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm ${
        isUsed ? "opacity-75 saturate-[0.7]" : ""
      } ${shellClass} ${className}`}
      data-gift-visual-card="1"
      data-gift-scope={model.kind}
      data-gift-visual-surface={surface}
      data-gift-face-size={faceSize}
      {...(showGiftNumber && publicGiftNumber?.trim()
        ? { "data-gift-public-number": publicGiftNumber.trim() }
        : {})}
    >
      <DibayGiftCertificateFace model={model} labels={labels} />

      {statusLabel ? (
        <div className="space-y-1 border-t border-sam-border/70 px-3 py-2.5">
          <p className="text-xs font-semibold text-sam-fg" data-gift-status-label="1">
            {statusLabel}
          </p>
        </div>
      ) : null}

      {footer ? (
        <div className="border-t border-sam-border/60 px-3 py-2.5" data-gift-card-footer="1">
          {footer}
        </div>
      ) : null}
      {detailBtn || sendBtn ? (
        <div
          className="flex gap-2 border-t border-sam-border/60 px-3 py-2.5"
          data-gift-card-actions="1"
        >
          {detailBtn}
          {sendBtn}
        </div>
      ) : null}
    </article>
  );
}
