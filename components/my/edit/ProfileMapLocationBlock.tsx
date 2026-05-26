"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";
import { PROFILE_EDIT_SECONDARY_BTN_CLASS } from "@/lib/ui/profile-edit-starbucks-styles";

type Props = {
  addresses: UserAddressDTO[] | null;
  listError?: boolean;
};

function pickRepresentative(rows: UserAddressDTO[]): UserAddressDTO | null {
  return rows.find((r) => r.isDefaultMaster) ?? null;
}

export function ProfileMapLocationBlock({ addresses, listError }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const representative = addresses ? pickRepresentative(addresses) : null;

  const goAddresses = () => {
    const back = typeof pathname === "string" && pathname ? pathname : "/mypage";
    router.push(`/mypage/addresses?returnTo=${encodeURIComponent(back + "#profile-address")}`);
  };

  return (
    <div className="space-y-3">
      {listError ? (
        <p className="text-[14px] text-[#6F4E37]" role="alert">
          {t("profile_edit_map_load_failed")}
        </p>
      ) : addresses === null ? (
        <p className="text-[14px] text-[#6F4E37]/70">{t("common_loading")}</p>
      ) : !representative ? (
        <button
          type="button"
          onClick={goAddresses}
          aria-label={t("profile_edit_address_empty_aria")}
          className="flex w-full items-center rounded-ui-rect border border-dashed border-[#00704A]/35 bg-[#E8F3EE]/60 px-3 py-3 text-left text-[14px] font-semibold text-[#00704A] active:bg-[#D4E9E2]/60"
        >
          {t("profile_edit_map_no_address")}
        </button>
      ) : (
        <button
          type="button"
          onClick={goAddresses}
          aria-label={t("profile_edit_address_row_aria")}
          className="w-full rounded-ui-rect border border-[#00704A]/15 bg-[#E8F3EE]/50 px-3 py-2.5 text-left active:bg-[#D4E9E2]/60"
        >
          <AddressListRowBody row={representative} badgeStyle="starbucks" />
        </button>
      )}

      <button
        type="button"
        onClick={goAddresses}
        aria-label={t("profile_edit_address_manage_aria")}
        className={PROFILE_EDIT_SECONDARY_BTN_CLASS}
      >
        {t("address_manage_title")}
      </button>
    </div>
  );
}
