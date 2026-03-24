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
    <div className="relative flex min-h-[72px] items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
      {banner.image_url && (
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          <Image src={banner.image_url} alt="" fill className="object-cover" sizes="48px" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-gray-900">{banner.title}</p>
        {banner.description && (
          <p className="mt-0.5 text-[12px] text-gray-500">{banner.description}</p>
        )}
      </div>
      {banner.dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="닫기"
        >
          <span className="text-[18px] leading-none">×</span>
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
