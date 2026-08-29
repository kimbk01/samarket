"use client";

/**
 * Canonical DIBAY gift certificate portrait face.
 * Geometry = viewBox user units only (800×1200). No container-query / viewport internals.
 * SAME CERTIFICATE × SCALE — outer wrapper scales; internals never rearrange.
 */

import type { GiftCertificateVisualModel } from "@/lib/gift-certificate/gift-certificate-visual-model";
import { giftMallShowsDiscountArrow } from "@/lib/gift-certificate/gift-certificate-visual-model";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { formatMoneyPhp } from "@/lib/utils/format";

/** Landmark Y positions in viewBox units — for geometry QA. */
export const GIFT_PORTRAIT_LANDMARKS = {
  heroBottomY: 320,
  titleY: 400,
  amountY: 520,
  priceY: 600,
  perforationY: 720,
  issuerY: 820,
  expiryY: 880,
  numberY: 940,
} as const;

const VB_W = GIFT_CERT_COORD_WIDTH;
const VB_H = GIFT_CERT_COORD_HEIGHT;

function MetaRow({
  label,
  value,
  y,
  dataAttr,
}: {
  label: string;
  value: string;
  y: number;
  dataAttr?: string;
}) {
  return (
    <g data-gift-landmark={dataAttr}>
      <text x={64} y={y} fontSize={22} fill="#6B7280" fontFamily="system-ui,sans-serif">
        {label}
      </text>
      <text
        x={VB_W - 64}
        y={y}
        fontSize={24}
        fill="#111827"
        fontFamily="system-ui,sans-serif"
        fontWeight={600}
        textAnchor="end"
      >
        {value}
      </text>
    </g>
  );
}

export function DibayGiftCertificateFace({
  model,
  labels,
}: {
  model: GiftCertificateVisualModel;
  labels: {
    faceAmountLabel: string;
    purchaseLabel: string;
    balanceLabel: string;
    originalFaceLabel: string;
    usedLabel: string;
    issuerLabel: string;
    expiryLabel: string;
    numberLabel: string;
    numberUnavailable: string;
  };
}) {
  const titleLines = wrapGiftCertificateTitle(model.title);
  const showDiscount = giftMallShowsDiscountArrow(model.faceValue, model.purchasePrice);
  const isPlatform = model.kind === "PLATFORM";
  const heroFill = isPlatform ? "#004832" : "#1F2937";

  return (
    <div
      data-gift-cert-face="1"
      data-gift-certificate-face="1"
      data-gift-brand-logo={isPlatform ? "dibay-logo-mark" : "store"}
      data-gift-scope={model.kind}
      data-gift-value-mode={model.valueMode}
      className="relative w-full min-w-0 overflow-hidden"
      style={{
        aspectRatio: GIFT_CERT_ASPECT_RATIO,
        [/* SSOT */ "maxWidth" as string]: "100%",
      }}
    >
      <svg
        data-gift-cert-artwork="1"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={model.title || "Gift certificate"}
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id="gift-portrait-hero" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPlatform ? "#0A6B4A" : "#374151"} />
            <stop offset="100%" stopColor={heroFill} />
          </linearGradient>
          <clipPath id="gift-portrait-clip">
            <rect x="0" y="0" width={VB_W} height={VB_H} rx="28" ry="28" />
          </clipPath>
        </defs>

        <g clipPath="url(#gift-portrait-clip)">
          {/* Card chrome */}
          <rect x="0" y="0" width={VB_W} height={VB_H} fill="#FFFFFF" />

          {/* HERO */}
          <g data-gift-landmark="hero">
            <rect
              data-gift-cert-hero="1"
              x="0"
              y="0"
              width={VB_W}
              height={GIFT_PORTRAIT_LANDMARKS.heroBottomY}
              fill="url(#gift-portrait-hero)"
            />
            {model.heroImageSrc && !model.useStoreInitialFallback ? (
              <image
                data-gift-dibay-logo={isPlatform ? "1" : undefined}
                data-gift-store-hero={!isPlatform ? "1" : undefined}
                href={model.heroImageSrc}
                x={isPlatform ? 280 : 0}
                y={isPlatform ? 60 : 0}
                width={isPlatform ? 240 : VB_W}
                height={isPlatform ? 200 : GIFT_PORTRAIT_LANDMARKS.heroBottomY}
                preserveAspectRatio={isPlatform ? "xMidYMid meet" : "xMidYMid slice"}
              />
            ) : model.useStoreInitialFallback ? (
              <text
                x={VB_W / 2}
                y={180}
                fontSize={120}
                fill="#FFFFFF"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
                textAnchor="middle"
              >
                {model.storeInitial}
              </text>
            ) : null}
            {!model.heroImageSrc && model.usePlatformFallback ? (
              <text
                x={VB_W / 2}
                y={190}
                fontSize={56}
                fill="#FFFFFF"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
                textAnchor="middle"
                letterSpacing="4"
              >
                DIBAY
              </text>
            ) : null}
          </g>

          {/* Body */}
          <rect
            x="0"
            y={GIFT_PORTRAIT_LANDMARKS.heroBottomY}
            width={VB_W}
            height={VB_H - GIFT_PORTRAIT_LANDMARKS.heroBottomY}
            fill="#FFFFFF"
          />

          {/* Issuer badge */}
          <g data-gift-issuer-badge="1">
            <rect x="64" y="348" width={isPlatform ? 200 : 180} height="36" rx="8" fill="#ECFDF5" />
            <text
              x="74"
              y="372"
              fontSize="20"
              fill="#047857"
              fontFamily="system-ui,sans-serif"
              fontWeight={700}
            >
              {model.issuerBadge.length > 14 ? model.issuerBadge.slice(0, 13) + "…" : model.issuerBadge}
            </text>
          </g>

          {/* Product title — fixed wrap */}
          <g data-gift-landmark="title" data-gift-cert-title="1">
            {titleLines.map((line, i) => (
              <text
                key={i}
                x="64"
                y={GIFT_PORTRAIT_LANDMARKS.titleY + i * 44}
                fontSize="36"
                fill="#111827"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
              >
                {line}
              </text>
            ))}
          </g>

          {/* Financial block */}
          {model.valueMode === "mall" && model.faceValue != null ? (
            <g data-gift-landmark="amount" data-gift-value-block="mall">
              <text
                x="64"
                y="480"
                fontSize="22"
                fill="#6B7280"
                fontFamily="system-ui,sans-serif"
                fontWeight={600}
              >
                {labels.faceAmountLabel}
              </text>
              <text
                data-gift-face-amount="1"
                x="64"
                y={GIFT_PORTRAIT_LANDMARKS.amountY}
                fontSize="64"
                fill="#111827"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatMoneyPhp(model.faceValue)}
              </text>
              <g data-gift-landmark="price">
                {showDiscount && model.purchasePrice != null ? (
                  <>
                    <text
                      data-gift-face-strike="1"
                      x="64"
                      y={GIFT_PORTRAIT_LANDMARKS.priceY}
                      fontSize="28"
                      fill="#9CA3AF"
                      fontFamily="system-ui,sans-serif"
                      fontWeight={500}
                      textDecoration="line-through"
                    >
                      {formatMoneyPhp(model.faceValue)}
                    </text>
                    <text
                      x="250"
                      y={GIFT_PORTRAIT_LANDMARKS.priceY}
                      fontSize="28"
                      fill="#6B7280"
                      fontFamily="system-ui,sans-serif"
                    >
                      →
                    </text>
                    <text
                      data-gift-purchase-amount="1"
                      x="300"
                      y={GIFT_PORTRAIT_LANDMARKS.priceY}
                      fontSize="36"
                      fill="#047857"
                      fontFamily="system-ui,sans-serif"
                      fontWeight={700}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatMoneyPhp(model.purchasePrice)}
                    </text>
                    <text
                      x="64"
                      y={GIFT_PORTRAIT_LANDMARKS.priceY + 36}
                      fontSize="20"
                      fill="#6B7280"
                      fontFamily="system-ui,sans-serif"
                    >
                      {labels.purchaseLabel}
                    </text>
                  </>
                ) : model.purchasePrice != null ? (
                  <text
                    data-gift-purchase-amount="1"
                    x="64"
                    y={GIFT_PORTRAIT_LANDMARKS.priceY}
                    fontSize="28"
                    fill="#111827"
                    fontFamily="system-ui,sans-serif"
                    fontWeight={600}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {labels.purchaseLabel} {formatMoneyPhp(model.purchasePrice)}
                  </text>
                ) : null}
              </g>
            </g>
          ) : null}

          {model.valueMode === "wallet" && model.remainingBalance != null ? (
            <g data-gift-landmark="amount" data-gift-value-block="wallet">
              <text
                x="64"
                y="480"
                fontSize="22"
                fill="#6B7280"
                fontFamily="system-ui,sans-serif"
                fontWeight={600}
              >
                {labels.balanceLabel}
              </text>
              <text
                data-gift-remaining-amount="1"
                x="64"
                y={GIFT_PORTRAIT_LANDMARKS.amountY}
                fontSize="64"
                fill="#111827"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatMoneyPhp(model.remainingBalance)}
              </text>
              {model.faceValue != null ? (
                <text
                  x="64"
                  y={GIFT_PORTRAIT_LANDMARKS.priceY}
                  fontSize="24"
                  fill="#6B7280"
                  fontFamily="system-ui,sans-serif"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {labels.originalFaceLabel} {formatMoneyPhp(model.faceValue)}
                </text>
              ) : null}
            </g>
          ) : null}

          {model.valueMode === "used" ? (
            <g data-gift-landmark="amount" data-gift-value-block="used">
              <text
                x="64"
                y={GIFT_PORTRAIT_LANDMARKS.amountY}
                fontSize="40"
                fill="#6B7280"
                fontFamily="system-ui,sans-serif"
                fontWeight={700}
              >
                {labels.usedLabel}
              </text>
              {model.faceValue != null ? (
                <text
                  x="64"
                  y={GIFT_PORTRAIT_LANDMARKS.priceY}
                  fontSize="28"
                  fill="#9CA3AF"
                  fontFamily="system-ui,sans-serif"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatMoneyPhp(model.faceValue)}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Perforation / ticket notch */}
          <g data-gift-landmark="perforation" data-gift-cert-perforation="1">
            <circle cx="0" cy={GIFT_PORTRAIT_LANDMARKS.perforationY} r="18" fill="#F3F4F6" />
            <circle cx={VB_W} cy={GIFT_PORTRAIT_LANDMARKS.perforationY} r="18" fill="#F3F4F6" />
            <line
              x1="40"
              y1={GIFT_PORTRAIT_LANDMARKS.perforationY}
              x2={VB_W - 40}
              y2={GIFT_PORTRAIT_LANDMARKS.perforationY}
              stroke="#D1D5DB"
              strokeWidth="2"
              strokeDasharray="8 10"
            />
          </g>

          {/* Meta */}
          <MetaRow
            label={labels.issuerLabel}
            value={model.issuerName || "—"}
            y={GIFT_PORTRAIT_LANDMARKS.issuerY}
            dataAttr="issuer"
          />
          {model.expirationDisplay ? (
            <MetaRow
              label={labels.expiryLabel}
              value={model.expirationDisplay}
              y={GIFT_PORTRAIT_LANDMARKS.expiryY}
              dataAttr="expiry"
            />
          ) : null}
          <MetaRow
            label={labels.numberLabel}
            value={model.certificateDisplayNumber?.trim() || labels.numberUnavailable}
            y={GIFT_PORTRAIT_LANDMARKS.numberY}
            dataAttr="number"
          />

          {/* Border */}
          <rect
            x="2"
            y="2"
            width={VB_W - 4}
            height={VB_H - 4}
            rx="26"
            ry="26"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="3"
          />
        </g>
      </svg>
    </div>
  );
}

/** @deprecated Value mode type — use GiftCertificateVisualModel.valueMode */
export type GiftCertificateValueMode = "mall" | "wallet" | "used";
