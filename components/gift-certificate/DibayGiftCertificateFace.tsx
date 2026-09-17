"use client";

/**
 * DIBAY gift-certificate face — Owner modern ticket VISUAL SSOT.
 * Geometry mirrors dibay-gift-certificate-modern reference (640×360):
 * left brand rail · vertical perforation · side notches · body hierarchy.
 * Dynamic text only from GiftCertificateVisualModel. Finance/domain untouched.
 */

import { useId } from "react";
import type { GiftCertificateVisualModel } from "@/lib/gift-certificate/gift-certificate-visual-model";
import { giftShowsDiscountStrike } from "@/lib/gift-certificate/gift-certificate-visual-model";
import {
  GIFT_CERT_ASPECT_RATIO,
  GIFT_CERT_COORD_HEIGHT,
  GIFT_CERT_COORD_WIDTH,
} from "@/lib/gift-certificate/gift-visual-layout";
import { wrapGiftCertificateTitle } from "@/lib/gift-certificate/wrap-gift-certificate-title";
import { formatMoneyPhp } from "@/lib/utils/format";

const VB_W = GIFT_CERT_COORD_WIDTH;
const VB_H = GIFT_CERT_COORD_HEIGHT;

const FONT =
  '"Pretendard Variable", Pretendard, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

/** Measured from Owner reference 640×360 — DO NOT redesign. */
export const GIFT_MODERN_GEOMETRY = {
  rx: 28,
  railW: 168,
  notchR: 24,
  notchY: 166,
  perforationX: 168,
  bodyPadL: 188,
  bodyPadR: 612,
} as const;

/** Landmarks (y) inside body — Owner reference composition. */
export const GIFT_PORTRAIT_LANDMARKS = {
  badgeY: 36,
  storeScopeY: 58,
  titleY: 78,
  titleLine: 24,
  descY: 108,
  amountLabelY: 142,
  amountY: 188,
  purchaseLabelY: 214,
  purchaseY: 236,
  dividerY: 262,
  metaLabelY: 288,
  metaValueY: 312,
  /** Stacked gift-number row (label above value — no ellipsis). */
  numberLabelY: 288,
  numberValueY: 312,
  /** Rail brand / store mark — larger translucent modern plate. */
  storeLogoSize: 72,
  platformMarkSize: 96,
  railMarkY: 118,
  /** @deprecated compat aliases */
  brandY: 52,
  issuerY: 312,
  purchaseYLegacy: 236,
  perforationY: 166,
  numberY: 312,
} as const;

/**
 * Type scale @ 640 viewBox.
 * Amount ≈ 2.0× title (Owner: must stay ≤ 2.2×).
 */
export const GIFT_PORTRAIT_TYPE = {
  railBrand: 32,
  railSubtitle: 10,
  railOneTime: 11,
  railFoot: 9,
  railStoreInitial: 28,
  badge: 11,
  storeScope: 11,
  title: 22,
  desc: 12,
  amountLabel: 12,
  amountValue: 44,
  purchaseLabel: 12,
  purchaseStrike: 14,
  purchaseValue: 16,
  offBadge: 10,
  metaLabel: 11,
  metaValue: 13,
  status: 11,
} as const;

const RAIL = "#0D4F26";
const RAIL_SOFT = "#176338";
const YELLOW = "#F3D44D";
const AMOUNT = "#0D4F26";
const INK = "#171A18";
const MUTED = "#7A847C";
const LINE = "#E3E8E4";
const BADGE_BG = "#E7F4EC";
const BADGE_FG = "#0D4F26";
const OFF_BG = "#F6E7A8";
const OFF_FG = "#6B5A14";
const BODY = "#FCFDFB";

export type GiftCertificateFaceLabels = {
  faceAmountLabel: string;
  purchaseLabel: string;
  balanceLabel: string;
  usedLabel: string;
  issuerLabel: string;
  expiryLabel: string;
  numberLabel: string;
  numberUnavailable: string;
  /** STORE only — omitted for PLATFORM. */
  storeScopeNotice?: string;
};

function discountOffPercent(face: number, purchase: number): number {
  if (!(face > 0) || !(purchase < face)) return 0;
  return Math.max(1, Math.round(((face - purchase) / face) * 100));
}

function estimateSvgTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === "," || char === "." || char === " ") width += fontSize * 0.3;
    else if (char === "₱" || char === "$") width += fontSize * 0.7;
    else if (/[0-9]/.test(char)) width += fontSize * 0.58;
    else if (/[A-Za-z]/.test(char)) width += fontSize * 0.55;
    else width += fontSize * 0.9;
  }
  return Math.round(width);
}

/** Full public-number display — stacked label/value, never ellipsized. */
function NumberMetaRow({
  label,
  value,
  x,
}: {
  label: string;
  value: string;
  x: number;
}) {
  return (
    <g data-gift-landmark="number" data-gift-cert-number-row="stacked">
      <text
        x={x}
        y={GIFT_PORTRAIT_LANDMARKS.numberLabelY}
        fill={MUTED}
        fontSize={GIFT_PORTRAIT_TYPE.metaLabel}
        fontWeight={500}
        fontFamily={FONT}
      >
        {label}
      </text>
      <text
        data-gift-public-number="1"
        x={x}
        y={GIFT_PORTRAIT_LANDMARKS.numberValueY}
        fill={INK}
        fontSize={GIFT_PORTRAIT_TYPE.metaValue}
        fontWeight={750}
        fontFamily={FONT}
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
  const maskId = `${uid}-ticket`;
  const railGradId = `${uid}-rail`;
  const logoClipId = `${uid}-logo`;

  const used = model.valueMode === "used";
  const isPlatform = model.kind === "PLATFORM";
  const statusText = used ? "USED" : "AVAILABLE";

  const storeScopeNotice =
    !isPlatform && labels.storeScopeNotice?.trim()
      ? labels.storeScopeNotice.trim()
      : "";

  const titleLines = wrapGiftCertificateTitle(model.title, {
    maxCharsPerLine: 20,
    maxLines: 2,
  });
  const multiTitle = titleLines.length > 1;
  const amountLabelY = multiTitle
    ? GIFT_PORTRAIT_LANDMARKS.amountLabelY + 10
    : GIFT_PORTRAIT_LANDMARKS.amountLabelY;
  const amountY = multiTitle
    ? GIFT_PORTRAIT_LANDMARKS.amountY + 10
    : GIFT_PORTRAIT_LANDMARKS.amountY;
  const purchaseY = multiTitle
    ? GIFT_PORTRAIT_LANDMARKS.purchaseY + 10
    : GIFT_PORTRAIT_LANDMARKS.purchaseY;

  const numberValue =
    model.certificateDisplayNumber?.trim() || labels.numberUnavailable;
  const expiryValue = model.expirationDisplay?.trim() || "";

  const faceValue =
    model.faceValue == null ? null : formatMoneyPhp(model.faceValue);
  const purchasePrice =
    model.purchasePrice == null ? null : formatMoneyPhp(model.purchasePrice);
  const discounted =
    model.faceValue != null &&
    model.purchasePrice != null &&
    giftShowsDiscountStrike(model.faceValue, model.purchasePrice);
  const offPct =
    discounted && model.faceValue != null && model.purchasePrice != null
      ? discountOffPercent(model.faceValue, model.purchasePrice)
      : 0;

  const showStoreLogo =
    !isPlatform &&
    Boolean(model.heroImageSrc) &&
    !model.useStoreInitialFallback;
  const showPlatformMark = isPlatform && Boolean(model.heroImageSrc);
  const showStoreInitial = !isPlatform && model.useStoreInitialFallback;

  const g = GIFT_MODERN_GEOMETRY;
  const bodyX = g.bodyPadL;
  const railMarkSize = isPlatform
    ? GIFT_PORTRAIT_LANDMARKS.platformMarkSize
    : GIFT_PORTRAIT_LANDMARKS.storeLogoSize;
  const railMarkX = Math.round((g.railW - railMarkSize) / 2);
  const railMarkY = GIFT_PORTRAIT_LANDMARKS.railMarkY;
  const metaCols = [
    { label: labels.issuerLabel, value: model.issuerName || (isPlatform ? "DIBAY" : ""), x: bodyX },
    { label: labels.expiryLabel, value: expiryValue, x: 340 },
  ] as const;

  const strikeW = faceValue
    ? estimateSvgTextWidth(faceValue, GIFT_PORTRAIT_TYPE.purchaseStrike)
    : 0;

  return (
    <div
      data-gift-cert-face="1"
      data-gift-certificate-face="1"
      data-gift-brand-logo={isPlatform ? "dibay-rail" : "store-rail"}
      data-gift-scope={model.kind}
      data-gift-value-mode={model.valueMode}
      data-gift-cert-identity="modern-ticket"
      className="relative w-full min-w-0 overflow-visible"
      style={{ aspectRatio: GIFT_CERT_ASPECT_RATIO, maxWidth: "100%" }}
    >
      <svg
        data-gift-cert-artwork="1"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={model.title || "DIBAY Gift Certificate"}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: GIFT_CERT_ASPECT_RATIO,
        }}
      >
        <defs>
          <linearGradient id={railGradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={RAIL_SOFT} />
            <stop offset="55%" stopColor={RAIL} />
            <stop offset="100%" stopColor="#08361A" />
          </linearGradient>
          <mask id={maskId}>
            <rect x={0} y={0} width={VB_W} height={VB_H} rx={g.rx} fill="#fff" />
            <circle cx={0} cy={g.notchY} r={g.notchR} fill="#000" />
            <circle cx={VB_W} cy={g.notchY} r={g.notchR} fill="#000" />
          </mask>
          {showStoreLogo || showPlatformMark ? (
            <clipPath id={logoClipId}>
              <rect
                x={railMarkX}
                y={railMarkY}
                width={railMarkSize}
                height={railMarkSize}
                rx={showPlatformMark ? railMarkSize / 2 : 16}
              />
            </clipPath>
          ) : null}
        </defs>

        <g mask={`url(#${maskId})`} opacity={used ? 0.82 : 1}>
          {/* body */}
          <rect
            x={0}
            y={0}
            width={VB_W}
            height={VB_H}
            rx={g.rx}
            fill={used ? "#F4F6F4" : BODY}
          />

          {/* left brand rail */}
          <g data-gift-brand-rail="1">
            <rect x={0} y={0} width={g.railW} height={VB_H} fill={`url(#${railGradId})`} />
            {/* subtle watermark rings */}
            <circle cx={40} cy={200} r={110} fill={RAIL_SOFT} opacity={0.22} />
            <circle cx={140} cy={40} r={90} fill="#08361A" opacity={0.25} />

            <text
              x={28}
              y={52}
              fill="#FFFFFF"
              opacity={0.92}
              fontSize={GIFT_PORTRAIT_TYPE.railBrand}
              fontWeight={800}
              fontFamily={FONT}
              letterSpacing={-0.6}
              data-gift-brand-wordmark="1"
            >
              DIBAY
            </text>
            <rect x={28} y={60} width={40} height={3} rx={1.5} fill={YELLOW} opacity={0.9} />
            <text
              x={28}
              y={88}
              fill="#FFFFFF"
              opacity={0.72}
              fontSize={GIFT_PORTRAIT_TYPE.railSubtitle}
              fontWeight={700}
              fontFamily={FONT}
              letterSpacing={2.4}
            >
              GIFT CERTIFICATE
            </text>

            {showPlatformMark && model.heroImageSrc ? (
              <g data-gift-platform-mark="1" opacity={0.42} clipPath={`url(#${logoClipId})`}>
                <rect
                  x={railMarkX}
                  y={railMarkY}
                  width={railMarkSize}
                  height={railMarkSize}
                  rx={railMarkSize / 2}
                  fill="#FFFFFF"
                  opacity={0.12}
                />
                <image
                  href={model.heroImageSrc}
                  x={railMarkX}
                  y={railMarkY}
                  width={railMarkSize}
                  height={railMarkSize}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={0.95}
                />
              </g>
            ) : null}

            {showStoreLogo && model.heroImageSrc ? (
              <g data-gift-store-logo="1" opacity={0.88} clipPath={`url(#${logoClipId})`}>
                <rect
                  x={railMarkX}
                  y={railMarkY}
                  width={railMarkSize}
                  height={railMarkSize}
                  rx={16}
                  fill="#FFFFFF"
                  opacity={0.22}
                />
                <image
                  href={model.heroImageSrc}
                  x={railMarkX}
                  y={railMarkY}
                  width={railMarkSize}
                  height={railMarkSize}
                  preserveAspectRatio="xMidYMid slice"
                  opacity={0.9}
                />
              </g>
            ) : null}

            {showStoreInitial ? (
              <g data-gift-store-initial="1" opacity={0.78}>
                <rect
                  x={railMarkX}
                  y={railMarkY}
                  width={railMarkSize}
                  height={railMarkSize}
                  rx={16}
                  fill="#FFFFFF"
                  opacity={0.18}
                />
                <text
                  x={railMarkX + railMarkSize / 2}
                  y={railMarkY + railMarkSize / 2 + 10}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={GIFT_PORTRAIT_TYPE.railStoreInitial}
                  fontWeight={800}
                  fontFamily={FONT}
                >
                  {model.storeInitial}
                </text>
              </g>
            ) : null}

            <g data-gift-one-time="1">
              <circle cx={38} cy={286} r={8} fill={YELLOW} />
              <path
                d="M34.2 286.1 L36.6 288.5 L42.2 283.2"
                fill="none"
                stroke="#0D4F26"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x={52}
                y={290}
                fill="#FFFFFF"
                fontSize={GIFT_PORTRAIT_TYPE.railOneTime}
                fontWeight={800}
                fontFamily={FONT}
                letterSpacing={0.8}
              >
                ONE-TIME USE
              </text>
            </g>
            <text
              x={28}
              y={328}
              fill="#8BB89A"
              fontSize={GIFT_PORTRAIT_TYPE.railFoot}
              fontWeight={700}
              fontFamily={FONT}
              letterSpacing={1.6}
            >
              DIBAY BENEFIT
            </text>
          </g>

          {/* vertical perforation */}
          <g data-gift-cert-perforation="1" data-gift-landmark="perforation">
            <line
              x1={g.perforationX}
              y1={18}
              x2={g.perforationX}
              y2={VB_H - 18}
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeDasharray="3 7"
              opacity={0.95}
            />
          </g>

          {/* body content */}
          <g data-gift-cert-body="1">
            {/* type badge */}
            <g data-gift-issuer-badge="1">
              <rect
                x={bodyX}
                y={GIFT_PORTRAIT_LANDMARKS.badgeY - 16}
                width={Math.min(118, 28 + model.issuerBadge.length * 9)}
                height={24}
                rx={12}
                fill={BADGE_BG}
              />
              <text
                x={bodyX + 12}
                y={GIFT_PORTRAIT_LANDMARKS.badgeY}
                fill={BADGE_FG}
                fontSize={GIFT_PORTRAIT_TYPE.badge}
                fontWeight={750}
                fontFamily={FONT}
              >
                {model.issuerBadge.length > 12
                  ? `${model.issuerBadge.slice(0, 11)}…`
                  : model.issuerBadge}
              </text>
            </g>

            {/* status */}
            <g
              data-gift-status-chip="1"
              data-gift-availability={statusText}
            >
              <rect
                x={508}
                y={GIFT_PORTRAIT_LANDMARKS.badgeY - 16}
                width={104}
                height={24}
                rx={12}
                fill={used ? "#EEF0EE" : "#FFFFFF"}
                stroke={used ? "#C9D0CB" : "#C7DED0"}
                strokeWidth={1.5}
              />
              <circle
                cx={522}
                cy={GIFT_PORTRAIT_LANDMARKS.badgeY - 4}
                r={3.5}
                fill={used ? "#6B746E" : "#1F8A4C"}
              />
              <text
                x={532}
                y={GIFT_PORTRAIT_LANDMARKS.badgeY}
                fill={used ? "#5A635C" : BADGE_FG}
                fontSize={GIFT_PORTRAIT_TYPE.status}
                fontWeight={800}
                fontFamily={FONT}
                letterSpacing={0.4}
              >
                {statusText}
              </text>
            </g>

            {storeScopeNotice ? (
              <text
                data-gift-store-scope-notice="1"
                x={bodyX}
                y={GIFT_PORTRAIT_LANDMARKS.storeScopeY}
                fill={MUTED}
                fontSize={GIFT_PORTRAIT_TYPE.storeScope}
                fontWeight={600}
                fontFamily={FONT}
              >
                {storeScopeNotice.length > 32
                  ? `${storeScopeNotice.slice(0, 31)}…`
                  : storeScopeNotice}
              </text>
            ) : null}

            {/* title */}
            <g data-gift-landmark="title" data-gift-cert-title="1">
              {titleLines.map((line, index) => (
                <text
                  key={`${line}-${index}`}
                  x={bodyX}
                  y={
                    GIFT_PORTRAIT_LANDMARKS.titleY +
                    index * GIFT_PORTRAIT_LANDMARKS.titleLine
                  }
                  fill={INK}
                  fontSize={GIFT_PORTRAIT_TYPE.title}
                  fontWeight={750}
                  fontFamily={FONT}
                  letterSpacing={-0.4}
                >
                  {line}
                </text>
              ))}
            </g>

            {/* amount */}
            {faceValue ? (
              <g
                data-gift-landmark="amount"
                data-gift-value-block={used ? "used" : model.valueMode === "mall" ? "mall" : "wallet"}
                data-gift-money-ssot="one-time"
                data-gift-discount-hierarchy={discounted ? "1" : "0"}
              >
                <text
                  x={bodyX}
                  y={amountLabelY}
                  fill={MUTED}
                  fontSize={GIFT_PORTRAIT_TYPE.amountLabel}
                  fontWeight={600}
                  fontFamily={FONT}
                >
                  {labels.faceAmountLabel}
                </text>
                <text
                  data-gift-face-amount="1"
                  x={bodyX}
                  y={amountY}
                  fill={used ? "#5A635C" : AMOUNT}
                  fontSize={GIFT_PORTRAIT_TYPE.amountValue}
                  fontWeight={850}
                  fontFamily={FONT}
                  letterSpacing={-1.4}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {faceValue}
                </text>

                {purchasePrice ? (
                  <g data-gift-purchase-row="1">
                    <text
                      x={bodyX}
                      y={
                        multiTitle
                          ? GIFT_PORTRAIT_LANDMARKS.purchaseLabelY + 10
                          : GIFT_PORTRAIT_LANDMARKS.purchaseLabelY
                      }
                      fill={MUTED}
                      fontSize={GIFT_PORTRAIT_TYPE.purchaseLabel}
                      fontWeight={600}
                      fontFamily={FONT}
                    >
                      {labels.purchaseLabel}
                    </text>

                    {discounted ? (
                      <g data-gift-discount-strike="1">
                        <text
                          data-gift-face-strike="1"
                          x={bodyX}
                          y={purchaseY}
                          fill={MUTED}
                          fontSize={GIFT_PORTRAIT_TYPE.purchaseStrike}
                          fontWeight={500}
                          fontFamily={FONT}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {faceValue}
                        </text>
                        <line
                          data-gift-face-strike-line="1"
                          x1={bodyX}
                          x2={bodyX + strikeW}
                          y1={purchaseY - GIFT_PORTRAIT_TYPE.purchaseStrike * 0.32}
                          y2={purchaseY - GIFT_PORTRAIT_TYPE.purchaseStrike * 0.32}
                          stroke={MUTED}
                          strokeWidth={1.8}
                          strokeLinecap="round"
                        />
                        <text
                          data-gift-purchase-amount="1"
                          x={bodyX + strikeW + 12}
                          y={purchaseY}
                          fill={INK}
                          fontSize={GIFT_PORTRAIT_TYPE.purchaseValue}
                          fontWeight={800}
                          fontFamily={FONT}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {purchasePrice}
                        </text>
                        {offPct > 0 ? (
                          <g data-gift-off-badge="1">
                            <rect
                              x={
                                bodyX +
                                strikeW +
                                12 +
                                estimateSvgTextWidth(
                                  purchasePrice,
                                  GIFT_PORTRAIT_TYPE.purchaseValue
                                ) +
                                10
                              }
                              y={purchaseY - 14}
                              width={52}
                              height={18}
                              rx={9}
                              fill={OFF_BG}
                            />
                            <text
                              x={
                                bodyX +
                                strikeW +
                                12 +
                                estimateSvgTextWidth(
                                  purchasePrice,
                                  GIFT_PORTRAIT_TYPE.purchaseValue
                                ) +
                                36
                              }
                              y={purchaseY - 1}
                              textAnchor="middle"
                              fill={OFF_FG}
                              fontSize={GIFT_PORTRAIT_TYPE.offBadge}
                              fontWeight={800}
                              fontFamily={FONT}
                            >
                              {offPct}% OFF
                            </text>
                          </g>
                        ) : null}
                      </g>
                    ) : (
                      <text
                        data-gift-purchase-amount="1"
                        data-gift-discount-strike="0"
                        x={bodyX}
                        y={purchaseY}
                        fill={INK}
                        fontSize={GIFT_PORTRAIT_TYPE.purchaseValue}
                        fontWeight={750}
                        fontFamily={FONT}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {purchasePrice}
                      </text>
                    )}
                  </g>
                ) : null}
              </g>
            ) : null}

            {/* divider */}
            <line
              x1={bodyX}
              y1={GIFT_PORTRAIT_LANDMARKS.dividerY}
              x2={g.bodyPadR}
              y2={GIFT_PORTRAIT_LANDMARKS.dividerY}
              stroke={LINE}
              strokeWidth={1.5}
            />

            {/* metadata grid — issuer / expiry; number uses stacked NumberMetaRow */}
            <g data-gift-meta-grid="1">
              {metaCols.map((col) => (
                <g key={col.label} data-gift-meta-col={col.label}>
                  <text
                    x={col.x}
                    y={GIFT_PORTRAIT_LANDMARKS.metaLabelY}
                    fill={MUTED}
                    fontSize={GIFT_PORTRAIT_TYPE.metaLabel}
                    fontWeight={500}
                    fontFamily={FONT}
                  >
                    {col.label}
                  </text>
                  <text
                    {...(col.label === labels.issuerLabel
                      ? { "data-gift-landmark": "issuer" }
                      : {})}
                    x={col.x}
                    y={GIFT_PORTRAIT_LANDMARKS.metaValueY}
                    fill={INK}
                    fontSize={GIFT_PORTRAIT_TYPE.metaValue}
                    fontWeight={750}
                    fontFamily={FONT}
                  >
                    {col.value.length > 16 ? `${col.value.slice(0, 15)}…` : col.value}
                  </text>
                </g>
              ))}
              <NumberMetaRow label={labels.numberLabel} value={numberValue} x={470} />
            </g>
          </g>

          {used ? (
            <g data-gift-used-stamp="1" pointerEvents="none" opacity={0.14}>
              <text
                x={400}
                y={190}
                textAnchor="middle"
                fontSize={52}
                fontWeight={900}
                fill="#4A524C"
                fontFamily={FONT}
                transform="rotate(-18 400 190)"
                letterSpacing={4}
              >
                USED
              </text>
            </g>
          ) : null}
        </g>

        {/* outer stroke after mask so notches read cleanly */}
        <rect
          x={0.75}
          y={0.75}
          width={VB_W - 1.5}
          height={VB_H - 1.5}
          rx={g.rx}
          fill="none"
          stroke="#D5DDD7"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}

/** @deprecated Value mode type — use GiftCertificateVisualModel.valueMode */
export type GiftCertificateValueMode = "mall" | "wallet" | "used";
