"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileCompletionState } from "@/lib/profile/profile-completion-state";
import type { ProfileRow } from "@/lib/profile/types";
import {
  countRequiredInfoBundleComplete,
  isRequiredInfoBundleComplete,
  MYPAGE_REQUIRED_FLOW_HREF,
  pickRequiredInfoBundleState,
  type RequiredInfoBundleState,
} from "@/lib/mypage/required-info-flow";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

function resolveDevPreviewBundle(raw: string | null): RequiredInfoBundleState | null {
  if (process.env.NODE_ENV !== "development" || raw == null || raw === "") return null;
  const step = Number(raw);
  if (!Number.isFinite(step) || step < 0 || step > 2) return null;
  return {
    hasDibayId: step >= 1,
    hasVerifiedPhone: step >= 2,
    hasDefaultAddress: false,
  };
}

export function RequiredInfoList({
  profile: _profile,
  completion,
}: {
  profile: ProfileRow;
  completion: ProfileCompletionState;
  onProfileRefresh?: () => void;
}) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const previewBundle = resolveDevPreviewBundle(searchParams?.get("requiredInfoPreview") ?? null);
  const bundle = previewBundle ?? pickRequiredInfoBundleState(completion);
  const bundleComplete = isRequiredInfoBundleComplete(bundle);
  const completeCount = countRequiredInfoBundleComplete(bundle);

  if (bundleComplete) {
    return (
      <section
        className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
        data-testid="mypage-required-info-card"
        data-state="complete"
      >
        <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
          <p
            className={`${MYPAGE_HOME_SECTION_LABEL_CLASS} text-[#00704A]`}
            data-testid="mypage-required-info-complete"
          >
            {safeT("mypage_required_bundle_complete", {
              fallbackKo: "필수정보 · 완료",
              fallbackEn: "Required info · Complete",
            })}
          </p>
        </div>
      </section>
    );
  }

  const progressText = `${completeCount}/3`;

  return (
    <section
      className={`${MYPAGE_HOME_CARD_CLASS} mt-1 w-full self-start`}
      data-testid="mypage-required-info-card"
      data-state="incomplete"
    >
      <div className={`${MYPAGE_HOME_SECTION_HEADER_CLASS} flex items-center justify-between gap-3`}>
        <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
          {safeT("mypage_required_section_title", {
            fallbackKo: "필수 정보",
            fallbackEn: "Required info",
          })}
        </h2>
        <span className="inline-flex shrink-0 rounded-full bg-[#F2F0EB] px-2.5 py-1 text-[12px] font-bold text-[#6F4E37]">
          {progressText}
        </span>
      </div>

      <div className="flex flex-col gap-4 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
        <p className="text-[14px] leading-relaxed text-[#6F4E37]">
          {safeT("mypage_required_flow_intro_body", {
            fallbackKo: "아이디·전화·주소를 순서대로 등록해 주세요.",
            fallbackEn: "Complete your @ ID, phone, and address in order.",
          })}
        </p>
        <Link
          href={MYPAGE_REQUIRED_FLOW_HREF}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#00704A] px-4 text-[15px] font-semibold text-white"
          data-testid="mypage-required-continue-cta"
        >
          {safeT("mypage_required_continue_action", {
            fallbackKo: "계속하기",
            fallbackEn: "Continue",
          })}
        </Link>
      </div>
    </section>
  );
}
