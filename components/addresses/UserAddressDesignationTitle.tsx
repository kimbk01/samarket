"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { AddressLocationPinMark } from "@/components/addresses/AddressLocationPinMark";
import { isLocationOnlyAddressNickname } from "@/lib/addresses/location-only-address-nickname";
import { tryDecodeShopAddressStoreId } from "@/lib/addresses/shop-address-nickname";

/** 스크린리더·aria-label 용 평문 (핀 행은 고정 문구) */
export function getUserAddressDesignationPlainText(row: UserAddressDTO): string {
  const rawNick = row.nickname?.trim();
  const shopId = (row.linkedStoreId?.trim() || tryDecodeShopAddressStoreId(rawNick) || "").trim();
  if (row.labelType === "shop") {
    return shopId
      ? `매장 · ${shopId.slice(0, 8)}${shopId.length > 8 ? "…" : ""}`
      : ADDRESS_LABEL_KO.shop;
  }
  if (isLocationOnlyAddressNickname(rawNick)) {
    return "지정 이름 없음, 위치만 표시";
  }
  if (rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined") {
    return rawNick;
  }
  return ADDRESS_LABEL_KO[row.labelType];
}

export function UserAddressDesignationTitle(props: { row: UserAddressDTO; className?: string }) {
  const { row, className } = props;
  const rawNick = row.nickname?.trim();
  const shopId = (row.linkedStoreId?.trim() || tryDecodeShopAddressStoreId(rawNick) || "").trim();

  if (row.labelType === "shop") {
    const text = shopId
      ? `매장 · ${shopId.slice(0, 8)}${shopId.length > 8 ? "…" : ""}`
      : ADDRESS_LABEL_KO.shop;
    return <span className={className}>{text}</span>;
  }
  if (isLocationOnlyAddressNickname(rawNick)) {
    return (
      <span
        className={className ? `${className} inline-flex items-center` : "inline-flex items-center"}
        title="지정 이름 없음(위치만)"
      >
        <AddressLocationPinMark className="h-[1.15em] w-[0.88em] shrink-0" aria-label="지정 이름 없음, 위치만 표시" />
      </span>
    );
  }
  const text =
    rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined"
      ? rawNick
      : ADDRESS_LABEL_KO[row.labelType];
  return <span className={className}>{text}</span>;
}
