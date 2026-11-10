"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GROUP_IMAGE_PLACEHOLDER_MARKER } from "@/lib/messenger/group/domain";

/**
 * Group identity avatar — group image URL or group-only placeholder.
 * Never uses participant avatar, user DefaultAvatarFace, or title-initial letter.
 */
export function GroupDomainAvatarPlaceholder({
  className = "",
  shape = "circle",
}: {
  className?: string;
  /** 목록 행은 1:1(원형)과 구분되게 둥근 사각형 (Owner 2026-11-10 시안 3판) */
  shape?: "circle" | "rounded-square";
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      data-group-avatar-placeholder="1"
    >
      <rect width="40" height="40" rx={shape === "rounded-square" ? 10 : 20} fill="var(--sam-primary-soft)" />
      <circle cx="15" cy="15" r="5" fill="var(--sam-primary)" opacity="0.85" />
      <circle cx="25" cy="15" r="5" fill="var(--sam-primary)" opacity="0.65" />
      <path
        d="M8 30c1.5-5 4.5-7.5 7-7.5s5.5 2.5 7 7.5"
        stroke="var(--sam-primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M18 30c1.2-4 3.8-6 6-6s5 2 6.2 6"
        stroke="var(--sam-primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function resolveGroupDomainImageSrc(imageUrl: string | null | undefined): string | null {
  const raw = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!raw || raw === GROUP_IMAGE_PLACEHOLDER_MARKER) return null;
  // OAuth/personal profile hosts must never become group identity images.
  if (/googleusercontent\.com\/a\//i.test(raw)) return null;
  if (/lh[0-9]\.googleusercontent\.com/i.test(raw) && /[=/]s\d+-c\b/i.test(raw)) return null;
  return raw;
}

export function GroupDomainAvatar({
  imageUrl,
  size = 48,
  className = "",
  fill = false,
  shape = "circle",
  roundedClassName: roundedClassNameOverride,
}: {
  imageUrl?: string | null;
  size?: number;
  className?: string;
  fill?: boolean;
  shape?: "circle" | "rounded-square";
  /** 둥근 사각 반경을 화면별로 정할 때 (대화 목록 = 채팅 시안 4판 18px). 생략 시 shape 기본값 */
  roundedClassName?: string;
}) {
  const src = resolveGroupDomainImageSrc(imageUrl);
  const roundedClassName =
    roundedClassNameOverride ?? (shape === "rounded-square" ? "rounded-[12px]" : "rounded-full");
  if (!src) {
    return (
      <div
        className={`overflow-hidden ${roundedClassName} bg-[color:var(--cm-room-primary-soft,#ede9fe)] ${className}`}
        style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
        data-group-avatar="placeholder"
        data-group-avatar-shape={shape}
      >
        <GroupDomainAvatarPlaceholder className="h-full w-full" shape={shape} />
      </div>
    );
  }
  return (
    <SamarketThumbnail
      src={src}
      alt=""
      size={size}
      fill={fill}
      roundedClassName={roundedClassName}
      className={className}
      fallbackSrc=""
      fallbackNode={<GroupDomainAvatarPlaceholder className="h-full w-full" shape={shape} />}
    />
  );
}
