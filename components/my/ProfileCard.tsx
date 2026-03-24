"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRow } from "@/lib/profile/types";
import { ProfileStatRow } from "./ProfileStatRow";
import { ProfileActionButtons } from "./ProfileActionButtons";

function getMemberTypeLabel(profile: ProfileRow): string {
  if (profile.role === "admin" || profile.role === "master") return "관리자";
  if (profile.is_special_member) return "특별회원";
  return "일반회원";
}

export interface ProfileCardProps {
  profile: ProfileRow;
  /** 매너온도 등 추가 통계용 (선택) */
  extraStat?: { label: string; value: string };
  /** 비즈 회원 여부 (내 상점 활성 시 뱃지) */
  isBusinessMember?: boolean;
}

export function ProfileCard({ profile, extraStat, isBusinessMember }: ProfileCardProps) {
  const memberLabel = getMemberTypeLabel(profile);
  const regionDisplay = profile.region_name || profile.region_code || "지역 미설정";

  return (
    <div className="mx-auto max-w-[480px] rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt="프로필"
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[20px] text-gray-400">
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
          {extraStat && (
            <Link
              href="/my/reviews"
              className="mt-1 inline-block text-[12px] text-gray-500 underline-offset-1 hover:underline"
            >
              {extraStat.label} {extraStat.value}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
        <ProfileStatRow label="포인트" value={profile.points} />
        <ProfileStatRow
          label="실명 인증"
          value={profile.realname_verified ? "완료" : "미인증"}
        />
      </div>

      {profile.bio && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-[13px] text-gray-600">
          {profile.bio}
        </p>
      )}

      <ProfileActionButtons />
    </div>
  );
}
