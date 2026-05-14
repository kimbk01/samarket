"use client";

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { AddressLocationPinMark } from "@/components/addresses/AddressLocationPinMark";
import { isLocationOnlyAddressNickname } from "@/lib/addresses/location-only-address-nickname";

/**
 * 매장 지정 행 헤더 — `building_name` 은 구글 POI이고 샘마켓 「매장명」과 역할이 다르다.
 * 연결 매장 표시명은 부모에서 `linkedSamarketStoreDisplayName` 으로만 넘긴다 (`stores.store_name`).
 */
function shopDesignationLine(row: UserAddressDTO, linkedSamarketStoreDisplayName?: string | null): string {
  const fromApi = linkedSamarketStoreDisplayName?.trim();
  if (fromApi) return `매장 · ${fromApi}`;
  /** 조회 불가 시 POI/`building_name` 을 헤더에 넣지 않음(지도 줄과 매장 명칭 혼동 방지). */
  return ADDRESS_LABEL_KO.shop;
}

export type UserAddressDesignationOptions = {
  linkedSamarketStoreDisplayName?: string | null;
};

/** 스크린리더·aria-label 용 평문 (핀 행은 고정 문구) */
export function getUserAddressDesignationPlainText(
  row: UserAddressDTO,
  opts?: UserAddressDesignationOptions,
): string {
  const rawNick = row.nickname?.trim();
  if (row.labelType === "shop") {
    return shopDesignationLine(row, opts?.linkedSamarketStoreDisplayName);
  }
  if (isLocationOnlyAddressNickname(rawNick)) {
    return "지정 이름 없음, 위치만 표시";
  }
  if (rawNick && rawNick.toLowerCase() !== "null" && rawNick.toLowerCase() !== "undefined") {
    return rawNick;
  }
  return ADDRESS_LABEL_KO[row.labelType];
}

export function UserAddressDesignationTitle(props: {
  row: UserAddressDTO;
  className?: string;
  linkedSamarketStoreDisplayName?: string | null;
}) {
  const { row, className, linkedSamarketStoreDisplayName } = props;
  const rawNick = row.nickname?.trim();

  if (row.labelType === "shop") {
    return <span className={className}>{shopDesignationLine(row, linkedSamarketStoreDisplayName)}</span>;
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
