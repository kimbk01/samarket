"use client";

/**
 * Canonical DIBAY gift certificate portrait face — ONE SVG, 800×1200 user units.
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

/** Landmark Y — fixed fractions of 1200 for geometry QA. */
export const GIFT_PORTRAIT_LANDMARKS = {
  heroBottomY: 330,
  titleY: 440,
  amountY: 640,
  priceY: 715,
  perforationY: 770,
  issuerY: 850,
  expiryY: 910,
  numberY: 970,
} as const;

const VB_W = GIFT_CERT_COORD_WIDTH;
const VB_H = GIFT_CERT_COORD_HEIGHT;
const TICKET = { x: 12, y: 12, w: 776, h: 1176, rx: 34 } as const;
const PAD_L = 64;
const PAD_R = 736;
const CONTENT_W = 672;

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
};

function MetaIcon({ kind, y }: { kind: "issuer" | "expiry" | "number"; y: number }) {
  const cy = y - 6;
  if (kind === "issuer") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={1.6} aria-hidden>
        <path d={`M ${PAD_L} ${cy + 8} L ${PAD_L + 10} ${cy - 2} L ${PAD_L + 20} ${cy + 8} V ${cy + 14} H ${PAD_L} Z`} />
        <path d={`M ${PAD_L + 7} ${cy + 14} V ${cy + 6} H ${PAD_L + 13} V ${cy + 14}`} />
      </g>
    );
  }
  if (kind === "expiry") {
    return (
      <g fill="none" stroke={MUTED} strokeWidth={1.6} aria-hidden>
        <rect x={PAD_L} y={cy - 6} width={20} height={18} rx={2} />
        <path d={`M ${PAD_L} ${cy} H ${PAD_L + 20}`} />
        <path d={`M ${PAD_L + 6} ${cy - 9} V ${cy - 3}`} />
        <path d={`M ${PAD_L + 14} ${cy - 9} V ${cy - 3}`} />
      </g>
    );
  }
  return (
    <g fill="none" stroke={MUTED} strokeWidth={1.6} aria-hidden>
      <path
        d={`M ${PAD_L + 2} ${cy - 4} H ${PAD_L + 18} L ${PAD_L + 14} ${cy + 10} H ${PAD_L + 6} Z`}
      />
      <circle cx={PAD_L + 10} cy={cy + 1} r={1.5} fill={MUTED} stroke="none" />
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
      <text x={PAD_L + 32} y={y} fontSize={22} fill={MUTED} fontFamily="system-ui,sans-serif">
        {label}
      </text>
      <text
        x={PAD_R}
        y={y}
        fontSize={22}
        fill={INK}
        fontFamily="system-ui,sans-serif"
        fontWeight={600}
        textAnchor="end"
      >
        {value.length > 28 ? `${value.slice(0, 27)}…` : value}
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
              L ${TICKET.x + TICKET.w} 300
              C 650 355, 500 350, 400 322
              C 250 286, 150 285, ${TICKET.x} 340
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
          L ${TICKET.x + TICKET.w} 300
          C 650 355, 500 350, 400 322
          C 250 286, 150 285, ${TICKET.x} 340
          Z
        `}
      />

      {/* subtle wave décor in hero */}
      <g clipPath={`url(#${heroClip})`} opacity={0.18} aria-hidden>
        {[0, 18, 36].map((off) => (
          <path
            key={off}
            d={`M ${TICKET.x} ${210 + off} C 200 ${180 + off}, 400 ${250 + off}, 788 ${200 + off}`}
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
            x={285}
            y={58}
            width={230}
            height={150}
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            x={400}
            y={245}
            textAnchor="middle"
            fontSize={42}
            fontWeight={800}
            fill="#FFFFFF"
            fontFamily="system-ui,sans-serif"
            letterSpacing="2"
          >
            DIBAY
          </text>
          <text
            x={400}
            y={280}
            textAnchor="middle"
            fontSize={16}
            fontWeight={600}
            fill={GOLD}
            fontFamily="system-ui,sans-serif"
            letterSpacing="4"
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
                height={330}
                preserveAspectRatio="xMidYMid slice"
              />
              <rect
                x={TICKET.x}
                y={TICKET.y}
                width={TICKET.w}
                height={330}
                fill="#000000"
                opacity={0.28}
              />
            </>
          ) : (
            <text
              x={400}
              y={200}
              textAnchor="middle"
              fontSize={120}
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
              y={300}
              textAnchor="middle"
              fontSize={22}
              fontWeight={700}
              fill="#FFFFFF"
              fontFamily="system-ui,sans-serif"
            >
              {model.issuerName.length > 28 ? `${model.issuerName.slice(0, 27)}…` : model.issuerName}
            </text>
          ) : null}
        </g>
      )}

      {/* top-right badge */}
      <g data-gift-hero-badge="1">
        <rect x={560} y={36} width={180} height={44} rx={22} fill="rgba(255,255,255,0.18)" />
        <text
          x={650}
          y={64}
          textAnchor="middle"
          fontSize={20}
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
    return (
      <g data-gift-landmark="amount" data-gift-value-block="mall">
        <text
          x={PAD_L}
          y={560}
          fontSize={24}
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
          fontSize={74}
          fill={BRAND}
          fontFamily="system-ui,sans-serif"
          fontWeight={800}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {faceStr}
        </text>

        <g data-gift-landmark="price">
          {showDiscount && purchaseStr ? (
            <>
              <text
                data-gift-face-strike="1"
                x={PAD_L}
                y={GIFT_PORTRAIT_LANDMARKS.priceY}
                fontSize={28}
                fill={MUTED_PRICE}
                fontFamily="system-ui,sans-serif"
                fontWeight={500}
                textDecoration="line-through"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {faceStr}
              </text>
              <text
                x={230}
                y={GIFT_PORTRAIT_LANDMARKS.priceY}
                fontSize={28}
                fill={ARROW}
                fontFamily="system-ui,sans-serif"
              >
                →
              </text>
              <text
                data-gift-purchase-amount="1"
                x={268}
                y={GIFT_PORTRAIT_LANDMARKS.priceY}
                fontSize={34}
                fill={BRAND}
                fontFamily="system-ui,sans-serif"
                fontWeight={800}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {purchaseStr}
              </text>
              <text
                x={PAD_L}
                y={GIFT_PORTRAIT_LANDMARKS.priceY + 34}
                fontSize={18}
                fill={MUTED}
                fontFamily="system-ui,sans-serif"
              >
                {labels.originalFaceLabel}
              </text>
              <text
                x={268}
                y={GIFT_PORTRAIT_LANDMARKS.priceY + 34}
                fontSize={18}
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
              fontSize={28}
              fill={INK}
              fontFamily="system-ui,sans-serif"
              fontWeight={600}
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
          y={560}
          fontSize={24}
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
          fontSize={74}
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
            fontSize={24}
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
        fontSize={42}
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
          fontSize={28}
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
  const titleLines = wrapGiftCertificateTitle(model.title, { maxCharsPerLine: 20, maxLines: 2 });
  const numberValue = model.certificateDisplayNumber?.trim() || labels.numberUnavailable;
  const expiryValue = model.expirationDisplay?.trim() || null;

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

          {/* body issuer badge */}
          <g data-gift-issuer-badge="1">
            <rect
              x={PAD_L}
              y={372}
              width={Math.min(44 + model.issuerBadge.length * 14, 220)}
              height={44}
              rx={22}
              fill={BRAND_SOFT}
              stroke={BRAND_SOFT_STROKE}
              strokeWidth={1.5}
            />
            <text
              x={PAD_L + 18}
              y={400}
              fontSize={20}
              fontWeight={700}
              fill={BRAND}
              fontFamily="system-ui,sans-serif"
            >
              {model.issuerBadge.length > 14 ? `${model.issuerBadge.slice(0, 13)}…` : model.issuerBadge}
            </text>
          </g>

          {/* title — fixed box, max 2 lines */}
          <g data-gift-landmark="title" data-gift-cert-title="1">
            {titleLines.map((line, i) => (
              <text
                key={i}
                x={PAD_L}
                y={GIFT_PORTRAIT_LANDMARKS.titleY + i * 40}
                fontSize={32}
                fontWeight={700}
                fill={INK}
                fontFamily="system-ui,sans-serif"
              >
                {line}
              </text>
            ))}
          </g>

          <AmountBlock model={model} labels={labels} />

          {/* perforation dashed line */}
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

          {/* meta */}
          <MetaRow
            kind="issuer"
            label={labels.issuerLabel}
            value={model.issuerName || "—"}
            y={GIFT_PORTRAIT_LANDMARKS.issuerY}
            dataAttr="issuer"
          />
          {expiryValue ? (
            <MetaRow
              kind="expiry"
              label={labels.expiryLabel}
              value={expiryValue}
              y={GIFT_PORTRAIT_LANDMARKS.expiryY}
              dataAttr="expiry"
            />
          ) : null}
          <MetaRow
            kind="number"
            label={labels.numberLabel}
            value={numberValue}
            y={GIFT_PORTRAIT_LANDMARKS.numberY}
            dataAttr="number"
          />

          {/* bottom brand identity */}
          <text
            x={400}
            y={1100}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fill={MUTED}
            fontFamily="system-ui,sans-serif"
            letterSpacing="3"
            data-gift-foot-brand="1"
          >
            {isPlatform ? "DIBAY GIFT CERTIFICATE" : "Powered by DIBAY"}
          </text>
        </g>

        {/* outer stroke after mask so edge reads clean */}
        <rect
          x={TICKET.x}
          y={TICKET.y}
          width={TICKET.w}
          height={TICKET.h}
          rx={TICKET.rx}
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
