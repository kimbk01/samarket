"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import type { DibayMenuItem } from "@/components/ui/dibay-overlay/DibaySheetParts";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";

/**
 * 정보교환 「내 주소 관리」 입구 — 주소록 단일 화면(`/mypage/addresses`)으로 간다.
 * 예전 1단 지도 버튼이 하던 일을 「보는 동네」 시트(`CommunityAreaSheet`) 맨 아래 한 줄로 옮겼다
 * (Owner 「3판대로 구현」 2026-11-12 — 1단 지도 버튼과 2단 「동네」가 겹친다는 지적). 이동 주소·비회원 처리는 그대로.
 */
export function usePhilifeAddressManageMenuItem({
  onBeforeNavigate,
}: {
  onBeforeNavigate?: () => void;
} = {}): DibayMenuItem {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const membership = useClientMembershipState("philife-header-address-menu");
  const href = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : "",
  );
  return {
    key: "address-manage",
    icon: <AddressKindHeadPin kind="master" className="h-5 w-5" />,
    label: t("community_area_sheet_manage"),
    onClick: () => {
      onBeforeNavigate?.();
      if (membership.status !== "member") {
        openLoginRequiredSheet({ actionType: "address_save" });
        return;
      }
      router.push(href);
    },
  };
}
