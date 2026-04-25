"use client";

import Image from "next/image";
import Link from "next/link";
import type { ProfileRow } from "@/lib/profile/types";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { ProfileStatRow } from "./ProfileStatRow";
import { ProfileActionButtons } from "./ProfileActionButtons";

function getMemberTypeLabel(profile: ProfileRow): string {
  if (profile.role === "admin" || profile.role === "super_admin") return "관리자";
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
  const regionLines = resolveProfileLocationAddressLines(profile);
  const regionDisplay = regionLines.length > 0 ? regionLines.join("\n") : "지역 미설정";

  return (
    <div className="mx-auto max-w-[480px] rounded-ui-rect bg-sam-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt="프로필"
              fill
              className="object-cover"
              sizes="64px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center sam-text-page-title text-sam-meta">
              👤
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sam-text-body-lg font-semibold text-sam-fg">
              {profile.nickname || "닉네임 없음"}
            </span>
            <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">
              {memberLabel}
            </span>
            {isBusinessMember && (
              <span className="rounded bg-signature/10 px-1.5 py-0.5 sam-text-xxs font-medium text-signature">
                비즈
              </span>
            )}
          </div>
          <p className="mt-0.5 whitespace-pre-line sam-text-body-secondary text-sam-muted">{regionDisplay}</p>
          {extraStat && (
            <Link
              href="/my/reviews"
              className="mt-1 inline-block sam-text-helper text-sam-muted underline-offset-1 hover:underline"
            >
              {extraStat.label} {extraStat.value}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-sam-border-soft pt-3">
        <ProfileStatRow label="포인트" value={profile.points} />
        <ProfileStatRow
          label="실명 인증"
          value={profile.realname_verified ? "완료" : "미인증"}
        />
      </div>

      {profile.bio && (
        <p className="mt-3 border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">
          {profile.bio}
        </p>
      )}

      <ProfileActionButtons />
    </div>
  );
}
