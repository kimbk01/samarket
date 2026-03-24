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
      <Link href="/mypage/profile" className="block">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 rounded-full bg-gray-200" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-gray-500">로그인해 주세요</p>
              <p className="text-[12px] text-gray-400">프로필 보기</p>
            </div>
            <ChevronRight />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/mypage/profile" className="block">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-200">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-gray-400">
                ?
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-medium text-gray-900">{profile.nickname}</p>
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

function ChevronRight() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
