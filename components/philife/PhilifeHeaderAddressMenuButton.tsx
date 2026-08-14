"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { openLoginRequiredSheet } from "@/lib/auth/require-auth-action";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS, SAM_TIER1_HEADER_ICON_GLYPH_CLASS } from "@/lib/ui/tier1-header-icon";

export function PhilifeHeaderAddressMenuButton(_props?: {
  panelPlacement?: "anchor" | "top-right" | "anchor-top-right";
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const membership = useClientMembershipState("philife-header-address-menu");
  const href = buildMypageAddressesHrefFromPath(
    pathname,
    searchParams?.toString() ? `?${searchParams.toString()}` : "",
  );

  return (
    <button
      type="button"
      className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} community-tier1-header-address text-sam-primary active:bg-sam-primary/10`}
      aria-label={t("philife_addr_open_menu_aria")}
      onClick={() => {
        if (membership.status !== "member") {
          openLoginRequiredSheet({ actionType: "address_save" });
          return;
        }
        router.push(href);
      }}
    >
      <AddressKindHeadPin kind="master" className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} />
    </button>
  );
}
