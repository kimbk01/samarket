"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { GROUP_IMAGE_PLACEHOLDER_MARKER } from "@/lib/messenger/group/domain";

/**
 * Group identity avatar — group image URL or group-only placeholder.
 * Never uses participant avatar, user DefaultAvatarFace, or title-initial letter.
 */
export function GroupDomainAvatarPlaceholder({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      data-group-avatar-placeholder="1"
    >
      <rect width="40" height="40" rx="20" fill="var(--sam-brand-soft, #ede9fe)" />
      <circle cx="15" cy="15" r="5" fill="var(--sam-brand, #7c3aed)" opacity="0.85" />
      <circle cx="25" cy="15" r="5" fill="var(--sam-brand, #7c3aed)" opacity="0.65" />
      <path
        d="M8 30c1.5-5 4.5-7.5 7-7.5s5.5 2.5 7 7.5"
        stroke="var(--sam-brand, #7c3aed)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M18 30c1.2-4 3.8-6 6-6s5 2 6.2 6"
        stroke="var(--sam-brand, #7c3aed)"
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
}: {
  imageUrl?: string | null;
  size?: number;
  className?: string;
  fill?: boolean;
}) {
  const src = resolveGroupDomainImageSrc(imageUrl);
  if (!src) {
    return (
      <div
        className={`overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft,#ede9fe)] ${className}`}
        style={fill ? { width: "100%", height: "100%" } : { width: size, height: size }}
        data-group-avatar="placeholder"
      >
        <GroupDomainAvatarPlaceholder className="h-full w-full" />
      </div>
    );
  }
  return (
    <SamarketThumbnail
      src={src}
      alt=""
      size={size}
      fill={fill}
      roundedClassName="rounded-full"
      className={className}
      fallbackSrc=""
      fallbackNode={<GroupDomainAvatarPlaceholder className="h-full w-full" />}
    />
  );
}
