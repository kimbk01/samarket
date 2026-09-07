"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

/** 필라이프·거래 홈 상단 동네 줄 — 대표 주소 관리로 이동 (Local filter 와 별개) */
type Tier1ExplorationTitleRowProps = {
  /** 탐색 피드 화면 명 — 예: 필라이프, 홈 */
  segmentTitle: string;
  /** `start`: 1단 좌측 정렬(햄버거 옆). 기본은 가운데. */
  align?: "start" | "center";
};

/**
 * 메인 1단 중앙 타이틀 — `페이지명 · (대표 City…)` 형태.
 * 주소 탭 → 대표 주소 관리. Community Local filter와 별개 (CUT 2).
 */
export function Tier1ExplorationTitleRow({
  segmentTitle,
  align = "center",
}: Tier1ExplorationTitleRowProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const addressManagementHref = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  );
  const membership = useClientMembershipState("tier1-exploration-title");
  const rep = useRepresentativeAddressLine();
  const isMemberViewer = membership.status === "member";
  /** 대표 주소 City — RegionContext/Local filter 와 분리 */
  const addressLine = !isMemberViewer
    ? ""
    : rep.status === "loading"
      ? "…"
      : rep.line?.trim() || "";
  const showAddress = isMemberViewer && Boolean(addressLine.trim());

  const justify = align === "start" ? "justify-start" : "justify-center";
  return (
    <span className={`flex w-full min-w-0 max-w-full items-center ${justify} gap-1.5 overflow-hidden`}>
      <span className="sam-text-page-title shrink-0 leading-none">{segmentTitle}</span>
      {showAddress ? (
        <>
          <span className="shrink-0 sam-text-body leading-none text-sam-muted" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={() => router.push(addressManagementHref)}
            className="sam-text-body-secondary inline-flex min-w-0 flex-1 items-center gap-1 truncate text-left leading-none hover:text-sam-fg hover:underline"
            aria-label={t("layout_neighborhood_address_aria", { line: addressLine })}
          >
            <AddressKindHeadPin kind="master" className="h-3.5 w-3.5 shrink-0 [&_svg]:h-3.5 [&_svg]:w-[0.75rem]" />
            <span className="min-w-0 truncate">{addressLine}</span>
          </button>
        </>
      ) : null}
    </span>
  );
}
