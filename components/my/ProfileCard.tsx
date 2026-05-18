"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import { resolveProfileLocationAddressLines } from "@/lib/profile/profile-location";
import { ProfileStatRow } from "./ProfileStatRow";
import { ProfileActionButtons } from "./ProfileActionButtons";
import { formatAtUsername, resolveDisplayName } from "@/lib/users/user-label";

export interface ProfileCardProps {
  profile: ProfileRow;
  extraStat?: { label: string; value: string };
  isBusinessMember?: boolean;
}

export function ProfileCard({ profile, extraStat, isBusinessMember }: ProfileCardProps) {
  const { t } = useI18n();

  const memberLabel =
    profile.role === "admin" || profile.role === "super_admin"
      ? t("profile_member_admin")
      : profile.is_special_member
        ? t("profile_member_special")
        : t("profile_member_general");

  const regionLines = resolveProfileLocationAddressLines(profile);
  const regionDisplay = regionLines.length > 0 ? regionLines.join("\n") : t("profile_region_missing");
  const dn = resolveDisplayName(profile);
  const at = formatAtUsername(profile.username ?? null);

  return (
    <div className="mx-auto max-w-[480px] rounded-ui-rect bg-sam-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-sam-surface-muted">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={t("profile_edit_photo_alt")}
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
            <span className="sam-text-body-lg font-semibold text-sam-fg">{dn || t("profile_no_nickname")}</span>
            {at ? <span className="sam-text-helper text-sam-meta">{at}</span> : null}
            <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">{memberLabel}</span>
            {isBusinessMember ? (
              <span className="rounded bg-signature/10 px-1.5 py-0.5 sam-text-xxs font-medium text-signature">
                {t("profile_biz")}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 whitespace-pre-line sam-text-body-secondary text-sam-muted">{regionDisplay}</p>
          {extraStat ? (
            <Link
              href="/my/reviews"
              className="mt-1 inline-block sam-text-helper text-sam-muted underline-offset-1 hover:underline"
            >
              {extraStat.label} {extraStat.value}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 border-t border-sam-border-soft pt-3">
        <ProfileStatRow label={t("profile_edit_points")} value={profile.points} />
        <ProfileStatRow
          label={t("account_realname")}
          value={profile.realname_verified ? t("account_verified") : t("account_unverified")}
        />
      </div>

      {profile.bio ? (
        <p className="mt-3 border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">{profile.bio}</p>
      ) : null}

      <ProfileActionButtons />
    </div>
  );
}
