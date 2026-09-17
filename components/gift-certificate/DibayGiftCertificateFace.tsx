"use client";

/**
 * Canonical DIBAY gift-certificate face.
 * RESET geometry: one 800×1120 SVG, scaled without surface-specific layout branches.
 */

import { useId } from "react";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import type { GiftCertificateVisualModel } from "@/lib/gift-certificate/gift-certificate-visual-model";
import { giftShowsDiscountStrike } from "@/lib/gift-certificate/gift-certificate-visual-model";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { formatMoneyPhp } from "@/lib/utils/format";

const BRAND = "#0B421A";
const BRAND_MID = "#0F5A24";
const BRAND_SOFT = "#E8F2EB";
const BRAND_SOFT_STROKE = "#B7D0C0";
const GOLD = "#D4AF37";
const INK = "#202622";
const MUTED = "#6F7773";
const MUTED_PRICE = "#8B9490";
const LINE = "#D8DEDA";
const BORDER = "#D9E2DC";

const VB_W = GIFT_CERT_COORD_WIDTH;
const VB_H = GIFT_CERT_COORD_HEIGHT;
const TICKET = { x: 10, y: 10, w: 780, h: 1100, rx: 30 } as const;
const PAD_L = 64;
const PAD_R = 736;
const PLATFORM_LOGO_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

/**
 * Certificate composition landmarks (800×1120) — one physical gift-certificate sheet.
 * Redesign (one-time contract): no customer remaining-balance row.
 */
export const GIFT_PORTRAIT_LANDMARKS = {
  heroBottomY: 292,
  badgeY: 322,
  titleY: 412,
  amountLabelY: 512,
  amountY: 598,
  priceDividerY: 628,
  priceY: 708,
  perforationY: 768,
  issuerY: 836,
  expiryY: 904,
  /** @deprecated use numberLabelY */
  numberY: 952,
  numberLabelY: 952,
  numberValueY: 1008,
  footerY: 1070,
} as const;

/**
 * Typography scale @ sm=220 (scale 0.275):
 * title ≥16px, amount ~22.5px (readable, not dominant), purchase ≥14px, meta ≥12px.
 */
export const GIFT_PORTRAIT_TYPE = {
  badge: 41,
  title: 59,
  titleLine: 62,
  amountLabel: 34,
  amountValue: 82,
  originalPrice: 48,
  arrow: 44,
  purchasePrice: 52,
  purchaseLabel: 34,
  metaLabel: 44,
  metaValue: 44,
  footBrand: 24,
  heroWordmark: 46,
  heroSubtitle: 24,
  heroBadge: 40,
  statusChip: 34,
} as const;

const ORIGINAL_PRICE_SLOT = { x: PAD_L, width: 218 } as const;
const STRIKE_STROKE = 5;

export type GiftCertificateFaceLabels = {
  faceAmountLabel: string;
  purchaseLabel: string;
  balanceLabel: string;
  usedLabel: string;
  issuerLabel: string;
  expiryLabel: string;
  numberLabel: string;
  numberUnavailable: string;
};

/** Deterministic rendered width estimate for the explicit original-price strike. */
export function estimateGiftMoneySvgWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === "," || char === "." || char === " ") width += fontSize * 0.32;
    else if (char === "₱" || char === "$" || char === "€") width += fontSize * 0.72;
    else width += fontSize * 0.6;
  }
  return Math.min(
    ORIGINAL_PRICE_SLOT.width,
    Math.max(fontSize * 1.2, Math.round(width))
  );
}

function TicketHero({
  model,
  uid,
}: {
  model: GiftCertificateVisualModel;
  uid: string;
}) {
  const isPlatform = model.kind === "PLATFORM";
  const heroGradientId = `${uid}-hero-gradient`;
  const foilId = `${uid}-foil`;
  const identityClipId = `${uid}-identity-clip`;
  const identity = { x: 286, y: 48, w: 228, h: 148 } as const;
  const used = model.valueMode === "used";

  return (
    <g data-gift-landmark="hero" data-gift-cert-hero="1" data-gift-cert-identity="ticket">
      <defs>
        <linearGradient id={heroGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={used ? "#3A4A3E" : BRAND_MID} />
          <stop offset="55%" stopColor={used ? "#2C3830" : BRAND} />
          <stop offset="100%" stopColor={used ? "#24302A" : "#083618"} />
        </linearGradient>
        <linearGradient id={foilId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#C9A227" stopOpacity={0.35} />
          <stop offset="50%" stopColor="#F0D78C" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#C9A227" stopOpacity={0.35} />
        </linearGradient>
        <clipPath id={identityClipId}>
          <rect
            x={identity.x}
            y={identity.y}
            width={identity.w}
            height={identity.h}
            rx={18}
          />
        </clipPath>
      </defs>

      <rect
        x={TICKET.x}
        y={TICKET.y}
        width={TICKET.w}
        height={GIFT_PORTRAIT_LANDMARKS.heroBottomY - TICKET.y}
        fill={`url(#${heroGradientId})`}
      />
      <rect
        x={TICKET.x + 28}
        y={GIFT_PORTRAIT_LANDMARKS.heroBottomY - 10}
        width={TICKET.w - 56}
        height={4}
        rx={2}
        fill={`url(#${foilId})`}
        data-gift-cert-foil="1"
      />

      <g data-gift-hero-identity-slot="1">
        {isPlatform ? (
          <image
            data-gift-dibay-logo="1"
            href={PLATFORM_LOGO_SRC}
            x={identity.x}
            y={identity.y}
            width={identity.w}
            height={identity.h}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : model.heroImageSrc && !model.useStoreInitialFallback ? (
          <g clipPath={`url(#${identityClipId})`}>
            <rect
              x={identity.x}
              y={identity.y}
              width={identity.w}
              height={identity.h}
              rx={18}
              fill="#FFFFFF"
              opacity={0.14}
            />
            <image
              data-gift-store-hero="1"
              href={model.heroImageSrc}
              x={identity.x}
              y={identity.y}
              width={identity.w}
              height={identity.h}
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        ) : (
          <text
            x={400}
            y={148}
            textAnchor="middle"
            fontSize={96}
            fontWeight={800}
            fill="#FFFFFF"
            fontFamily="system-ui,sans-serif"
          >
            {model.storeInitial}
          </text>
        )}
      </g>

      <text
        x={400}
        y={228}
        textAnchor="middle"
        fontSize={GIFT_PORTRAIT_TYPE.heroWordmark}
        fontWeight={800}
        fill="#FFFFFF"
        fontFamily="system-ui,sans-serif"
        letterSpacing="2"
      >
        {isPlatform ? "DIBAY" : model.issuerName}
      </text>
      <text
        x={400}
        y={262}
        textAnchor="middle"
        fontSize={GIFT_PORTRAIT_TYPE.heroSubtitle}
        fontWeight={700}
        fill={GOLD}
        fontFamily="system-ui,sans-serif"
        letterSpacing="3"
      >
        GIFT CERTIFICATE
      </text>
    </g>
  );
}

function AmountBlock({
  model,
  labels,
}: {
  model: GiftCertificateVisualModel;
  labels: GiftCertificateFaceLabels;
}) {
  if (model.valueMode === "used") {
    return (
      <g data-gift-landmark="amount" data-gift-value-block="used">
        <text
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.amountLabelY}
          fontSize={GIFT_PORTRAIT_TYPE.amountLabel}
          fill={MUTED}
          fontFamily="system-ui,sans-serif"
          fontWeight={700}
        >
          {labels.usedLabel}
        </text>
        {model.faceValue != null ? (
          <text
            data-gift-face-amount="1"
            x={PAD_L}
            y={GIFT_PORTRAIT_LANDMARKS.amountY}
            fontSize={GIFT_PORTRAIT_TYPE.amountValue}
            fill={MUTED_PRICE}
            fontFamily="system-ui,sans-serif"
            fontWeight={800}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatMoneyPhp(model.faceValue)}
          </text>
        ) : null}
        {model.purchasePrice != null ? (
          <text
            data-gift-purchase-amount="1"
            x={PAD_L}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.purchasePrice}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
            fontWeight={600}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {labels.purchaseLabel} {formatMoneyPhp(model.purchasePrice)}
          </text>
        ) : null}
      </g>
    );
  }

  if (model.faceValue == null) return null;

  const faceValue = formatMoneyPhp(model.faceValue);
  const purchasePrice =
    model.purchasePrice == null ? null : formatMoneyPhp(model.purchasePrice);
  const discounted = giftShowsDiscountStrike(model.faceValue, model.purchasePrice);
  const strikeWidth = estimateGiftMoneySvgWidth(faceValue, GIFT_PORTRAIT_TYPE.originalPrice);
  const strikeY =
    GIFT_PORTRAIT_LANDMARKS.priceY - GIFT_PORTRAIT_TYPE.originalPrice * 0.32;
  const purchaseLabelX = ORIGINAL_PRICE_SLOT.x + strikeWidth + 48;
  const purchaseValueX =
    purchaseLabelX +
    estimateGiftMoneySvgWidth(`${labels.purchaseLabel} `, GIFT_PORTRAIT_TYPE.purchaseLabel);

  return (
    <g
      data-gift-landmark="amount"
      data-gift-value-block={model.valueMode === "mall" ? "mall" : "wallet"}
      data-gift-money-ssot="one-time"
    >
      <text
        x={PAD_L}
        y={GIFT_PORTRAIT_LANDMARKS.amountLabelY}
        fontSize={GIFT_PORTRAIT_TYPE.amountLabel}
        fill={MUTED}
        fontFamily="system-ui,sans-serif"
        fontWeight={600}
      >
        {labels.faceAmountLabel}
      </text>
      <text
        data-gift-face-amount="1"
        x={PAD_L}
        y={GIFT_PORTRAIT_LANDMARKS.amountY}
        fontSize={GIFT_PORTRAIT_TYPE.amountValue}
        fill={BRAND}
        fontFamily="system-ui,sans-serif"
        fontWeight={800}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {faceValue}
      </text>
      <line
        x1={PAD_L}
        x2={PAD_R}
        y1={GIFT_PORTRAIT_LANDMARKS.priceDividerY}
        y2={GIFT_PORTRAIT_LANDMARKS.priceDividerY}
        stroke={LINE}
        strokeWidth={1.5}
      />

      {discounted && purchasePrice ? (
        <g data-gift-landmark="price" data-gift-discount-strike="1">
          <text
            data-gift-face-strike="1"
            x={ORIGINAL_PRICE_SLOT.x}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.originalPrice}
            fill={MUTED_PRICE}
            fontFamily="system-ui,sans-serif"
            fontWeight={500}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {faceValue}
          </text>
          <line
            data-gift-face-strike-line="1"
            x1={ORIGINAL_PRICE_SLOT.x}
            x2={ORIGINAL_PRICE_SLOT.x + strikeWidth}
            y1={strikeY}
            y2={strikeY}
            stroke={MUTED_PRICE}
            strokeWidth={STRIKE_STROKE}
            strokeLinecap="round"
          />
          <text
            x={ORIGINAL_PRICE_SLOT.x + strikeWidth + 18}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.arrow}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
          >
            →
          </text>
          <text
            x={purchaseLabelX}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.purchaseLabel}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
            fontWeight={600}
          >
            {labels.purchaseLabel}
          </text>
          <text
            data-gift-purchase-amount="1"
            x={purchaseValueX}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.purchasePrice}
            fill={BRAND}
            fontFamily="system-ui,sans-serif"
            fontWeight={800}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {purchasePrice}
          </text>
        </g>
      ) : purchasePrice ? (
        <text
          data-gift-purchase-amount="1"
          data-gift-discount-strike="0"
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.priceY}
          fontSize={GIFT_PORTRAIT_TYPE.purchasePrice}
          fill={INK}
          fontFamily="system-ui,sans-serif"
          fontWeight={700}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {labels.purchaseLabel} {purchasePrice}
        </text>
      ) : null}
    </g>
  );
}

function MetaIcon({
  kind,
  y,
}: {
  kind: "issuer" | "expiry" | "number";
  y: number;
}) {
  const x = 70;
  const cy = y - 14;
  if (kind === "issuer") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={3} aria-hidden>
        <path d={`M ${x} ${cy - 10} L ${x + 14} ${cy - 20} L ${x + 28} ${cy - 10}`} />
        <rect x={x + 2} y={cy - 10} width={24} height={25} rx={2} />
      </g>
    );
  }
  if (kind === "expiry") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={3} aria-hidden>
        <rect x={x + 1} y={cy - 16} width={27} height={27} rx={4} />
        <path d={`M ${x + 1} ${cy - 7} H ${x + 28}`} />
        <path d={`M ${x + 8} ${cy - 21} V ${cy - 12} M ${x + 21} ${cy - 21} V ${cy - 12}`} />
      </g>
    );
  }
  return (
    <g fill="none" stroke={MUTED} strokeWidth={3} aria-hidden>
      <path d={`M ${x + 2} ${cy - 17} H ${x + 26} L ${x + 23} ${cy + 13} H ${x + 5} Z`} />
      <circle cx={x + 14} cy={cy - 5} r={3} fill={MUTED} stroke="none" />
    </g>
  );
}

function NumberMetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <g data-gift-landmark="number" data-gift-cert-number-row="stacked">
      <MetaIcon kind="number" y={GIFT_PORTRAIT_LANDMARKS.numberLabelY} />
      <text
        x={112}
        y={GIFT_PORTRAIT_LANDMARKS.numberLabelY}
        fontSize={GIFT_PORTRAIT_TYPE.metaLabel}
        fill={MUTED}
        fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
      <text
        data-gift-public-number="1"
        x={112}
        y={GIFT_PORTRAIT_LANDMARKS.numberValueY}
        fontSize={GIFT_PORTRAIT_TYPE.metaValue}
        fill={INK}
        fontFamily="system-ui,sans-serif"
        fontWeight={650}
      >
        {value}
      </text>
    </g>
  );
}

function MetaRow({
  kind,
  label,
  value,
  y,
}: {
  kind: "issuer" | "expiry" | "number";
  label: string;
  value: string;
  y: number;
}) {
  return (
    <g data-gift-landmark={kind}>
      <MetaIcon kind={kind} y={y} />
      <text
        x={112}
        y={y}
        fontSize={GIFT_PORTRAIT_TYPE.metaLabel}
        fill={MUTED}
        fontFamily="system-ui,sans-serif"
      >
        {label}
      </text>
      <text
        x={PAD_R}
        y={y}
        fontSize={GIFT_PORTRAIT_TYPE.metaValue}
        fill={INK}
        fontFamily="system-ui,sans-serif"
        fontWeight={650}
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
  labels: GiftCertificateFaceLabels;
}) {
  const reactId = useId().replace(/:/g, "");
  const uid = `gcf-${reactId}`;
  const maskId = `${uid}-ticket-mask`;
  const isPlatform = model.kind === "PLATFORM";
  const titleLines = wrapGiftCertificateTitle(model.title, {
    maxCharsPerLine: 18,
    maxLines: 2,
  });
  const numberValue =
    model.certificateDisplayNumber?.trim() || labels.numberUnavailable;
  const expiryValue = model.expirationDisplay?.trim() || "";

  return (
    <div
      data-gift-cert-face="1"
      data-gift-certificate-face="1"
      data-gift-brand-logo={isPlatform ? "dibay-logo-mark" : "store"}
      data-gift-scope={model.kind}
      data-gift-value-mode={model.valueMode}
      className="relative w-full min-w-0 overflow-hidden"
      style={{ aspectRatio: GIFT_CERT_ASPECT_RATIO, maxWidth: "100%" }}
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
          <mask id={maskId}>
            <rect
              x={TICKET.x}
              y={TICKET.y}
              width={TICKET.w}
              height={TICKET.h}
              rx={TICKET.rx}
              fill="#FFFFFF"
            />
            <circle
              cx={TICKET.x}
              cy={GIFT_PORTRAIT_LANDMARKS.perforationY}
              r={18}
              fill="#000000"
            />
            <circle
              cx={TICKET.x + TICKET.w}
              cy={GIFT_PORTRAIT_LANDMARKS.perforationY}
              r={18}
              fill="#000000"
            />
          </mask>
        </defs>

        <g mask={`url(#${maskId})`}>
          <rect
            x={TICKET.x}
            y={TICKET.y}
            width={TICKET.w}
            height={TICKET.h}
            rx={TICKET.rx}
            fill="#FAFCFB"
          />
          <TicketHero model={model} uid={uid} />

          <g data-gift-issuer-badge="1">
            <rect
              x={PAD_L}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY}
              width={Math.min(64 + model.issuerBadge.length * 20, 290)}
              height={52}
              rx={26}
              fill={BRAND_SOFT}
              stroke={BRAND_SOFT_STROKE}
              strokeWidth={1.5}
            />
            <text
              x={PAD_L + 20}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY + 39}
              fontSize={GIFT_PORTRAIT_TYPE.badge}
              fontWeight={700}
              fill={BRAND}
              fontFamily="system-ui,sans-serif"
            >
              {model.issuerBadge.length > 14
                ? `${model.issuerBadge.slice(0, 13)}…`
                : model.issuerBadge}
            </text>
          </g>

          <g
            data-gift-status-chip="1"
            data-gift-availability={model.valueMode === "used" ? "USED" : "AVAILABLE"}
          >
            <rect
              x={PAD_R - 196}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY}
              width={196}
              height={52}
              rx={26}
              fill={model.valueMode === "used" ? "#F1F3F2" : BRAND_SOFT}
              stroke={model.valueMode === "used" ? LINE : BRAND_SOFT_STROKE}
              strokeWidth={1.5}
            />
            <text
              x={PAD_R - 98}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY + 39}
              textAnchor="middle"
              fontSize={GIFT_PORTRAIT_TYPE.statusChip}
              fontWeight={750}
              fill={model.valueMode === "used" ? MUTED : BRAND}
              fontFamily="system-ui,sans-serif"
            >
              {model.valueMode === "used" ? "USED" : "AVAILABLE"}
            </text>
          </g>

          <g data-gift-landmark="title" data-gift-cert-title="1">
            {titleLines.map((line, index) => (
              <text
                key={`${line}-${index}`}
                x={PAD_L}
                y={
                  GIFT_PORTRAIT_LANDMARKS.titleY +
                  index * GIFT_PORTRAIT_TYPE.titleLine
                }
                fontSize={GIFT_PORTRAIT_TYPE.title}
                fontWeight={750}
                fill={INK}
                fontFamily="system-ui,sans-serif"
              >
                {line}
              </text>
            ))}
          </g>

          <AmountBlock model={model} labels={labels} />

          <g data-gift-landmark="perforation" data-gift-cert-perforation="1">
            <line
              x1={48}
              x2={752}
              y1={GIFT_PORTRAIT_LANDMARKS.perforationY}
              y2={GIFT_PORTRAIT_LANDMARKS.perforationY}
              stroke={LINE}
              strokeWidth={2}
              strokeDasharray="10 10"
            />
          </g>

          <MetaRow
            kind="issuer"
            label={labels.issuerLabel}
            value={model.issuerName}
            y={GIFT_PORTRAIT_LANDMARKS.issuerY}
          />
          <MetaRow
            kind="expiry"
            label={labels.expiryLabel}
            value={expiryValue}
            y={GIFT_PORTRAIT_LANDMARKS.expiryY}
          />
          <NumberMetaRow label={labels.numberLabel} value={numberValue} />


          {model.valueMode === "used" ? (
            <g data-gift-used-stamp="1" pointerEvents="none" opacity={0.18}>
              <text
                x={400}
                y={620}
                textAnchor="middle"
                fontSize={120}
                fontWeight={900}
                fill={MUTED}
                fontFamily="system-ui,sans-serif"
                transform="rotate(-18 400 620)"
                letterSpacing="8"
              >
                USED
              </text>
            </g>
          ) : null}
          <text
            x={400}
            y={GIFT_PORTRAIT_LANDMARKS.footerY}
            textAnchor="middle"
            fontSize={GIFT_PORTRAIT_TYPE.footBrand}
            fontWeight={650}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
            letterSpacing="2"
            data-gift-foot-brand="1"
          >
            {isPlatform ? "DIBAY GIFT CERTIFICATE" : "Powered by DIBAY"}
          </text>
        </g>

        <path
          d={`
            M ${TICKET.x + TICKET.rx} ${TICKET.y}
            H ${TICKET.x + TICKET.w - TICKET.rx}
            Q ${TICKET.x + TICKET.w} ${TICKET.y} ${TICKET.x + TICKET.w} ${TICKET.y + TICKET.rx}
            V ${GIFT_PORTRAIT_LANDMARKS.perforationY - 18}
            C ${TICKET.x + TICKET.w - 10} ${GIFT_PORTRAIT_LANDMARKS.perforationY - 18},
              ${TICKET.x + TICKET.w - 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY - 10},
              ${TICKET.x + TICKET.w - 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY}
            C ${TICKET.x + TICKET.w - 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY + 10},
              ${TICKET.x + TICKET.w - 10} ${GIFT_PORTRAIT_LANDMARKS.perforationY + 18},
              ${TICKET.x + TICKET.w} ${GIFT_PORTRAIT_LANDMARKS.perforationY + 18}
            V ${TICKET.y + TICKET.h - TICKET.rx}
            Q ${TICKET.x + TICKET.w} ${TICKET.y + TICKET.h} ${TICKET.x + TICKET.w - TICKET.rx} ${TICKET.y + TICKET.h}
            H ${TICKET.x + TICKET.rx}
            Q ${TICKET.x} ${TICKET.y + TICKET.h} ${TICKET.x} ${TICKET.y + TICKET.h - TICKET.rx}
            V ${GIFT_PORTRAIT_LANDMARKS.perforationY + 18}
            C ${TICKET.x + 10} ${GIFT_PORTRAIT_LANDMARKS.perforationY + 18},
              ${TICKET.x + 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY + 10},
              ${TICKET.x + 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY}
            C ${TICKET.x + 18} ${GIFT_PORTRAIT_LANDMARKS.perforationY - 10},
              ${TICKET.x + 10} ${GIFT_PORTRAIT_LANDMARKS.perforationY - 18},
              ${TICKET.x} ${GIFT_PORTRAIT_LANDMARKS.perforationY - 18}
            V ${TICKET.y + TICKET.rx}
            Q ${TICKET.x} ${TICKET.y} ${TICKET.x + TICKET.rx} ${TICKET.y}
            Z
          `}
          fill="none"
          stroke={BORDER}
          strokeWidth={2}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}

/** @deprecated Value mode type — use GiftCertificateVisualModel.valueMode */
export type GiftCertificateValueMode = "mall" | "wallet" | "used";
