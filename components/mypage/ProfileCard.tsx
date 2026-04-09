"use client";

import Link from "next/link";
import Image from "next/image";
import type { Profile } from "@/lib/types/profile";
import { MannerBatteryInline } from "@/components/trust/MannerBatteryDisplay";

interface ProfileCardProps {
  profile: Profile | null;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  if (!profile) {
    return (
      <Link href="/mypage/account" className="block">
        <div className="rounded-ui-rect border border-ig-border bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 rounded-full bg-ig-highlight" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-muted">로그인해 주세요</p>
              <p className="text-[12px] text-muted">프로필 보기</p>
            </div>
            <ChevronRight />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/mypage/account" className="block">
      <div className="rounded-ui-rect border border-ig-border bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-ig-highlight">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted">
                <UserPlaceholderIcon />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-medium text-foreground">{profile.nickname}</p>
            </div>
            <div className="mt-1">
              <MannerBatteryInline raw={profile.temperature} size="sm" />
            </div>
          </div>
          <ChevronRight />
        </div>
      </div>
    </Link>
  );
}

function UserPlaceholderIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="h-5 w-5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
