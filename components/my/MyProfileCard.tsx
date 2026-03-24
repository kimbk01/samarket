"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRow } from "@/lib/profile/types";
import { MannerBatteryInline } from "@/components/trust/MannerBatteryDisplay";

function getMemberTypeLabel(profile: ProfileRow): string {
  if (profile.role === "admin" || profile.role === "master") return "관리자";
  if (profile.is_special_member) return "특별회원";
  return "일반회원";
}

export interface MyProfileCardProps {
  profile: ProfileRow;
  mannerScore: number;
  isBusinessMember?: boolean;
  /** 프로필 카드 클릭 시 이동 (당근: /my/account 또는 /my/edit) */
  accountHref?: string;
}

export function MyProfileCard({
  profile,
  mannerScore,
  isBusinessMember,
  accountHref = "/my/account",
}: MyProfileCardProps) {
  const memberLabel = getMemberTypeLabel(profile);
  const regionDisplay = profile.region_name || profile.region_code || "지역 미설정";

  return (
    <Link
      href={accountHref}
      className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100">
        {profile.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt="프로필"
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[18px] text-gray-400">
            👤
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[16px] font-semibold text-gray-900">
            {profile.nickname || "닉네임 없음"}
          </span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
            {memberLabel}
          </span>
          {isBusinessMember && (
            <span className="rounded bg-signature/10 px-1.5 py-0.5 text-[11px] font-medium text-signature">
              비즈
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-gray-500">{regionDisplay}</p>
        <div className="mt-1">
          <MannerBatteryInline raw={mannerScore} size="sm" />
        </div>
      </div>
      <span className="shrink-0 text-gray-400" aria-hidden>
        <ChevronIcon />
      </span>
    </Link>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
