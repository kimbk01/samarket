"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import {
  GIFT_CERT_CHAMPAGNE_GOLD,
  GIFT_CERT_DARK_PANEL,
  GIFT_CERT_DEEP_GREEN,
  GIFT_CERT_FOOTER_BG,
  GIFT_CERT_WARM_GOLD,
  GIFT_HERO_ASPECT_CLASS,
  GIFT_HERO_ASPECT_COMPACT_CLASS,
} from "@/lib/gift-certificate/gift-visual-layout";

export const DIBAY_LOGO_MARK_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

function GiftCertificateGuillocheDecor({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 660 400"
      preserveAspectRatio="none"
      aria-hidden
    >
      {[
        "M-30 380 C80 340 140 260 220 200 C300 140 380 100 480 60 C560 30 620 10 700 0",
        "M-50 400 C60 355 130 270 210 210 C290 150 370 115 470 75 C550 45 610 25 720 10",
        "M40 420 C120 380 200 300 280 240 C360 180 440 140 540 95",
        "M100 -20 C90 60 110 140 130 220 C150 300 170 360 190 420",
        "M0 120 C100 100 180 80 280 70 C380 60 480 55 580 50",
      ].map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={GIFT_CERT_WARM_GOLD}
          strokeWidth={i < 2 ? 0.9 : 0.55}
          opacity={0.06 + (i % 3) * 0.025}
        />
      ))}
    </svg>
  );
}

function GiftCertificateGoldSCurve({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 z-[15] h-full w-full ${className}`}
      viewBox="0 0 660 400"
      preserveAspectRatio="none"
      aria-hidden
      data-gift-cert-s-curve="1"
    >
      <path
        d="M 468 0 C 508 72, 498 148, 438 208 C 378 268, 318 308, 248 360 C 198 396, 148 400, 88 400"
        fill="none"
        stroke={GIFT_CERT_CHAMPAGNE_GOLD}
        strokeWidth="1.35"
        opacity="0.82"
      />
      <path
        d="M 486 0 C 524 78, 514 158, 454 218 C 394 278, 334 318, 264 370 C 214 404, 164 408, 104 408"
        fill="none"
        stroke={GIFT_CERT_WARM_GOLD}
        strokeWidth="0.75"
        opacity="0.42"
      />
    </svg>
  );
}

function GiftBadgeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M12 9V20M4 9h16M12 9c-2.5-3-5-3-7 0M12 9c2.5-3 5-3 7 0" />
    </svg>
  );
}

function FooterGlyph({
  kind,
  className = "",
}: {
  kind: "store" | "gift" | "shield" | "clock";
  className?: string;
}) {
  const common = `h-[15px] w-[15px] shrink-0 sm:h-4 sm:w-4 ${className}`;
  if (kind === "store") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 10 12 4l8 6v10H4V10Z" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (kind === "gift") return <GiftBadgeIcon className={common} />;
  if (kind === "shield") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 3 20 7v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4Z" />
        <path d="M9.5 12.5 11.5 14.5 15.5 10.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

export function DibayGiftCertificateFace({
  compact = false,
  valueSlot,
  priority = false,
}: {
  compact?: boolean;
  valueSlot: ReactNode;
  identityLeft?: string;
  priority?: boolean;
}) {
  const { safeT } = useI18n();
  const aspectClass = compact ? GIFT_HERO_ASPECT_COMPACT_CLASS : GIFT_HERO_ASPECT_CLASS;
  const lockupSubtitle = safeT("gift_u2_card_lockup_subtitle", {
    fallbackKo: "GIFT CERTIFICATE",
    fallbackEn: "GIFT CERTIFICATE",
  });
  const identityTitle = safeT("gift_u2_card_identity", {
    fallbackKo: "디바이 상품권",
    fallbackEn: "DIBAY Gift Certificate",
  });
  const identitySub = safeT("gift_u2_card_use_like_cash", {
    fallbackKo: "DIBAY에서 현금처럼 사용하세요.",
    fallbackEn: "Use it like cash at DIBAY.",
  });
  const footerItems = [
    {
      kind: "store" as const,
      title: safeT("gift_u2_card_footer_store_title", { fallbackKo: "전 매장 사용 가능", fallbackEn: "All stores" }),
      sub: safeT("gift_u2_card_footer_store_sub", {
        fallbackKo: "DIBAY 이용 가능 매장에서 사용",
        fallbackEn: "Usable at DIBAY stores",
      }),
    },
    {
      kind: "gift" as const,
      title: safeT("gift_u2_card_footer_gift_title", { fallbackKo: "선물 가능", fallbackEn: "Transferable" }),
      sub: safeT("gift_u2_card_footer_gift_sub", {
        fallbackKo: "친구에게 선물할 수 있어요",
        fallbackEn: "Send to friends",
      }),
    },
    {
      kind: "shield" as const,
      title: safeT("gift_u2_card_footer_secure_title", {
        fallbackKo: "안전한 디지털 상품권",
        fallbackEn: "Secure digital certificate",
      }),
      sub: safeT("gift_u2_card_footer_secure_sub", {
        fallbackKo: "보안이 적용된 안심 상품권",
        fallbackEn: "Protected certificate",
      }),
    },
    {
      kind: "clock" as const,
      title: safeT("gift_u2_card_footer_validity_title", { fallbackKo: "유효기간", fallbackEn: "Validity" }),
      sub: safeT("gift_u2_card_footer_validity_sub", { fallbackKo: "만료되지 않음", fallbackEn: "Never expires" }),
    },
  ];
  const logoSize = compact
    ? "h-[2.75rem] w-[2.75rem] min-w-[2.75rem] sm:h-12 sm:w-12"
    : "h-[4.25rem] w-[4.25rem] min-w-[4.25rem] sm:h-[5.5rem] sm:w-[5.5rem] sm:min-w-[5.5rem]";
  const wordmark = compact
    ? "text-xl font-bold tracking-[0.07em] text-white sm:text-[1.35rem]"
    : "text-[1.65rem] font-bold tracking-[0.09em] text-white sm:text-[2.15rem]";
  const lockupTrack = compact
    ? "text-[7px] font-semibold tracking-[0.22em] sm:text-[8px]"
    : "text-[8px] font-semibold tracking-[0.26em] sm:text-[10px]";
  const showFooter = !compact;
  const mainBodyH = showFooter ? "h-[72%]" : "h-full";
  const footerH = showFooter ? "h-[28%] min-h-[4.5rem] sm:min-h-[4.75rem]" : "h-0 overflow-hidden opacity-0";

  return (
    <div
      className={`relative min-h-[120px] w-full min-w-0 overflow-hidden rounded-ui-rect ${aspectClass}`}
      style={{ backgroundColor: GIFT_CERT_DEEP_GREEN }}
      data-gift-certificate-face="1"
      data-gift-brand-logo="dibay-logo-mark"
    >
      <div className="absolute inset-0 bg-[linear-gradient(148deg,#043322_0%,#0B421A_38%,#0a5c40_88%)]" aria-hidden />
      <div className="pointer-events-none absolute left-0 top-0 h-[48%] w-[52%] overflow-hidden opacity-[0.055]" aria-hidden>
        <div
          className="h-full w-full"
          style={{ backgroundImage: `url(${DIBAY_LOGO_MARK_SRC})`, backgroundSize: "24%", backgroundRepeat: "repeat" }}
        />
      </div>
      <GiftCertificateGuillocheDecor />
      <div
        className="pointer-events-none absolute bottom-0 right-0 top-0 w-[40%] sm:w-[39%]"
        style={{ background: `linear-gradient(180deg, ${GIFT_CERT_DARK_PANEL} 0%, #011810 100%)` }}
        aria-hidden
        data-gift-cert-value-panel="1"
      />
      <GiftCertificateGoldSCurve />
      <div
        className={`absolute z-30 flex max-w-[46%] items-center gap-1.5 border border-[#E8D5A8]/55 bg-[linear-gradient(180deg,#F3E2B8_0%,#C5A572_52%,#A8884E_100%)] shadow-[0_2px_8px_rgba(0,0,0,0.22)] ${
          compact ? "right-1.5 top-1.5 rounded-full px-2 py-0.5" : "right-0 top-0 rounded-bl-[1.25rem] rounded-tr-ui-rect px-2.5 py-1.5 sm:px-3"
        }`}
        data-gift-cert-top-badge="1"
      >
        <GiftBadgeIcon className={`shrink-0 text-[#0B421A] ${compact ? "h-3 w-3" : "h-4 w-4 sm:h-[18px] sm:w-[18px]"}`} />
        <div className="min-w-0 leading-none">
          <p className={`truncate font-bold tracking-wide text-[#0B421A] ${compact ? "text-[8px]" : "text-[9px] sm:text-[10px]"}`}>DIBAY</p>
          <p className={`truncate font-semibold tracking-[0.12em] text-[#0B421A]/88 ${compact ? "text-[5px]" : "text-[6px] sm:text-[7px]"}`}>
            GIFT CERTIFICATE
          </p>
        </div>
      </div>
      <div className={`relative z-20 flex min-h-0 flex-col ${mainBodyH}`}>
        <div className="grid min-h-0 flex-1 grid-cols-[58%_42%]">
          <div className="flex min-w-0 flex-col justify-between px-2.5 pb-1.5 pt-2.5 sm:px-4 sm:pb-2 sm:pt-3.5">
            <div className="flex min-w-0 items-start gap-2 sm:gap-3">
              <div className={`relative shrink-0 ${logoSize}`}>
                <Image
                  src={DIBAY_LOGO_MARK_SRC}
                  alt=""
                  fill
                  unoptimized
                  priority={priority}
                  className="object-contain object-left-top drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                  data-gift-dibay-logo="1"
                />
              </div>
              <div className="min-w-0 pt-0.5 sm:pt-1">
                <p className={wordmark}>DIBAY</p>
                <p className={`mt-0.5 truncate text-[#E4C56A] ${lockupTrack}`}>{lockupSubtitle}</p>
              </div>
            </div>
            {!compact ? (
              <div className="mt-auto min-w-0 pt-2 sm:pt-3">
                <p className="truncate text-[11px] font-semibold text-[#E4C56A] sm:text-xs">{identityTitle}</p>
                <p className="mt-0.5 line-clamp-2 text-[9px] leading-snug text-white/88 sm:text-[10px]">{identitySub}</p>
              </div>
            ) : null}
          </div>
          <div className={`relative z-20 flex min-w-0 items-center justify-end pr-2 sm:pr-3 ${compact ? "pb-1 pt-6" : "pb-2 pt-8 sm:pt-9"}`}>
            {valueSlot}
          </div>
        </div>
      </div>
      <div
        className={`absolute inset-x-0 bottom-0 z-20 grid grid-cols-2 border-t sm:grid-cols-4 ${footerH}`}
        style={{ borderColor: "rgba(228, 197, 106, 0.22)", backgroundColor: GIFT_CERT_FOOTER_BG }}
        data-gift-cert-footer="1"
      >
        {footerItems.map((item, idx) => (
          <div
            key={item.kind}
            className={`flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center sm:gap-1 sm:px-1.5 sm:py-2 ${
              idx % 2 === 1 ? "border-l border-[#E4C56A]/12" : ""
            } ${idx >= 2 ? "border-t border-[#E4C56A]/12 sm:border-t-0" : ""} ${
              idx > 0 ? "sm:border-l sm:border-[#E4C56A]/12" : ""
            }`}
          >
            <FooterGlyph kind={item.kind} className="text-[#E4C56A]" />
            <p className="w-full truncate text-[7px] font-semibold leading-tight text-[#E4C56A] sm:text-[8px]">{item.title}</p>
            <p className="line-clamp-2 w-full text-[6px] leading-tight text-white/78 sm:text-[7px]">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
