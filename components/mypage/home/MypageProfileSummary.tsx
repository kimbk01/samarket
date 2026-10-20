"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketUserAvatar } from "@/components/profile/SamarketUserAvatar";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import { buildMemberTrustSurface } from "@/lib/trust/member-trust-surface";
import type { MypageSummaryTrust } from "@/lib/mypage/mypage-summary-types";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

/**
 * Slice 3 IA: profile + manner (trust) on home.
 * Slice 4: manner row score/tier parity with `/mypage/trust` via `buildMemberTrustSurface`.
 * Logout MOVE → Account section (Slice 2 Danger + modal still applies there).
 */
export function MypageProfileSummary({
  projection,
  summaryTrust = null,
}: {
  projection: MypageHomeProjection | null;
  /** `GET /api/me/mypage-summary` `trust` (ok 일 때만) — `/mypage/trust` 와 같은 원값 */
  summaryTrust?: MypageSummaryTrust | null;
}) {
  const { safeT } = useI18n();
  const { openSheet } = useMypageProfileSheets();

  if (!projection) {
    // 실제 구조와 같은 높이: 아바타 56 + 이름 120×16 + 아이디 80×12 + 소개 160×12 + 매너 행 44px
    return (
      <section className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`} data-testid="mypage-profile-summary-skeleton">
        <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS}`}>
          <div className="h-3 w-16 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5 md:px-5">
          <div className="h-14 w-14 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-4 w-[120px] rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <div className="h-3 w-20 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <div className="h-3 w-40 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
          </div>
        </div>
        <div className="flex min-h-[44px] items-center gap-3 border-t border-sam-border-soft px-4 py-3 md:px-5">
          <div className="h-5 w-9 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
          <div className="h-3.5 w-24 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
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

  // 원값 우선순위: summary(서버 최신) → 전체 프로필 → 세션 lite 스냅샷. 모르면 % 자리 스켈레톤
  // (lite 로 그린 직후 기본값 %가 잠깐 보였다 바뀌는 흔들림 제거).
  const trustRaw = summaryTrust
    ? { trust_score: summaryTrust.trust_score, manner_score: summaryTrust.manner_score }
    : projection.profile
      ? { trust_score: projection.profile.trust_score, manner_score: projection.profile.manner_score }
      : projection.trustScore !== undefined || projection.mannerScore !== undefined
        ? { trust_score: projection.trustScore ?? null, manner_score: projection.mannerScore ?? null }
        : null;
  const trust = trustRaw ? buildMemberTrustSurface(trustRaw) : null;

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
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-sam-pressed-surface md:px-5"
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-sam-app">
          {/* 수정 시트(ProfileImageField)와 같은 컴포넌트·같은 src 판정 → 같은 이미지 · 캐시 공유 (§14) */}
          <SamarketUserAvatar avatarUrl={projection.avatarUrl} sizePx={56} alt="" />
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
        className="flex min-h-[44px] w-full items-center gap-3 border-t border-sam-border-soft px-4 py-3 text-left active:bg-sam-pressed-surface md:px-5"
      >
        {trust ? (
          <MannerBatteryIcon
            tier={trust.tier}
            percent={trust.percent}
            size="md"
            className="shrink-0"
          />
        ) : (
          <span aria-hidden className="h-5 w-9 shrink-0 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-sam-fg">
            {safeT("mypage_trust_title", {
              fallbackKo: "나의 배터리·신뢰",
              fallbackEn: "Manner & trust",
            })}
          </span>
          {trust ? (
            <span
              className={`mt-0.5 block text-[13px] tabular-nums ${trust.accentClass}`}
              data-testid="mypage-profile-manner-score"
            >
              {/* Single SSOT text — score + `%`; battery icon carries visual fill (no twin number). */}
              {trust.percentLabel}
            </span>
          ) : (
            <span
              aria-hidden
              data-testid="mypage-profile-manner-score-pending"
              className="mt-1 block h-3 w-10 rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse"
            />
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
      </Link>
    </section>
  );
}
