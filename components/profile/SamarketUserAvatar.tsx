"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { hasCustomUserAvatar, resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

type Props = {
  avatarUrl?: string | null;
  alt?: string;
  sizePx: number;
  className?: string;
  innerClassName?: string;
  /** 커스텀 업로드 사진일 때만 우하단 인증 체크 */
  badge?: "none" | "verified";
};

/** 사용자 프로필 아바타 — 마이페이지·편집 등 고정 px 원형 */
export function SamarketUserAvatar({
  avatarUrl,
  alt = "",
  sizePx,
  className = "",
  innerClassName = "",
  badge = "none",
}: Props) {
  const customSrc = resolveUserAvatarImageSrc(avatarUrl);
  const showVerified = badge === "verified" && hasCustomUserAvatar(avatarUrl);

  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: sizePx, height: sizePx }}
    >
      <span className={`absolute inset-0 overflow-hidden rounded-full bg-sam-primary-soft ${innerClassName}`}>
        {customSrc ? (
          <Image src={customSrc} alt={alt} fill className="object-cover" sizes={`${sizePx}px`} />
        ) : (
          <SamarketDefaultAvatarFace className="h-full w-full" />
        )}
      </span>
      {showVerified ? (
        <span
          className="absolute bottom-0 right-0 z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 border-sam-surface bg-sam-primary"
          aria-hidden
        >
          <Check className="h-4 w-4 text-sam-on-primary" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}
