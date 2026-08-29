"use client";

/**
 * Canonical DIBAY gift certificate portrait face — ONE SVG, 800×2280 user units.
 * Geometry is measured from the approved 296×834px face reference.
 * SAME CERTIFICATE × SCALE. No container-query / viewport internals. No decorative redeem bars.
 */

import { useId } from "react";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import type { GiftCertificateVisualModel } from "@/lib/gift-certificate/gift-certificate-visual-model";
import { giftMallShowsDiscountArrow } from "@/lib/gift-certificate/gift-certificate-visual-model";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { formatMoneyPhp } from "@/lib/utils/format";

/** Canonical brand green from design-tokens `--dibay-green`. */
const BRAND = "#0B421A";
const BRAND_MID = "#0F5A24";
const BRAND_SOFT = "#E8F2EB";
const BRAND_SOFT_STROKE = "#B7D0C0";
const GOLD = "#D4AF37";
const INK = "#202622";
const MUTED = "#7A827E";
const MUTED_PRICE = "#8B9490";
const ARROW = "#6F7773";
const LINE = "#D8DEDA";
const BORDER = "#D9E2DC";

/** Landmark Y — measured against the approved long-ticket reference. */
export const GIFT_PORTRAIT_LANDMARKS = {
  heroBottomY: 640,
  badgeY: 685,
  titleY: 805,
  amountLabelY: 940,
  amountY: 1080,
  priceDividerY: 1135,
  priceY: 1240,
  perforationY: 1405,
  issuerY: 1530,
  expiryY: 1640,
  numberY: 1750,
  footerY: 2027,
  giftableY: 2080,
} as const;

/** Typography measured for a 296–340px rendered card. */
export const GIFT_PORTRAIT_TYPE = {
  badge: 34,
  title: 56,
  titleLine: 68,
  amountLabel: 36,
  amountValue: 112,
  originalPrice: 40,
  arrow: 42,
  purchasePrice: 50,
  priceSubLabel: 30,
  metaLabel: 37,
  metaValue: 38,
  footBrand: 27,
  heroWordmark: 52,
  heroSubtitle: 28,
  heroBadge: 30,
} as const;

const VB_W = GIFT_CERT_COORD_WIDTH;
const VB_H = GIFT_CERT_COORD_HEIGHT;
const TICKET = { x: 12, y: 12, w: 776, h: 2256, rx: 34 } as const;
const PAD_L = 64;
const PAD_R = 736;

/** Original-price strike slot (deterministic — no hardcoded ₱1,000-only width). */
const ORIGINAL_PRICE_SLOT = { x: PAD_L, width: 266 } as const;
const STRIKE_STROKE = 5.5;

const PLATFORM_LOGO_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

export type GiftCertificateFaceLabels = {
  faceAmountLabel: string;
  purchaseLabel: string;
  balanceLabel: string;
  originalFaceLabel: string;
  usedLabel: string;
  issuerLabel: string;
  expiryLabel: string;
  numberLabel: string;
  numberUnavailable: string;
  giftableTitle: string;
  giftableHint: string;
};

/** Deterministic money string width estimate in SVG user units (tabular-ish). */
export function estimateGiftMoneySvgWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === "," || ch === "." || ch === " ") w += fontSize * 0.32;
    else if (ch === "₱" || ch === "$" || ch === "€") w += fontSize * 0.72;
    else w += fontSize * 0.6;
  }
  return Math.min(ORIGINAL_PRICE_SLOT.width, Math.max(fontSize * 1.2, Math.round(w)));
}

function MetaIcon({ kind, y }: { kind: "issuer" | "expiry" | "number"; y: number }) {
  const size = 26;
  const cx = PAD_L + size / 2;
  const cy = y - 8;
  if (kind === "issuer") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={2} aria-hidden>
        <path
          d={`M ${cx - 10} ${cy + 10} L ${cx} ${cy - 4} L ${cx + 10} ${cy + 10} V ${cy + 14} H ${cx - 10} Z`}
        />
        <path d={`M ${cx - 3} ${cy + 14} V ${cy + 4} H ${cx + 3} V ${cy + 14}`} />
      </g>
    );
  }
  if (kind === "expiry") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={2} aria-hidden>
        <rect x={cx - 11} y={cy - 8} width={22} height={20} rx={3} />
        <path d={`M ${cx - 11} ${cy - 1} H ${cx + 11}`} />
        <path d={`M ${cx - 5} ${cy - 12} V ${cy - 5}`} />
        <path d={`M ${cx + 5} ${cy - 12} V ${cy - 5}`} />
      </g>
    );
  }
  return (
    <g fill="none" stroke={MUTED} strokeWidth={2} aria-hidden>
      <path d={`M ${cx - 9} ${cy - 6} H ${cx + 9} L ${cx + 6} ${cy + 12} H ${cx - 6} Z`} />
      <circle cx={cx} cy={cy + 2} r={2} fill={MUTED} stroke="none" />
    </g>
  );
}

function MetaRow({
  label,
  value,
  y,
  kind,
  dataAttr,
}: {
  label: string;
  value: string;
  y: number;
  kind: "issuer" | "expiry" | "number";
  dataAttr?: string;
}) {
  return (
    <g data-gift-landmark={dataAttr}>
      <MetaIcon kind={kind} y={y} />
      <text
        x={PAD_L + 36}
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
        fontWeight={600}
        textAnchor="end"
      >
        {value.length > 22 ? `${value.slice(0, 21)}…` : value}
      </text>
    </g>
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
  const heroGrad = `${uid}-hero`;
  const heroClip = `${uid}-hero-clip`;
  const logo = { x: 252, y: 178, w: 296, h: 220 } as const;

  return (
    <g data-gift-landmark="hero" data-gift-cert-hero="1">
      <defs>
        <linearGradient id={heroGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPlatform ? BRAND_MID : "#374151"} />
          <stop offset="100%" stopColor={isPlatform ? BRAND : "#1F2937"} />
        </linearGradient>
        <clipPath id={heroClip}>
          <path
            d={`
              M ${TICKET.x} ${TICKET.y + TICKET.rx}
              Q ${TICKET.x} ${TICKET.y} ${TICKET.x + TICKET.rx} ${TICKET.y}
              L ${TICKET.x + TICKET.w - TICKET.rx} ${TICKET.y}
              Q ${TICKET.x + TICKET.w} ${TICKET.y} ${TICKET.x + TICKET.w} ${TICKET.y + TICKET.rx}
              L ${TICKET.x + TICKET.w} 575
              C 650 665, 500 670, 400 630
              C 250 575, 150 575, ${TICKET.x} 650
              Z
            `}
          />
        </clipPath>
      </defs>

      <path
        fill={`url(#${heroGrad})`}
        d={`
          M ${TICKET.x} ${TICKET.y + TICKET.rx}
          Q ${TICKET.x} ${TICKET.y} ${TICKET.x + TICKET.rx} ${TICKET.y}
          L ${TICKET.x + TICKET.w - TICKET.rx} ${TICKET.y}
          Q ${TICKET.x + TICKET.w} ${TICKET.y} ${TICKET.x + TICKET.w} ${TICKET.y + TICKET.rx}
          L ${TICKET.x + TICKET.w} 575
          C 650 665, 500 670, 400 630
          C 250 575, 150 575, ${TICKET.x} 650
          Z
        `}
      />

      <g clipPath={`url(#${heroClip})`} opacity={0.18} aria-hidden>
        {[0, 24, 48].map((off) => (
          <path
            key={off}
            d={`M ${TICKET.x} ${470 + off} C 200 ${430 + off}, 400 ${520 + off}, 788 ${445 + off}`}
            fill="none"
            stroke="#9CCDB5"
            strokeWidth={1.2}
          />
        ))}
      </g>

      {isPlatform ? (
        <>
          <image
            data-gift-dibay-logo="1"
            href={PLATFORM_LOGO_SRC}
            x={logo.x}
            y={logo.y}
            width={logo.w}
            height={logo.h}
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            x={400}
            y={465}
            textAnchor="middle"
            fontSize={GIFT_PORTRAIT_TYPE.heroWordmark}
            fontWeight={800}
            fill="#FFFFFF"
            fontFamily="system-ui,sans-serif"
            letterSpacing="2"
          >
            DIBAY
          </text>
          <text
            x={400}
            y={518}
            textAnchor="middle"
            fontSize={GIFT_PORTRAIT_TYPE.heroSubtitle}
            fontWeight={600}
            fill={GOLD}
            fontFamily="system-ui,sans-serif"
            letterSpacing="3"
          >
            GIFT CERTIFICATE
          </text>
        </>
      ) : (
        <g clipPath={`url(#${heroClip})`}>
          {model.heroImageSrc && !model.useStoreInitialFallback ? (
            <>
              <image
                data-gift-store-hero="1"
                href={model.heroImageSrc}
                x={TICKET.x}
                y={TICKET.y}
                width={TICKET.w}
                height={640}
                preserveAspectRatio="xMidYMid slice"
              />
              <rect
                x={TICKET.x}
                y={TICKET.y}
                width={TICKET.w}
                height={640}
                fill="#000000"
                opacity={0.28}
              />
            </>
          ) : (
            <text
              x={400}
              y={360}
              textAnchor="middle"
              fontSize={180}
              fontWeight={800}
              fill="#FFFFFF"
              fontFamily="system-ui,sans-serif"
            >
              {model.storeInitial}
            </text>
          )}
          {model.issuerName ? (
            <text
              x={400}
              y={565}
              textAnchor="middle"
              fontSize={26}
              fontWeight={700}
              fill="#FFFFFF"
              fontFamily="system-ui,sans-serif"
            >
              {model.issuerName.length > 28 ? `${model.issuerName.slice(0, 27)}…` : model.issuerName}
            </text>
          ) : null}
        </g>
      )}

      <g data-gift-hero-badge="1">
        <rect x={548} y={124} width={200} height={54} rx={27} fill="rgba(255,255,255,0.18)" />
        <text
          x={648}
          y={160}
          textAnchor="middle"
          fontSize={GIFT_PORTRAIT_TYPE.heroBadge}
          fontWeight={700}
          fill="#FFFFFF"
          fontFamily="system-ui,sans-serif"
        >
          {model.issuerBadge.length > 12 ? `${model.issuerBadge.slice(0, 11)}…` : model.issuerBadge}
        </text>
      </g>
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
  const showDiscount = giftMallShowsDiscountArrow(model.faceValue, model.purchasePrice);

  if (model.valueMode === "mall" && model.faceValue != null) {
    const faceStr = formatMoneyPhp(model.faceValue);
    const purchaseStr = model.purchasePrice != null ? formatMoneyPhp(model.purchasePrice) : null;
    const strikeW = estimateGiftMoneySvgWidth(faceStr, GIFT_PORTRAIT_TYPE.originalPrice);
    const strikeY = GIFT_PORTRAIT_LANDMARKS.priceY - GIFT_PORTRAIT_TYPE.originalPrice * 0.32;
    const arrowX = ORIGINAL_PRICE_SLOT.x + ORIGINAL_PRICE_SLOT.width + 10;
    const purchaseX = arrowX + 90;

    return (
      <g data-gift-landmark="amount" data-gift-value-block="mall">
        <text
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.amountLabelY}
          fontSize={GIFT_PORTRAIT_TYPE.amountLabel}
          fill="#303833"
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
          {faceStr}
        </text>

        {/* thin divider above purchase row — matches design reference */}
        <line
          x1={PAD_L}
          x2={PAD_R}
          y1={GIFT_PORTRAIT_LANDMARKS.priceDividerY}
          y2={GIFT_PORTRAIT_LANDMARKS.priceDividerY}
          stroke={LINE}
          strokeWidth={1.5}
        />

        <g data-gift-landmark="price">
          {showDiscount && purchaseStr ? (
            <>
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
                {faceStr}
              </text>
              <line
                data-gift-face-strike-line="1"
                x1={ORIGINAL_PRICE_SLOT.x}
                x2={ORIGINAL_PRICE_SLOT.x + strikeW}
                y1={strikeY}
                y2={strikeY}
                stroke={MUTED_PRICE}
                strokeWidth={STRIKE_STROKE}
                strokeLinecap="round"
              />
              <text
                x={arrowX}
                y={GIFT_PORTRAIT_LANDMARKS.priceY}
                fontSize={GIFT_PORTRAIT_TYPE.arrow}
                fill={ARROW}
                fontFamily="system-ui,sans-serif"
              >
                →
              </text>
              <text
                data-gift-purchase-amount="1"
                x={purchaseX}
                y={GIFT_PORTRAIT_LANDMARKS.priceY}
                fontSize={GIFT_PORTRAIT_TYPE.purchasePrice}
                fill={BRAND}
                fontFamily="system-ui,sans-serif"
                fontWeight={800}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {purchaseStr}
              </text>
              <text
                x={ORIGINAL_PRICE_SLOT.x}
                y={GIFT_PORTRAIT_LANDMARKS.priceY + 48}
                fontSize={GIFT_PORTRAIT_TYPE.priceSubLabel}
                fill={MUTED}
                fontFamily="system-ui,sans-serif"
              >
                {labels.originalFaceLabel}
              </text>
              <text
                x={purchaseX}
                y={GIFT_PORTRAIT_LANDMARKS.priceY + 48}
                fontSize={GIFT_PORTRAIT_TYPE.priceSubLabel}
                fill={MUTED}
                fontFamily="system-ui,sans-serif"
              >
                {labels.purchaseLabel}
              </text>
            </>
          ) : purchaseStr ? (
            <text
              data-gift-purchase-amount="1"
              x={PAD_L}
              y={GIFT_PORTRAIT_LANDMARKS.priceY}
              fontSize={GIFT_PORTRAIT_TYPE.purchasePrice}
              fill={INK}
              fontFamily="system-ui,sans-serif"
              fontWeight={700}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {labels.purchaseLabel} {purchaseStr}
            </text>
          ) : null}
        </g>
      </g>
    );
  }

  if (model.valueMode === "wallet" && model.remainingBalance != null) {
    return (
      <g data-gift-landmark="amount" data-gift-value-block="wallet">
        <text
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.amountLabelY}
          fontSize={GIFT_PORTRAIT_TYPE.amountLabel}
          fill="#303833"
          fontFamily="system-ui,sans-serif"
          fontWeight={600}
        >
          {labels.balanceLabel}
        </text>
        <text
          data-gift-remaining-amount="1"
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.amountY}
          fontSize={GIFT_PORTRAIT_TYPE.amountValue}
          fill={BRAND}
          fontFamily="system-ui,sans-serif"
          fontWeight={800}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatMoneyPhp(model.remainingBalance)}
        </text>
        {model.faceValue != null ? (
          <text
            x={PAD_L}
            y={GIFT_PORTRAIT_LANDMARKS.priceY}
            fontSize={GIFT_PORTRAIT_TYPE.originalPrice}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {labels.originalFaceLabel} {formatMoneyPhp(model.faceValue)}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <g data-gift-landmark="amount" data-gift-value-block="used">
      <text
        x={PAD_L}
        y={GIFT_PORTRAIT_LANDMARKS.amountY}
        fontSize={48}
        fill={MUTED}
        fontFamily="system-ui,sans-serif"
        fontWeight={800}
      >
        {labels.usedLabel}
      </text>
      {model.faceValue != null ? (
        <text
          x={PAD_L}
          y={GIFT_PORTRAIT_LANDMARKS.priceY}
          fontSize={GIFT_PORTRAIT_TYPE.originalPrice}
          fill={MUTED_PRICE}
          fontFamily="system-ui,sans-serif"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatMoneyPhp(model.faceValue)}
        </text>
      ) : null}
    </g>
  );
}

function TicketFooterBrand({ isPlatform }: { isPlatform: boolean }) {
  return (
    <text
      x={400}
      y={GIFT_PORTRAIT_LANDMARKS.footerY}
      textAnchor="middle"
      fontSize={GIFT_PORTRAIT_TYPE.footBrand}
      fontWeight={600}
      fill={MUTED}
      fontFamily="system-ui,sans-serif"
      letterSpacing="2"
      data-gift-foot-brand="1"
    >
      {isPlatform ? "DIBAY GIFT CERTIFICATE" : "Powered by DIBAY"}
    </text>
  );
}

function GiftableStrip({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  const y = GIFT_PORTRAIT_LANDMARKS.giftableY;
  return (
    <g data-gift-giftable-strip="1">
      <rect
        x={PAD_L}
        y={y}
        width={PAD_R - PAD_L}
        height={165}
        rx={18}
        fill="#EAF5EE"
      />
      {/* gift box icon */}
      <g fill="none" stroke={BRAND} strokeWidth={2.2} aria-hidden>
        <rect x={PAD_L + 24} y={y + 48} width={42} height={42} rx={4} />
        <path d={`M ${PAD_L + 24} ${y + 64} H ${PAD_L + 66}`} />
        <path d={`M ${PAD_L + 45} ${y + 48} V ${y + 90}`} />
        <path d={`M ${PAD_L + 45} ${y + 48} C ${PAD_L + 33} ${y + 31}, ${PAD_L + 17} ${y + 42}, ${PAD_L + 45} ${y + 48}`} />
        <path d={`M ${PAD_L + 45} ${y + 48} C ${PAD_L + 57} ${y + 31}, ${PAD_L + 73} ${y + 42}, ${PAD_L + 45} ${y + 48}`} />
      </g>
      <text
        x={PAD_L + 88}
        y={y + 70}
        fontSize={34}
        fontWeight={700}
        fill={BRAND}
        fontFamily="system-ui,sans-serif"
      >
        {title}
      </text>
      <text
        x={PAD_L + 88}
        y={y + 116}
        fontSize={27}
        fill={MUTED}
        fontFamily="system-ui,sans-serif"
      >
        {hint.length > 28 ? `${hint.slice(0, 27)}…` : hint}
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
  const maskId = `${uid}-mask`;
  const isPlatform = model.kind === "PLATFORM";
  const titleLines = wrapGiftCertificateTitle(model.title, { maxCharsPerLine: 18, maxLines: 2 });
  const numberValue = model.certificateDisplayNumber?.trim() || labels.numberUnavailable;
  const expiryValue = model.expirationDisplay?.trim() || "—";

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
            fill="#FFFFFF"
          />

          <TicketHero model={model} uid={uid} />

          <g data-gift-issuer-badge="1">
            <rect
              x={PAD_L}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY}
              width={Math.min(52 + model.issuerBadge.length * 16, 260)}
              height={56}
              rx={28}
              fill={BRAND_SOFT}
              stroke={BRAND_SOFT_STROKE}
              strokeWidth={1.5}
            />
            <text
              x={PAD_L + 20}
              y={GIFT_PORTRAIT_LANDMARKS.badgeY + 38}
              fontSize={GIFT_PORTRAIT_TYPE.badge}
              fontWeight={700}
              fill={BRAND}
              fontFamily="system-ui,sans-serif"
            >
              {model.issuerBadge.length > 14 ? `${model.issuerBadge.slice(0, 13)}…` : model.issuerBadge}
            </text>
          </g>

          <g data-gift-landmark="title" data-gift-cert-title="1">
            {titleLines.map((line, i) => (
              <text
                key={i}
                x={PAD_L}
                y={GIFT_PORTRAIT_LANDMARKS.titleY + i * GIFT_PORTRAIT_TYPE.titleLine}
                fontSize={GIFT_PORTRAIT_TYPE.title}
                fontWeight={700}
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
              x1={52}
              y1={GIFT_PORTRAIT_LANDMARKS.perforationY}
              x2={748}
              y2={GIFT_PORTRAIT_LANDMARKS.perforationY}
              stroke={LINE}
              strokeWidth={2}
              strokeDasharray="10 10"
            />
          </g>

          <MetaRow
            kind="issuer"
            label={labels.issuerLabel}
            value={model.issuerName || "—"}
            y={GIFT_PORTRAIT_LANDMARKS.issuerY}
            dataAttr="issuer"
          />
          <MetaRow
            kind="expiry"
            label={labels.expiryLabel}
            value={expiryValue}
            y={GIFT_PORTRAIT_LANDMARKS.expiryY}
            dataAttr="expiry"
          />
          <MetaRow
            kind="number"
            label={labels.numberLabel}
            value={numberValue}
            y={GIFT_PORTRAIT_LANDMARKS.numberY}
            dataAttr="number"
          />

          <TicketFooterBrand isPlatform={isPlatform} />

          {model.transferable === true ? (
            <GiftableStrip title={labels.giftableTitle} hint={labels.giftableHint} />
          ) : null}
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
