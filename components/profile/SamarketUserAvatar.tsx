"use client";

import Image from "next/image";
import { useState } from "react";
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

/**
 * 로드 실패한 사진 src — 같은 화면 세션에서 재시도하지 않는다(홈 카드 실패 → 수정 시트도 바로 기본 아바타).
 * 새 사진(다른 src)은 다시 시도.
 */
const failedAvatarSrcs = new Set<string>();

/**
 * 사용자 프로필 아바타 — 마이페이지 홈 카드·프로필 수정 시트·메신저 등 고정 px 원형 (단일 표시 경로).
 * src 판정 = `resolveUserAvatarImageSrc` → `resolveProfileImageSrc` (문자열만, 네트워크 0 · real-screen-redesign §14).
 * `unoptimized` — 크기와 무관하게 **같은 URL 1개**를 그려 홈·시트가 브라우저 캐시를 공유한다.
 * 로드 실패(onError) → DIBAY 기본 아바타, 재시도 없음.
 */
export function SamarketUserAvatar({
  avatarUrl,
  alt = "",
  sizePx,
  className = "",
  innerClassName = "",
  badge = "none",
}: Props) {
  const customSrc = resolveUserAvatarImageSrc(avatarUrl);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showCustomImage = Boolean(customSrc) && failedSrc !== customSrc && !failedAvatarSrcs.has(customSrc!);
  const showVerified = badge === "verified" && hasCustomUserAvatar(avatarUrl) && showCustomImage;

  return (
    <span
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: sizePx, height: sizePx }}
    >
      <span className={`absolute inset-0 overflow-hidden rounded-full bg-sam-primary-soft ${innerClassName}`}>
        {showCustomImage ? (
          <Image
            src={customSrc!}
            alt={alt}
            fill
            className="object-cover"
            sizes={`${sizePx}px`}
            unoptimized
            onError={() => {
              failedAvatarSrcs.add(customSrc!);
              setFailedSrc(customSrc);
            }}
          />
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
