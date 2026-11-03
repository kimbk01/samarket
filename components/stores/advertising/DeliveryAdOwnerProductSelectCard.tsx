"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DELIVERY_AD_DESIGN_BOARD } from "@/lib/stores/advertising/delivery-ad-design-board-contract";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

void DELIVERY_AD_DESIGN_BOARD;

function StoreSponsoredIcon() {
  return (
    <svg className="h-10 w-10 shrink-0" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="4" y="8" width="32" height="24" rx="4" fill="var(--sam-primary-soft)" stroke="var(--sam-primary)" strokeWidth="1.5" />
      <rect x="10" y="14" width="20" height="3" rx="1" fill="var(--sam-primary)" opacity="0.7" />
      <rect x="10" y="20" width="14" height="2" rx="1" fill="#757575" />
      <rect x="10" y="24" width="10" height="2" rx="1" fill="#757575" />
    </svg>
  );
}

function BannerIcon() {
  return (
    <svg className="h-10 w-10 shrink-0" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="4" y="10" width="32" height="18" rx="4" fill="#FFF3E0" stroke="#FF8A00" strokeWidth="1.5" />
      <rect x="8" y="14" width="24" height="10" rx="2" fill="#FF8A00" opacity="0.35" />
      <text x="20" y="22" textAnchor="middle" fill="#FF8A00" fontSize="7" fontWeight="700">
        AD
      </text>
    </svg>
  );
}

function PopupIcon() {
  return (
    <svg className="h-10 w-10 shrink-0" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="6" y="6" width="28" height="28" rx="4" fill="#E3F2FD" stroke="#1565C0" strokeWidth="1.5" />
      <rect x="10" y="12" width="20" height="14" rx="2" fill="#1565C0" opacity="0.35" />
      <circle cx="30" cy="10" r="4" fill="#1565C0" />
    </svg>
  );
}

export function DeliveryAdOwnerProductSelectCard({
  href,
  productKind,
  title,
  description,
  ctaLabel,
  onNavigate,
}: {
  href: string;
  productKind: "store_sponsored" | "banner" | "platform_popup";
  title: string;
  description: string;
  ctaLabel: string;
  onNavigate?: () => void;
}) {
  const icon: ReactNode =
    productKind === "banner" ? (
      <BannerIcon />
    ) : productKind === "platform_popup" ? (
      <PopupIcon />
    ) : (
      <StoreSponsoredIcon />
    );

  return (
    <Link
      href={href}
      className={OverlayUi.selectCard}
      onClick={onNavigate}
      data-owner-ads-product-card={productKind}
      data-owner-ads-product-card-design-board="1"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--overlay-body-1-size)] font-semibold text-[color:var(--overlay-text-primary)]">{title}</p>
        <p className={`mt-2 ${OverlayUi.bodySecondary}`}>{description}</p>
        <span className="mt-3 inline-flex min-h-[40px] items-center rounded-[length:var(--overlay-radius-md)] bg-[color:var(--overlay-primary)] px-4 text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-surface)]">
          {ctaLabel}
        </span>
      </div>
    </Link>
  );
}
