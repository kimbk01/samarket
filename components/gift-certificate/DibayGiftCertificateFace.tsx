"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_LOGO_MARK_PATH, dibayBrandAssetUrl } from "@/lib/brand/brand-asset-paths";
import type { GiftCertificateFaceVariant } from "@/lib/gift-certificate/gift-visual-layout";
import { GIFT_CERT_ASPECT_RATIO } from "@/lib/gift-certificate/gift-visual-layout";
import { formatMoneyPhp } from "@/lib/utils/format";

export const DIBAY_LOGO_MARK_SRC = dibayBrandAssetUrl(DIBAY_LOGO_MARK_PATH);

export type GiftCertificateValueMode = "mall" | "wallet" | "used";

function GiftCertificateArtwork() {
  return (
    <svg
      data-gift-cert-artwork
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1600 960"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gift-left-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#075D43" />
          <stop offset="45%" stopColor="#004832" />
          <stop offset="100%" stopColor="#003626" />
        </linearGradient>
        <linearGradient id="gift-value-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#003B2B" />
          <stop offset="100%" stopColor="#001F17" />
        </linearGradient>
        <linearGradient id="gift-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF0A8" />
          <stop offset="25%" stopColor="#E9C75D" />
          <stop offset="60%" stopColor="#C99D31" />
          <stop offset="100%" stopColor="#FFE78C" />
        </linearGradient>
        <pattern id="gift-security" width="76" height="76" patternUnits="userSpaceOnUse">
          <path
            d="M-20 38 C0 5 20 5 38 38 S76 71 96 38"
            fill="none"
            stroke="#9CCDB5"
            strokeWidth="0.8"
            opacity="0.10"
          />
          <path
            d="M38 -20 C5 0 5 20 38 38 S71 76 38 96"
            fill="none"
            stroke="#9CCDB5"
            strokeWidth="0.6"
            opacity="0.07"
          />
        </pattern>
      </defs>

      <rect x="0" y="0" width="1600" height="960" fill="url(#gift-left-bg)" />
      <rect x="0" y="0" width="1600" height="760" fill="url(#gift-security)" />

      <path
        data-gift-cert-value-panel="1"
        d="
          M 1055 0
          H 1600
          V 760
          H 655
          C 820 690, 910 605, 962 498
          C 1015 390, 1000 210, 1055 0
          Z
        "
        fill="url(#gift-value-bg)"
      />

      <path
        data-gift-cert-s-curve="1"
        d="
          M 1220 -35
          C 1070 40, 1038 145, 1027 255
          C 1009 437, 980 548, 875 635
          C 770 720, 635 714, 485 655
          C 324 590, 205 575, 25 620
        "
        fill="none"
        stroke="url(#gift-gold)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="
          M 1213 -18
          C 1064 52, 1047 156, 1035 266
          C 1018 442, 989 557, 881 645
          C 766 739, 625 730, 475 671
          C 307 605, 191 598, -10 650
        "
        fill="none"
        stroke="#FFF5C8"
        strokeOpacity="0.42"
        strokeWidth="1.4"
      />

      {[0, 10, 20, 30, 40, 50, 60, 70].map((offset) => (
        <path
          key={offset}
          d={`
            M -30 ${615 + offset}
            C 165 ${540 + offset},
              300 ${545 + offset},
              474 ${615 + offset}
            C 610 ${670 + offset},
              725 ${675 + offset},
              870 ${635 + offset}
          `}
          fill="none"
          stroke="#DAAF3F"
          strokeWidth="0.85"
          opacity={0.18 - offset * 0.001}
        />
      ))}

      {[0, 13, 26, 39, 52].map((offset) => (
        <path
          key={`r-${offset}`}
          d={`
            M 1080 ${665 + offset}
            C 1195 ${620 + offset},
              1300 ${620 + offset},
              1405 ${665 + offset}
            C 1500 ${705 + offset},
              1550 ${700 + offset},
              1640 ${660 + offset}
          `}
          fill="none"
          stroke="#5AA485"
          strokeWidth="1"
          opacity="0.20"
        />
      ))}

      <line x1="0" y1="760" x2="1600" y2="760" stroke="#CBA037" strokeWidth="1.5" opacity="0.65" />

      <rect data-gift-cert-footer-bg="1" x="0" y="760" width="1600" height="200" fill="#00422F" />

      <line x1="400" y1="800" x2="400" y2="920" stroke="#CBA037" strokeWidth="1.2" opacity="0.65" />
      <line x1="800" y1="800" x2="800" y2="920" stroke="#CBA037" strokeWidth="1.2" opacity="0.65" />
      <line x1="1200" y1="800" x2="1200" y2="920" stroke="#CBA037" strokeWidth="1.2" opacity="0.65" />

      <path
        data-gift-cert-top-badge="1"
        d="
          M 1135 42
          H 1600
          V 150
          H 1135
          C 1088 150 1060 129 1060 96
          C 1060 63 1088 42 1135 42
          Z
        "
        fill="url(#gift-gold)"
      />

      <rect
        x="2"
        y="2"
        width="1596"
        height="956"
        rx="38"
        fill="none"
        stroke="#DAB84B"
        strokeOpacity="0.68"
        strokeWidth="2"
      />
    </svg>
  );
}

function GiftBadgeIcon({ style }: { style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ width: "2.35cqw", height: "2.35cqw", flexShrink: 0, ...style }}
    >
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M12 9V20M4 9h16M12 9c-2.5-3-5-3-7 0M12 9c2.5-3 5-3 7 0" />
    </svg>
  );
}

function FooterGlyph({ kind }: { kind: "store" | "gift" | "shield" | "clock" }) {
  const common = { width: "2.1cqw", height: "2.1cqw", flexShrink: 0, color: "#E7C158" } as const;
  if (kind === "store") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" style={common}>
        <path d="M4 10 12 4l8 6v10H4V10Z" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (kind === "gift") return <GiftBadgeIcon style={common} />;
  if (kind === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" style={common}>
        <path d="M12 3 20 7v6c0 4.5-3.5 7.5-8 8-4.5-.5-8-3.5-8-8V7l8-4Z" />
        <path d="M9.5 12.5 11.5 14.5 15.5 10.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" style={common}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

function MallValueContent({
  face,
  purchase,
  faceLabel,
  purchaseLabel,
}: {
  face: number;
  purchase: number | null;
  faceLabel: string;
  purchaseLabel: string;
}) {
  return (
    <>
      <div style={{ fontSize: "2.15cqw", lineHeight: 1, fontWeight: 600, color: "#E9C75D", whiteSpace: "nowrap" }}>
        {faceLabel}
      </div>
      <div
        data-gift-face-amount="1"
        style={{
          marginTop: "2.2cqw",
          fontSize: "7.0cqw",
          lineHeight: 0.88,
          fontWeight: 700,
          letterSpacing: "-0.045em",
          color: "#FFFFFF",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatMoneyPhp(face)}
      </div>
      {purchase != null ? (
        <>
          <div
            data-gift-gold-divider="1"
            style={{
              position: "relative",
              marginTop: "2.25cqw",
              marginLeft: "auto",
              width: "100%",
              height: "1px",
              background: "linear-gradient(90deg,#C89C2E,#F5DE83,#C89C2E)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: "0.55cqw",
                height: "0.55cqw",
                background: "#E4BD4D",
                transform: "translate(-50%,-50%) rotate(45deg)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: "2.1cqw",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "baseline",
              gap: "1.15cqw",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "#E9C75D", fontSize: "2.0cqw", fontWeight: 500 }}>{purchaseLabel}</span>
            <span
              data-gift-purchase-amount="1"
              style={{
                color: "#FFFFFF",
                fontSize: "2.25cqw",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMoneyPhp(purchase)}
            </span>
          </div>
        </>
      ) : null}
    </>
  );
}

function WalletValueContent({
  remaining,
  face,
  balanceLabel,
}: {
  remaining: number;
  face: number | null;
  balanceLabel: string;
}) {
  return (
    <>
      <div style={{ fontSize: "2.15cqw", lineHeight: 1, fontWeight: 600, color: "#E9C75D", whiteSpace: "nowrap" }}>
        {balanceLabel}
      </div>
      <div
        data-gift-remaining-amount="1"
        style={{
          marginTop: "2.2cqw",
          fontSize: "7.0cqw",
          lineHeight: 0.88,
          fontWeight: 700,
          letterSpacing: "-0.045em",
          color: "#FFFFFF",
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatMoneyPhp(remaining)}
      </div>
      {face != null && face !== remaining ? (
        <div
          style={{
            marginTop: "1.4cqw",
            fontSize: "2.0cqw",
            fontWeight: 500,
            color: "rgba(255,255,255,0.82)",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          / {formatMoneyPhp(face)}
        </div>
      ) : null}
    </>
  );
}

function UsedValueContent({ face, usedLabel }: { face: number | null; usedLabel: string }) {
  return (
    <>
      <div
        style={{
          fontSize: "3.2cqw",
          lineHeight: 1,
          fontWeight: 700,
          color: "rgba(255,255,255,0.92)",
          whiteSpace: "nowrap",
        }}
      >
        {usedLabel}
      </div>
      {face != null ? (
        <div
          style={{
            marginTop: "2cqw",
            fontSize: "5.5cqw",
            lineHeight: 0.9,
            fontWeight: 700,
            color: "rgba(255,255,255,0.78)",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatMoneyPhp(face)}
        </div>
      ) : null}
    </>
  );
}

export function DibayGiftCertificateFace({
  variant = "standard",
  valueMode = "mall",
  faceValue = null,
  purchasePrice = null,
  remainingBalance = null,
  valueSlot,
  priority = false,
  hideFooter = false,
}: {
  variant?: GiftCertificateFaceVariant;
  valueMode?: GiftCertificateValueMode;
  faceValue?: number | null;
  purchasePrice?: number | null;
  remainingBalance?: number | null;
  valueSlot?: ReactNode;
  priority?: boolean;
  hideFooter?: boolean;
}) {
  const { safeT } = useI18n();
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
  const hideFooterSub = variant === "compact";
  const showFooter = !hideFooter;
  const showSupportCopy = variant !== "compact";
  const showBadgeSubline = variant !== "compact";

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

  const faceLabel = safeT("commerce_hub_gift_face_label", {
    fallbackKo: "상품권 금액",
    fallbackEn: "Gift certificate amount",
  });
  const purchaseLabel = safeT("commerce_hub_gift_purchase_label", {
    fallbackKo: "구매가",
    fallbackEn: "Purchase price",
  });
  const balanceLabel = safeT("gift_u2_wallet_remaining", {
    fallbackKo: "잔액",
    fallbackEn: "Balance",
  });
  const usedLabel = safeT("commerce_hub_used_completed", {
    fallbackKo: "사용 완료",
    fallbackEn: "Fully used",
  });

  const valueContent =
    valueSlot ??
    (valueMode === "mall" && faceValue != null ? (
      <MallValueContent
        face={faceValue}
        purchase={purchasePrice}
        faceLabel={faceLabel}
        purchaseLabel={purchaseLabel}
      />
    ) : valueMode === "wallet" && remainingBalance != null ? (
      <WalletValueContent remaining={remainingBalance} face={faceValue} balanceLabel={balanceLabel} />
    ) : valueMode === "used" ? (
      <UsedValueContent face={faceValue} usedLabel={usedLabel} />
    ) : faceValue != null ? (
      <WalletValueContent remaining={faceValue} face={null} balanceLabel={faceLabel} />
    ) : null);

  return (
    <div
      data-gift-cert-face="1"
      data-gift-certificate-face="1"
      data-gift-brand-logo="dibay-logo-mark"
      data-gift-cert-variant={variant}
      className="relative w-full min-w-0 overflow-hidden rounded-[2.4%] font-[inherit]"
      style={{
        aspectRatio: GIFT_CERT_ASPECT_RATIO,
        containerType: "inline-size",
      }}
    >
      <GiftCertificateArtwork />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute" style={{ left: "6.4%", top: "19%", width: "15.5%", aspectRatio: "1" }}>
          <Image
            data-gift-dibay-logo="1"
            src={DIBAY_LOGO_MARK_SRC}
            alt=""
            fill
            unoptimized
            priority={priority}
            sizes="480px"
            className="object-contain"
          />
        </div>

        <div data-gift-cert-brand="1" className="absolute" style={{ left: "21.5%", top: "21%", width: "35%" }}>
          <div
            style={{
              fontSize: "6.1cqw",
              lineHeight: 0.92,
              letterSpacing: "0.015em",
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            DIBAY
          </div>
          <div
            style={{
              marginTop: "1.1cqw",
              fontSize: "1.72cqw",
              letterSpacing: "0.34em",
              color: "#E7C158",
              whiteSpace: "nowrap",
            }}
          >
            {lockupSubtitle}
          </div>
        </div>

        {showSupportCopy ? (
          <div className="absolute" style={{ left: "9.4%", top: "66%", width: "34%" }}>
            <div style={{ fontSize: "1.75cqw", fontWeight: 600, color: "#E7C158" }}>{identityTitle}</div>
            <div
              style={{
                marginTop: "0.65cqw",
                fontSize: "1.25cqw",
                fontWeight: 400,
                color: "rgba(255,255,255,.92)",
                whiteSpace: "nowrap",
              }}
            >
              {identitySub}
            </div>
          </div>
        ) : null}

        <div
          data-gift-cert-value-content="1"
          className="absolute text-right"
          style={{ right: "6.4%", top: "29%", width: "31%" }}
        >
          {valueContent}
        </div>

        <div
          className="absolute flex items-center"
          style={{
            left: "71.2%",
            top: "5.4%",
            width: "26.5%",
            height: "10.2%",
            gap: "1.3cqw",
            color: "#063C2C",
          }}
        >
          <GiftBadgeIcon />
          <div>
            <div
              style={{
                fontSize: "1.55cqw",
                fontWeight: 700,
                letterSpacing: "0.18em",
                whiteSpace: "nowrap",
              }}
            >
              DIBAY
            </div>
            {showBadgeSubline ? (
              <div
                style={{
                  marginTop: "0.25cqw",
                  fontSize: "1.0cqw",
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  whiteSpace: "nowrap",
                }}
              >
                GIFT CERTIFICATE
              </div>
            ) : null}
          </div>
        </div>

        {showFooter ? (
          <div
            data-gift-cert-footer="1"
            className="gift-cert-footer-grid absolute left-0 right-0 grid"
            style={{ top: "79.16%", height: "20.84%" }}
          >
            {footerItems.map((item) => (
              <div
                key={item.kind}
                className="flex flex-col items-center justify-center gap-[0.35cqw] px-[0.5cqw] text-center"
              >
                <FooterGlyph kind={item.kind} />
                <p style={{ fontSize: "1.15cqw", fontWeight: 600, lineHeight: 1.15, color: "#E7C158" }}>
                  {item.title}
                </p>
                {!hideFooterSub ? (
                  <p style={{ fontSize: "0.78cqw", fontWeight: 400, lineHeight: 1.2, color: "rgba(255,255,255,0.78)" }}>
                    {item.sub}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
