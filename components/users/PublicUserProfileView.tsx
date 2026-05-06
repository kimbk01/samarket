"use client";

import Image from "next/image";
import type { PublicSellerProfileDTO } from "@/lib/users/map-profile-to-public-seller";

export function PublicUserProfileView({
  profile,
}: {
  profile: PublicSellerProfileDTO & { tradeLocationLine?: string | null };
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex items-start gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="64px" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="sam-text-page-title font-semibold text-sam-fg">{profile.nickname ?? "사용자"}</p>
            {profile.tradeLocationLine ? (
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{profile.tradeLocationLine}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

