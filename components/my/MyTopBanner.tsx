"use client";

import Image from "next/image";
import type { MouseEvent } from "react";
import { DestinationLink } from "@/components/destination/DestinationLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MyPageBannerRow } from "@/lib/my/types";

export interface MyTopBannerProps {
  banner: MyPageBannerRow | null;
  onDismiss?: () => void;
}

export function MyTopBanner({ banner, onDismiss }: MyTopBannerProps) {
  const { t } = useI18n();
  if (!banner) return null;

  const handleDismiss = (e: MouseEvent<HTMLButtonElement>) => {
    // The close button sits inside the banner link — never let it navigate.
    e.preventDefault();
    e.stopPropagation();
    // 닫힘 기억은 배너 id 단위(호출부) — 전체 배너 영구 숨김(app_banner_hidden)으로 새 배너까지 막지 않는다 (v2.1 §6)
    onDismiss?.();
  };

  const content = (
    <div className="sam-card relative flex min-h-[72px] items-center gap-3 sam-card-pad">
      {banner.image_url && (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-sam-md bg-sam-surface-muted">
          <Image src={banner.image_url} alt="" fill className="object-cover" sizes="48px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="sam-text-body font-medium text-sam-fg">{banner.title}</p>
        {banner.description && (
          <p className="mt-0.5 sam-text-helper text-sam-muted">{banner.description}</p>
        )}
      </div>
      {banner.dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-sam-meta hover:bg-sam-surface-muted hover:text-sam-muted"
          aria-label={t("common_close")}
        >
          <span className="sam-text-page-title leading-none">×</span>
        </button>
      )}
    </div>
  );

  // EVT-07: stored link validated on save; opened via openDestination (external → in-app browser).
  return (
    <DestinationLink destination={banner.link_url} className="block" fallback={content}>
      {content}
    </DestinationLink>
  );
}
