"use client";

import type { AdminBanner } from "@/lib/types/admin-banner";

interface AdminBannerPreviewProps {
  banner: AdminBanner;
}

export function AdminBannerPreview({ banner }: AdminBannerPreviewProps) {
  const imgUrl = banner.mobileImageUrl || banner.imageUrl;
  return (
    <div className="max-w-[320px] rounded border border-gray-200 bg-gray-50">
      <div className="aspect-[2/1] w-full overflow-hidden rounded-t bg-gray-100">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={banner.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-gray-400">
            이미지 없음
          </div>
        )}
      </div>
      <div className="border-t border-gray-200 px-3 py-2 text-[13px] text-gray-600">
        {banner.title || "(제목 없음)"}
      </div>
    </div>
  );
}
