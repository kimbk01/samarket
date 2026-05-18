"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { AddressLocationPinMark } from "@/components/addresses/AddressLocationPinMark";
import { isLocationOnlyAddressNickname } from "@/lib/addresses/location-only-address-nickname";

const LABEL_TYPE_KEYS: Record<UserAddressDTO["labelType"], MessageKey> = {
  home: "addr_ui_kind_home",
  office: "addr_ui_kind_office",
  shop: "addr_ui_kind_shop",
  other: "addr_ui_kind_other",
};

function addrUiT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(getRuntimeAppLanguage(), key, vars);
}

function shopDesignationLine(row: UserAddressDTO, linkedSamarketStoreDisplayName?: string | null): string {
  const fromApi = linkedSamarketStoreDisplayName?.trim();
  if (fromApi) return addrUiT("addr_ui_shop_prefix", { name: fromApi });
  return addrUiT("addr_ui_kind_shop");
}

export type UserAddressDesignationOptions = {
  linkedSamarketStoreDisplayName?: string | null;
};

export function getUserAddressDesignationPlainText(
  row: UserAddressDTO,
  opts?: UserAddressDesignationOptions,
): string {
  const rawNick = row.nickname?.trim();
  if (row.labelType === "shop") {
    return shopDesignationLine(row, opts?.linkedSamarketStoreDisplayName);
  }
  if (isLocationOnlyAddressNickname(rawNick)) {
    return addrUiT("addr_ui_location_only_plain");
  }
  if (rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined") {
    return rawNick;
  }
  return addrUiT(LABEL_TYPE_KEYS[row.labelType]);
}

export function UserAddressDesignationTitle(props: {
  row: UserAddressDTO;
  className?: string;
  linkedSamarketStoreDisplayName?: string | null;
}) {
  const { t } = useI18n();
  const { row, className, linkedSamarketStoreDisplayName } = props;
  const rawNick = row.nickname?.trim();

  if (row.labelType === "shop") {
    return <span className={className}>{shopDesignationLine(row, linkedSamarketStoreDisplayName)}</span>;
  }
  if (isLocationOnlyAddressNickname(rawNick)) {
    return (
      <span
        className={className ? `${className} inline-flex items-center` : "inline-flex items-center"}
        title={t("addr_ui_location_only_title")}
      >
        <AddressLocationPinMark
          className="h-[1.15em] w-[0.88em] shrink-0"
          aria-label={t("addr_ui_location_only_plain")}
        />
      </span>
    );
  }
  const text =
    rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined"
      ? rawNick
      : t(LABEL_TYPE_KEYS[row.labelType]);
  return <span className={className}>{text}</span>;
}
