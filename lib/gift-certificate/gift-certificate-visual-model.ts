/**
 * Canonical gift certificate visual presentation model.
 * DB/DTO → single authority before SVG render (UI-only; no expiry domain).
 */

import type { GiftScope } from "@/lib/gift-certificate/gift-certificate-domain-contract";
import type { GiftCertificateFaceVariant } from "@/lib/gift-certificate/gift-visual-layout";
import {
  formatGiftMoney,
  formatGiftDateOnly,
  formatGiftValidityRange,
} from "@/lib/gift-certificate/gift-certificate-format";

export type GiftCertificateDisplayAmountKind = "FACE_VALUE" | "REMAINING_BALANCE";

export type GiftCertificateVisualValidity = {
  label: string;
  display: string;
};

export type GiftCertificateVisualScope =
  | { type: "DIBAY_ALL" }
  | { type: "STORE"; storeName: string };

export type GiftCertificateVisualStatus = "ACTIVE" | "USED" | "LOCKED" | "OTHER";

export type GiftCertificateVisualModel = {
  title: string;
  displayAmount: {
    amount: number;
    formatted: string;
    currency: "PHP";
    kind: GiftCertificateDisplayAmountKind;
    amountLabel: string;
    secondaryFaceFormatted: string | null;
  };
  /** Null = certificate expiry row is not rendered on the face. */
  validity: GiftCertificateVisualValidity | null;
  scope: GiftCertificateVisualScope;
  scopeFooterLine: string;
  useLikeCashLine: string;
  securityTitle: string;
  securitySub: string;
  status: GiftCertificateVisualStatus;
  statusOverlayLabel: string | null;
  variant: GiftCertificateFaceVariant;
  giftScope: GiftScope;
};

export type GiftVisualModelLabels = {
  amountLabelFace: string;
  amountLabelBalance: string;
  validityLabel: string;
  securityTitle: string;
  securitySub: string;
  useLikeCash: string;
  scopeAllStores: string;
  scopeStoreNamed: (store: string) => string;
  statusUsed: string;
  statusLocked: string;
};

function resolveScope(giftScope: GiftScope, storeName: string): GiftCertificateVisualScope {
  if (giftScope === "PLATFORM") return { type: "DIBAY_ALL" };
  const name = storeName.trim();
  return name ? { type: "STORE", storeName: name } : { type: "DIBAY_ALL" };
}

function scopeFooterLine(scope: GiftCertificateVisualScope, labels: GiftVisualModelLabels): string {
  if (scope.type === "DIBAY_ALL") return labels.scopeAllStores;
  return labels.scopeStoreNamed(scope.storeName);
}

function resolveCertificateValidity(input: {
  validFrom?: string | null;
  validUntil?: string | null;
  validityDisplay?: string | null;
  labels: GiftVisualModelLabels;
}): GiftCertificateVisualValidity | null {
  if (input.validityDisplay?.trim()) {
    return {
      label: input.labels.validityLabel,
      display: input.validityDisplay.trim(),
    };
  }
  const from = input.validFrom?.trim().slice(0, 10) ?? "";
  const until = input.validUntil?.trim().slice(0, 10) ?? "";
  if (from && until) {
    return {
      label: input.labels.validityLabel,
      display: formatGiftValidityRange(from, until),
    };
  }
  if (!from && until) {
    return {
      label: input.labels.validityLabel,
      display: formatGiftDateOnly(until),
    };
  }
  return null;
}

function resolveStatus(
  statusRaw: string | undefined,
  faded: boolean,
  labels: GiftVisualModelLabels
): { status: GiftCertificateVisualStatus; overlay: string | null } {
  const s = (statusRaw ?? "").toUpperCase();
  if (faded || s === "FULLY_REDEEMED") {
    return { status: "USED", overlay: labels.statusUsed };
  }
  if (s === "GIFT_LOCKED") {
    return { status: "LOCKED", overlay: labels.statusLocked };
  }
  return { status: "ACTIVE", overlay: null };
}

type SafeTranslate = (
  key: string,
  opts?: {
    vars?: Record<string, string | number>;
    fallbackKo?: string;
    fallbackEn?: string;
  }
) => string;

export function buildGiftVisualModelLabels(safeT: SafeTranslate): GiftVisualModelLabels {
  return {
    amountLabelFace: safeT("commerce_hub_gift_face_label", {
      fallbackKo: "상품권 금액",
      fallbackEn: "Gift certificate amount",
    }),
    amountLabelBalance: safeT("gift_u2_wallet_remaining", {
      fallbackKo: "잔액",
      fallbackEn: "Balance",
    }),
    validityLabel: safeT("gift_u2_card_footer_validity_title", {
      fallbackKo: "유효기간",
      fallbackEn: "Validity",
    }),
    securityTitle: safeT("gift_u2_card_footer_secure_title", {
      fallbackKo: "안전한 디지털 상품권",
      fallbackEn: "Secure digital certificate",
    }),
    securitySub: safeT("gift_u2_card_footer_secure_sub", {
      fallbackKo: "보안이 적용된 안심 상품권",
      fallbackEn: "Protected certificate",
    }),
    useLikeCash: safeT("gift_u2_card_use_like_cash", {
      fallbackKo: "DIBAY에서 현금처럼 사용하세요.",
      fallbackEn: "Use it like cash at DIBAY.",
    }),
    scopeAllStores: safeT("gift_u2_card_footer_store_title", {
      fallbackKo: "전 매장 사용 가능",
      fallbackEn: "All stores",
    }),
    scopeStoreNamed: (store) =>
      safeT("gift_u2_card_scope_store_short", {
        vars: { store },
        fallbackKo: `${store}에서 사용 가능`,
        fallbackEn: `Usable at ${store}`,
      }),
    statusUsed: safeT("commerce_hub_used_completed", {
      fallbackKo: "사용 완료",
      fallbackEn: "Fully used",
    }),
    statusLocked: safeT("gift_u4_err_gift_locked", {
      fallbackKo: "수령 대기 중",
      fallbackEn: "Awaiting accept",
    }),
  };
}

export function buildGiftCertificateVisualModel(input: {
  surface: "mall" | "wallet" | "instance" | "transfer" | "chat" | "used";
  title: string;
  giftScope: GiftScope;
  storeName: string;
  faceValue: number | null;
  remainingBalance: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  validityDisplay?: string | null;
  status?: string;
  faded?: boolean;
  variant: GiftCertificateFaceVariant;
  labels: GiftVisualModelLabels;
}): GiftCertificateVisualModel | null {
  const title = input.title.trim();
  if (!title) return null;

  const scope = resolveScope(input.giftScope, input.storeName);
  const validity = resolveCertificateValidity({
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    validityDisplay: input.validityDisplay,
    labels: input.labels,
  });

  if (input.surface === "mall") {
    if (input.faceValue == null) return null;
    const formatted = formatGiftMoney(input.faceValue);
    return {
      title,
      displayAmount: {
        amount: input.faceValue,
        formatted,
        currency: "PHP",
        kind: "FACE_VALUE",
        amountLabel: input.labels.amountLabelFace,
        secondaryFaceFormatted: null,
      },
      validity,
      scope,
      scopeFooterLine: scopeFooterLine(scope, input.labels),
      useLikeCashLine: input.labels.useLikeCash,
      securityTitle: input.labels.securityTitle,
      securitySub: input.labels.securitySub,
      status: "ACTIVE",
      statusOverlayLabel: null,
      variant: input.variant,
      giftScope: input.giftScope,
    };
  }

  const balance = input.remainingBalance ?? input.faceValue;
  if (balance == null) return null;

  const { status, overlay } = resolveStatus(
    input.status,
    Boolean(input.faded) || input.surface === "used",
    input.labels
  );
  const formatted = formatGiftMoney(balance);
  const faceValue = input.faceValue ?? balance;
  const showSecondary = balance !== faceValue && faceValue > 0;

  return {
    title,
    displayAmount: {
      amount: balance,
      formatted,
      currency: "PHP",
      kind: "REMAINING_BALANCE",
      amountLabel: input.labels.amountLabelBalance,
      secondaryFaceFormatted: showSecondary ? formatGiftMoney(faceValue) : null,
    },
    validity,
    scope,
    scopeFooterLine: scopeFooterLine(scope, input.labels),
    useLikeCashLine: input.labels.useLikeCash,
    securityTitle: input.labels.securityTitle,
    securitySub: input.labels.securitySub,
    status,
    statusOverlayLabel: overlay,
    variant: input.variant,
    giftScope: input.giftScope,
  };
}
