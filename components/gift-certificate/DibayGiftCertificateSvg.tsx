"use client";

import { useId } from "react";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import { giftAmountFontSizeViewUnits } from "@/lib/gift-certificate/gift-certificate-format";
import type { GiftCertificateVisualModel } from "@/lib/gift-certificate/gift-certificate-visual-model";
import { GIFT_CERT_ASPECT_RATIO } from "@/lib/gift-certificate/gift-visual-layout";

export const DIBAY_LOGO_MARK_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

const VB_W = 1600;
const VB_H = 950;

function CalendarIcon({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`} aria-hidden="true">
      <rect x={0} y={size * 0.18} width={size} height={size * 0.78} rx={size * 0.12} fill="none" stroke={color} strokeWidth={size * 0.07} />
      <path d={`M${size * 0.2} 0 v${size * 0.28} M${size * 0.8} 0 v${size * 0.28}`} stroke={color} strokeWidth={size * 0.07} />
      <path d={`M0 ${size * 0.38} h${size}`} stroke={color} strokeWidth={size * 0.06} />
    </g>
  );
}

function ShieldIcon({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`} aria-hidden="true">
      <path
        d={`M${size * 0.5} ${size * 0.05} L${size * 0.92} ${size * 0.22} V${size * 0.52} C${size * 0.92} ${size * 0.78} ${size * 0.68} ${size * 0.95} ${size * 0.5} ${size} C${size * 0.32} ${size * 0.95} ${size * 0.08} ${size * 0.78} ${size * 0.08} ${size * 0.52} V${size * 0.22} Z`}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.07}
      />
      <path d={`M${size * 0.35} ${size * 0.52} L${size * 0.47} ${size * 0.64} L${size * 0.68} ${size * 0.4}`} fill="none" stroke={color} strokeWidth={size * 0.07} />
    </g>
  );
}

function RibbonIcon({ cx, cy, w }: { cx: number; cy: number; w: number }) {
  return (
    <g transform={`translate(${cx - w / 2}, ${cy - w * 0.35})`} aria-hidden="true">
      <rect x={w * 0.38} y={0} width={w * 0.24} height={w * 0.28} rx={w * 0.04} fill="#C9A84C" />
      <path d={`M${w * 0.32} ${w * 0.22} L${w * 0.18} ${w * 0.48} L${w * 0.38} ${w * 0.42} Z`} fill="#C9A84C" />
      <path d={`M${w * 0.68} ${w * 0.22} L${w * 0.82} ${w * 0.48} L${w * 0.62} ${w * 0.42} Z`} fill="#C9A84C" />
    </g>
  );
}

export function DibayGiftCertificateSvg({
  model,
}: {
  model: GiftCertificateVisualModel;
  priority?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const isCompact = model.variant === "compact";
  const amountSize = giftAmountFontSizeViewUnits(model.displayAmount.formatted);
  const validityY = isCompact ? 380 : 400;
  const securityY = model.validity ? (isCompact ? 500 : 500) : validityY;

  const ariaLabel = [
    model.title,
    `${model.displayAmount.amountLabel} ${model.displayAmount.formatted}`,
    model.validity ? `${model.validity.label} ${model.validity.display}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-gift-cert-face="1"
      data-gift-certificate-face="1"
      data-gift-brand-logo="dibay-logo-mark"
      data-gift-cert-variant={model.variant}
      className="relative w-full min-w-0 font-[inherit]"
      style={{ aspectRatio: GIFT_CERT_ASPECT_RATIO, containerType: "inline-size" }}
    >
      <svg
        data-gift-cert-artwork="1"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0B5A42" />
            <stop offset="45%" stopColor="#064A35" />
            <stop offset="100%" stopColor="#033427" />
          </linearGradient>
          <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F4E4A8" />
            <stop offset="40%" stopColor="#C9A84C" />
            <stop offset="100%" stopColor="#E8D08A" />
          </linearGradient>
          <linearGradient id={`${uid}-medallion`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0A4D38" />
            <stop offset="100%" stopColor="#052E22" />
          </linearGradient>
          <pattern id={`${uid}-diag`} width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="28" stroke="#FFFFFF" strokeOpacity="0.04" strokeWidth="1" />
          </pattern>
          <pattern id={`${uid}-corner`} width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="8" cy="8" r="1.2" fill="#FFFFFF" fillOpacity="0.06" />
          </pattern>
        </defs>

        {/* Base card */}
        <rect x="8" y="8" width={VB_W - 16} height={VB_H - 16} rx="44" fill={`url(#${uid}-bg)`} />
        <rect x="8" y="8" width={VB_W - 16} height={VB_H - 16} rx="44" fill={`url(#${uid}-diag)`} />
        <rect
          x="8"
          y="8"
          width={VB_W - 16}
          height={VB_H - 16}
          rx="44"
          fill="none"
          stroke={`url(#${uid}-gold)`}
          strokeWidth="3"
          data-gift-cert-border="1"
        />
        <rect
          x="22"
          y="22"
          width={VB_W - 44}
          height={VB_H - 44}
          rx="36"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.08"
          strokeWidth="1.5"
        />

        {/* Corner textures */}
        <rect x="900" y="0" width="700" height="420" fill={`url(#${uid}-corner)`} opacity="0.55" />
        {[0, 18, 36, 54, 72].map((o) => (
          <path
            key={o}
            d={`M -40 ${720 + o} C 180 ${660 + o}, 340 ${670 + o}, 520 ${720 + o}`}
            fill="none"
            stroke="#C9A84C"
            strokeWidth="1.2"
            opacity={0.22 - o * 0.002}
          />
        ))}
        <path
          d="M 1180 20 C 1280 80, 1380 60, 1520 30"
          fill="none"
          stroke="#C9A84C"
          strokeWidth="2"
          opacity="0.35"
          data-gift-cert-s-curve="1"
        />

        {/* LEFT — medallion + brand */}
        <g data-gift-cert-brand="1">
          <circle cx="320" cy="300" r="118" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="5" />
          <circle cx="320" cy="300" r="102" fill={`url(#${uid}-medallion)`} />
          <image
            data-gift-dibay-logo="1"
            href={DIBAY_LOGO_MARK_SRC}
            x="248"
            y="228"
            width="144"
            height="144"
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            x="320"
            y="470"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="72"
            fontWeight="700"
            letterSpacing="4"
          >
            DIBAY
          </text>
          <text
            x="320"
            y="520"
            textAnchor="middle"
            fill="#D4AF37"
            fontSize="22"
            fontWeight="600"
            letterSpacing="10"
          >
            GIFT CERTIFICATE
          </text>
          <line x1="180" y1="560" x2="460" y2="560" stroke="#C9A84C" strokeWidth="1.5" opacity="0.7" />
          <RibbonIcon cx={320} cy={560} w={48} />
        </g>

        {/* RIGHT — amount */}
        <g data-gift-cert-value-content="1">
          <line x1="820" y1="168" x2="900" y2="168" stroke="#C9A84C" strokeWidth="1.5" />
          <polygon points="910,168 918,162 918,174" fill="#C9A84C" />
          <text x="960" y="178" textAnchor="middle" fill="#D4AF37" fontSize="28" fontWeight="600">
            {model.displayAmount.amountLabel}
          </text>
          <line x1="1020" y1="168" x2="1100" y2="168" stroke="#C9A84C" strokeWidth="1.5" />
          <polygon points="1110,168 1118,162 1118,174" fill="#C9A84C" />

          <text
            data-gift-face-amount="1"
            data-gift-remaining-amount={model.displayAmount.kind === "REMAINING_BALANCE" ? "1" : undefined}
            x="960"
            y={isCompact ? 300 : 320}
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize={amountSize}
            fontWeight="700"
            fontFamily="inherit"
          >
            {model.displayAmount.formatted}
          </text>

          {model.displayAmount.secondaryFaceFormatted ? (
            <text x="960" y={isCompact ? 350 : 370} textAnchor="middle" fill="#FFFFFF" fillOpacity="0.75" fontSize="26">
              / {model.displayAmount.secondaryFaceFormatted}
            </text>
          ) : null}

          {model.validity ? (
            <>
              <rect
                data-gift-cert-value-panel="1"
                x="760"
                y={validityY}
                width="400"
                height={isCompact ? 72 : 82}
                rx="18"
                fill="#FFFFFF"
                fillOpacity="0.06"
                stroke="#FFFFFF"
                strokeOpacity="0.18"
              />
              <CalendarIcon x={790} y={validityY + (isCompact ? 22 : 22)} size={36} color="#D4AF37" />
              <text x="850" y={validityY + (isCompact ? 38 : 38)} fill="#D4AF37" fontSize="22" fontWeight="600">
                {model.validity.label}
              </text>
              <text
                data-gift-validity-display="1"
                data-gift-validity-rendered="1"
                x="850"
                y={validityY + (isCompact ? 68 : 68)}
                fill="#FFFFFF"
                fontSize="24"
                fontWeight="500"
              >
                {model.validity.display}
              </text>
            </>
          ) : (
            <g data-gift-validity-rendered="0" aria-hidden="true" />
          )}

          {!isCompact ? (
            <>
              <rect x="760" y={securityY} width="400" height="82" rx="18" fill="#FFFFFF" fillOpacity="0.06" stroke="#FFFFFF" strokeOpacity="0.18" />
              <ShieldIcon x={790} y={securityY + 22} size={36} color="#D4AF37" />
              <text x="850" y={securityY + 48} fill="#FFFFFF" fontSize="24" fontWeight="600">
                {model.securityTitle}
              </text>
              <text x="850" y={securityY + 76} fill="#FFFFFF" fillOpacity="0.78" fontSize="20">
                {model.securitySub}
              </text>
            </>
          ) : null}
        </g>

        {/* Bottom bar */}
        <line x1="40" y1="820" x2={VB_W - 40} y2="820" stroke="#C9A84C" strokeWidth="1.2" opacity="0.5" />
        <g data-gift-cert-footer="1">
          <text x="280" y="878" textAnchor="middle" fill="#FFFFFF" fillOpacity="0.92" fontSize="24" fontWeight="600">
            {model.title}
          </text>
          <text x="800" y="878" textAnchor="middle" fill="#FFFFFF" fillOpacity="0.78" fontSize="22">
            {model.useLikeCashLine}
          </text>
          <text x="1320" y="878" textAnchor="middle" fill="#FFFFFF" fillOpacity="0.78" fontSize="22">
            {model.scopeFooterLine}
          </text>
          <line x1="520" y1="848" x2="520" y2="908" stroke="#C9A84C" strokeOpacity="0.35" />
          <line x1="1060" y1="848" x2="1060" y2="908" stroke="#C9A84C" strokeOpacity="0.35" />
        </g>

        {/* Status overlay */}
        {model.statusOverlayLabel ? (
          <g data-gift-cert-status-overlay="1">
            <rect x="620" y="340" width="360" height="64" rx="12" fill="#000000" fillOpacity="0.45" />
            <text x="800" y="382" textAnchor="middle" fill="#FFFFFF" fontSize="28" fontWeight="700">
              {model.statusOverlayLabel}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
