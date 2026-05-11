"use client";

/**
 * 매장 운영 허브·사이드바 상단 — `stores.profile_image_url` 과 동일 소스.
 * 외부 URL은 `next/image` 도메인 설정 없이 `<img>` 로 표시(배달 검색 등과 동일).
 */
export function OwnerHubStoreAvatar({
  profileImageUrl,
  shopName,
  className = "h-11 w-11 sam-text-body font-semibold text-white",
}: {
  profileImageUrl?: string | null;
  shopName: string;
  /** 기본: 44px 원 + 이니셜 또는 이미지 */
  className?: string;
}) {
  const url = profileImageUrl?.trim() ?? "";
  const initial = shopName.trim().slice(0, 1) || "샵";

  if (url) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-sam-surface-muted ring-1 ring-inset ring-sam-border-soft ${className}`}
      >
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)] ${className}`}
    >
      {initial}
    </span>
  );
}
