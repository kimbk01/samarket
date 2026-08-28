"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DIBAY_LOGO_MARK_PATH,
  dibayBrandAssetUrl,
} from "@/lib/brand/brand-asset-paths";
import {
  GIFT_HERO_ASPECT_CLASS,
  GIFT_HERO_ASPECT_COMPACT_CLASS,
} from "@/lib/gift-certificate/gift-visual-layout";

export const DIBAY_LOGO_MARK_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

const FACE_BG = {
  backgroundImage: [
    "radial-gradient(120% 90% at 8% 12%, rgba(255,255,255,0.10), transparent 46%)",
    "radial-gradient(80% 70% at 92% 88%, rgba(0,0,0,0.22), transparent 58%)",
    "repeating-linear-gradient(0deg, rgba(212,175,55,0.055) 0px, rgba(212,175,55,0.055) 1px, transparent 1px, transparent 5px)",
    "repeating-linear-gradient(98deg, transparent 0px, transparent 11px, rgba(255,255,255,0.025) 11px, rgba(255,255,255,0.025) 12px)",
    "linear-gradient(118deg, #06281c 0%, #0B421A 38%, #0a5c40 72%, #075740 100%)",
  ].join(", "),
  boxShadow: "inset 0 0 0 1px rgba(212,175,55,0.28)",
} as const;

/**
 * DIBAY digital stored-value certificate face.
 * Brand mark = canonical PNG (`dibay-logo-mark.png`). No logo SVG.
 */
export function DibayGiftCertificateFace({
  compact = false,
  valueSlot,
  identityLeft,
  priority = false,
}: {
  compact?: boolean;
  valueSlot: ReactNode;
  identityLeft: string;
  priority?: boolean;
}) {
  const { safeT } = useI18n();
  const aspectClass = compact ? GIFT_HERO_ASPECT_COMPACT_CLASS : GIFT_HERO_ASPECT_CLASS;
  const lockupSubtitle = safeT("gift_u2_card_lockup_subtitle", {
    fallbackKo: "GIFT CERTIFICATE",
    fallbackEn: "GIFT CERTIFICATE",
  });
  const digitalValue = safeT("gift_u2_card_digital_value", {
    fallbackKo: "DIGITAL VALUE",
    fallbackEn: "DIGITAL VALUE",
  });

  const markBox = compact
    ? "relative h-11 w-11 shrink-0 sm:h-12 sm:w-12"
    : "relative h-14 w-14 shrink-0 sm:h-[4.25rem] sm:w-[4.25rem]";
  const wordmarkClass = compact
    ? "text-[1.15rem] font-bold leading-none tracking-[0.08em] text-white sm:text-xl"
    : "text-[1.35rem] font-bold leading-none tracking-[0.1em] text-white sm:text-[1.75rem]";

  return (
    <div
      className={`relative min-h-[120px] w-full min-w-0 overflow-hidden ${aspectClass}`}
      style={FACE_BG}
      data-gift-certificate-face="1"
      data-gift-brand-logo="dibay-logo-mark"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <Image
          src={DIBAY_LOGO_MARK_SRC}
          alt=""
          width={240}
          height={228}
          unoptimized
          className="absolute -left-[4%] top-[6%] h-[78%] w-auto max-w-none opacity-[0.07]"
        />
        <Image
          src={DIBAY_LOGO_MARK_SRC}
          alt=""
          width={240}
          height={228}
          unoptimized
          className="absolute -right-[8%] bottom-[-18%] h-[70%] w-auto max-w-none opacity-[0.055]"
        />
        <div className="absolute inset-y-[-30%] left-[54%] w-[46%] rounded-[100%] border border-[#D4AF37]/28" />
        <div className="absolute inset-y-[-40%] -left-[22%] w-[38%] rounded-[100%] border border-[#D4AF37]/16" />
      </div>

      <div
        className={`relative flex h-full min-h-0 min-w-0 flex-col justify-between ${
          compact ? "px-3 py-2.5" : "px-3.5 py-3 sm:px-4 sm:py-3.5"
        }`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 items-stretch gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-[1.15] items-center gap-2 sm:gap-2.5">
            <div className={markBox}>
              <Image
                src={DIBAY_LOGO_MARK_SRC}
                alt=""
                fill
                unoptimized
                priority={priority}
                className="object-contain object-left"
                data-gift-dibay-logo="1"
              />
            </div>
            <div className="min-w-0">
              <p className={wordmarkClass}>DIBAY</p>
              <p className="mt-1 truncate text-[9px] font-semibold tracking-[0.22em] text-[#E4C56A] sm:text-[10px]">
                {lockupSubtitle}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-[0.85] items-center justify-end">
            {valueSlot}
          </div>
        </div>

        <div className="mt-1 flex min-w-0 items-end justify-between gap-2">
          <p className="min-w-0 truncate text-[10px] font-medium tracking-wide text-white/90 sm:text-[11px]">
            {identityLeft}
          </p>
          <p className="shrink-0 text-[9px] font-semibold tracking-[0.16em] text-[#E4C56A]/90 sm:text-[10px]">
            {digitalValue}
          </p>
        </div>
      </div>
    </div>
  );
}
