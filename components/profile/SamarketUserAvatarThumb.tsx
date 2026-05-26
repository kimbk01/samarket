"use client";

import { SamarketThumbnail, type SamarketThumbnailProps } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

type Props = Omit<SamarketThumbnailProps, "src" | "fallbackSrc" | "fallbackNode"> & {
  avatarUrl?: string | null;
};

/** 사용자 프로필 썸네일 — 커스텀 사진 또는 앱 공통 기본 얼굴 */
export function SamarketUserAvatarThumb({ avatarUrl, ...rest }: Props) {
  return (
    <SamarketThumbnail
      {...rest}
      src={resolveUserAvatarImageSrc(avatarUrl)}
      fallbackSrc=""
      fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
    />
  );
}
