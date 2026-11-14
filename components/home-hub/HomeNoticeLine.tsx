"use client";

import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import type { HomeLatestNotice } from "@/lib/home/home-catalog-types";

/**
 * 공지 한 줄 — 홈 시안 v4. 어드민 공지(고객센터 「공지사항」) 최신 제목 1건, 누르면 이미 있는 공지사항 목록
 * (목록·안읽음·모두 읽음은 그 화면 몫). 홈에는 읽음 여부를 두지 않는다(개인 정보 아님). 공지가 없으면 줄 자체를 그리지 않는다.
 */
export function HomeNoticeLine({ notice }: { notice: HomeLatestNotice | null }) {
  const { t } = useI18n();
  const router = useRouter();
  if (!notice) return null;
  return (
    <button
      type="button"
      aria-label={t("home_notice_open_aria")}
      onClick={() => router.push(buildCustomerCenterBoardListPath("notice"))}
      className="mt-2 flex w-full items-center gap-2 bg-white px-4 py-3 text-left active:bg-black/[0.04]"
      data-home-notice
    >
      <span className="shrink-0 text-[12.5px] font-bold text-sam-primary">{t("home_notice_label")}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#333]">{notice.title}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#999]" strokeWidth={2} aria-hidden />
    </button>
  );
}
