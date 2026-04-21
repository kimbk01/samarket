"use client";

import type { AdminBanner } from "@/lib/types/admin-banner";

interface AdminBannerPreviewProps {
  banner: AdminBanner;
}

export function AdminBannerPreview({ banner }: AdminBannerPreviewProps) {
  const imgUrl = banner.mobileImageUrl || banner.imageUrl;
  return (
    <div className="max-w-[320px] rounded border border-sam-border bg-sam-app">
      <div className="aspect-[2/1] w-full overflow-hidden rounded-t bg-sam-surface-muted">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={banner.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center sam-text-body-secondary text-sam-meta">
            이미지 없음
          </div>
        )}
      </div>
      <div className="border-t border-sam-border px-3 py-2 sam-text-body-secondary text-sam-muted">
        {banner.title || "(제목 없음)"}
      </div>
    </div>
  );
}
