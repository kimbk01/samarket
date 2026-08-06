"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { resolveTrustScoreAuthority } from "@/lib/trust/trust-score-ssot";
import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
} from "@/lib/trust/manner-battery";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Slice 3 IA: profile + manner (trust) on home.
 * Logout MOVE → Account section (Slice 2 Danger + modal still applies there).
 */
export function MypageProfileSummary({
  projection,
}: {
  projection: MypageHomeProjection | null;
}) {
  const { safeT } = useI18n();
  const { openSheet } = useMypageProfileSheets();

  if (!projection) {
    return (
      <section className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`} data-testid="mypage-profile-summary-skeleton">
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS}`}>
          <div className="h-4 w-24 rounded bg-sam-border/60" />
        </div>
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="h-14 w-14 shrink-0 rounded-full bg-sam-border/60" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-sam-border/60" />
            <div className="h-3 w-24 rounded bg-sam-border/40" />
          </div>
        </div>
      </section>
    );
  }

  const name =
    projection.displayName ||
    safeT("mypage_hub_profile_untitled", {
      fallbackKo: "이름 없음",
      fallbackEn: "No name",
    });
  const bio =
    projection.bio ||
    safeT("mypage_hub_profile_bio_empty", {
      fallbackKo: "소개를 추가해 보세요",
      fallbackEn: "Add a short bio",
    });

  const trustScore = resolveTrustScoreAuthority({
    trust_score: projection.profile?.trust_score,
    manner_score: projection.profile?.manner_score,
  });
  const mannerPercent = mannerRawToPercent(trustScore);
  const mannerTier = mannerBatteryTier(mannerPercent);

  return (
    <section id="mypage-profile" className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}>
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS}`}>
        <h2 className={`min-w-0 truncate ${MYPAGE_HOME_SECTION_LABEL_CLASS}`}>
          {safeT("mypage_hub_profile_title", {
            fallbackKo: "내 프로필",
            fallbackEn: "My profile",
          })}
        </h2>
      </div>

      <button
        type="button"
        data-testid="mypage-profile-summary-card"
        onClick={() => openSheet("profile-edit")}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-sam-app/80"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-sam-app">
          <SamarketThumbnail
            src={projection.avatarUrl}
            alt=""
            size={56}
            roundedClassName="rounded-full"
            className="h-14 w-14"
            imageClassName="object-cover"
            fetchDisplayPx={112}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-sam-fg">{name}</span>
          {projection.username ? (
            <span className="mt-0.5 block truncate text-[13px] text-sam-primary">{projection.username}</span>
          ) : null}
          <span className="mt-1 block truncate text-[13px] leading-snug text-sam-muted">{bio}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-sam-primary">
          {safeT("profile_edit_title", {
            fallbackKo: "프로필 수정",
            fallbackEn: "Edit profile",
          })}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>

      <Link
        href="/mypage/trust"
        data-testid="mypage-profile-manner-row"
        className="flex min-h-[44px] w-full items-center gap-3 border-t border-sam-border/80 px-4 py-3 text-left active:bg-sam-app/80"
      >
        <MannerBatteryIcon
          tier={mannerTier}
          percent={mannerPercent}
          size="md"
          className="shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-sam-fg">
            {safeT("mypage_trust_title", {
              fallbackKo: "나의 배터리·신뢰",
              fallbackEn: "Manner & trust",
            })}
          </span>
          <span className={`mt-0.5 block text-[13px] tabular-nums ${mannerBatteryAccentClass(mannerTier)}`}>
            {trustScore.toFixed(trustScore % 1 === 0 ? 0 : 2)}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
      </Link>
    </section>
  );
}
