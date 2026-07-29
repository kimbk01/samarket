"use client";

import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useMypageProfileSheets } from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

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

  return (
    <section id="mypage-profile" className={`${MYPAGE_HOME_CARD_CLASS} w-full self-start`}>
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} flex items-center justify-between gap-3`}>
        <h2 className={`min-w-0 flex-1 truncate ${MYPAGE_HOME_SECTION_LABEL_CLASS}`}>
          {safeT("mypage_hub_profile_title", {
            fallbackKo: "내 프로필",
            fallbackEn: "My profile",
          })}
        </h2>
        <LogoutActionTrigger
          variant="text_link"
          label={safeT("mypage_hub_logout", {
            fallbackKo: "로그아웃",
            fallbackEn: "Log out",
          })}
        />
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
          <span className="block truncate text-[16px] font-semibold text-[#1E3932]">{name}</span>
          {projection.username ? (
            <span className="mt-0.5 block truncate text-[13px] text-[#00704A]">{projection.username}</span>
          ) : null}
          <span className="mt-1 block truncate text-[13px] leading-snug text-[#6F4E37]">{bio}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-[#00704A]">
          {safeT("profile_edit_title", {
            fallbackKo: "프로필 수정",
            fallbackEn: "Edit profile",
          })}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    </section>
  );
}
