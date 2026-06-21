"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";

export function CallAvatarHeader({
  name,
  publicId,
  avatarUrl,
  status,
  detail,
  tone = "overlay",
}: {
  name: string;
  publicId?: string | null;
  avatarUrl?: string | null;
  status?: string | null;
  detail?: string | null;
  tone?: "overlay" | "surface";
}) {
  const surface = tone === "surface";
  const trimmedName = name.trim() || "?";
  const normalizedPublicId = publicId?.trim() ? publicId.trim().replace(/^@/, "") : null;

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center text-center">
      <SamarketThumbnail
        src={resolveUserAvatarImageSrc(avatarUrl)}
        size={96}
        roundedClassName="rounded-full"
        className={
          surface
            ? "bg-[#F1F8F4] shadow-[0_18px_46px_rgba(0,61,41,0.16)] ring-2 ring-[#D4E9E2]/55"
            : "bg-[#1E1E1E] shadow-[0_18px_46px_rgba(0,0,0,0.35)] ring-2 ring-white/16"
        }
        fallbackSrc=""
        fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
      />
      <h1
        className={`mt-5 max-w-full truncate text-[clamp(1.45rem,6vw,2rem)] font-bold leading-tight tracking-tight ${
          surface ? "text-[#121212] dark:text-white" : "text-[#F1F8F4]"
        }`}
      >
        {trimmedName}
      </h1>
      {normalizedPublicId ? (
        <p className={`mt-1 max-w-full truncate sam-text-body font-medium ${surface ? "text-black/56 dark:text-white/68" : "text-[#D4E9E2]/86"}`}>
          @{normalizedPublicId}
        </p>
      ) : null}
      {status ? (
        <p className={`mt-4 sam-text-body-lg font-semibold ${surface ? "text-[#121212] dark:text-white/88" : "text-[#F1F8F4]/94"}`}>{status}</p>
      ) : null}
      {detail ? (
        <p className={`mt-1 max-w-[300px] sam-text-body-secondary leading-snug ${surface ? "text-black/58 dark:text-white/60" : "text-[#D4E9E2]/74"}`}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}
