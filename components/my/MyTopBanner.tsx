"use client";

import Image from "next/image";
import Link from "next/link";
import type { MyPageBannerRow } from "@/lib/my/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { updateMySettings } from "@/lib/my/updateMySettings";

export interface MyTopBannerProps {
  banner: MyPageBannerRow | null;
  onDismiss?: () => void;
}

export function MyTopBanner({ banner, onDismiss }: MyTopBannerProps) {
  if (!banner) return null;

  const handleDismiss = () => {
    const userId = getCurrentUser()?.id;
    if (userId) {
      updateMySettings(userId, { app_banner_hidden: true });
      onDismiss?.();
    }
  };

  const content = (
    <div className="relative flex min-h-[72px] items-center gap-3 rounded-ui-rect bg-sam-surface p-3 shadow-sm">
      {banner.image_url && (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
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
          aria-label="닫기"
        >
          <span className="sam-text-page-title leading-none">×</span>
        </button>
      )}
    </div>
  );

  if (banner.link_url) {
    return (
      <Link href={banner.link_url} className="block">
        {content}
      </Link>
    );
  }
  return content;
}
