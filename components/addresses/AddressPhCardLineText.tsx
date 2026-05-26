"use client";

import type { AddressBookCardPresentation } from "@/lib/addresses/address-book-card-presentation";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { FormatPhAddressCardOneLineOpts } from "@/lib/addresses/ph-address-display";
import { resolveUserAddressCardPresentation } from "@/lib/addresses/format-user-address-list-line";
import { isPhUserAddressRow, formatUserAddressListPlainLine } from "@/lib/addresses/format-user-address-list-line";

type TextProps = {
  presentation: AddressBookCardPresentation | null;
  detailClassName?: string;
  bodyClassName?: string;
  emptyClassName?: string;
};

/** PH 주소 카드 본문 — `상세(gate)` 굵게 + `, ` + 도로·포맷(street). 주소 관리·마이페이지·시트 공통 */
export function AddressPhCardLineText(props: TextProps) {
  const {
    presentation,
    detailClassName = "font-bold text-sam-fg",
    bodyClassName = "font-normal text-sam-fg",
    emptyClassName = "text-sam-muted",
  } = props;

  if (!presentation || (!presentation.gatePrefix && !presentation.streetBody)) {
    return <span className={emptyClassName}>—</span>;
  }

  return (
    <span className="leading-snug">
      {presentation.gatePrefix ? (
        <>
          <strong className={detailClassName}>{presentation.gatePrefix}</strong>
          {presentation.streetBody ? ", " : null}
        </>
      ) : null}
      {presentation.streetBody ? <span className={bodyClassName}>{presentation.streetBody}</span> : null}
    </span>
  );
}

/** `UserAddressDTO` → PH 카드 본문(비PH는 plain 한 줄) */
export function AddressUserRowLineText(props: {
  row: UserAddressDTO;
  opts?: FormatPhAddressCardOneLineOpts | null;
  detailClassName?: string;
  bodyClassName?: string;
  mainTextClassName?: string;
  emptyClassName?: string;
}) {
  const {
    row,
    opts,
    detailClassName = "font-bold text-sam-fg",
    bodyClassName,
    mainTextClassName = "text-sam-fg",
    emptyClassName = "text-sam-muted",
  } = props;
  const bodyClass = bodyClassName ?? mainTextClassName;

  if (isPhUserAddressRow(row)) {
    return (
      <AddressPhCardLineText
        presentation={resolveUserAddressCardPresentation(row, opts)}
        detailClassName={detailClassName}
        bodyClassName={bodyClass}
        emptyClassName={emptyClassName}
      />
    );
  }

  const plain = formatUserAddressListPlainLine(row, opts).trim();
  return <span className={plain ? bodyClass : emptyClassName}>{plain || "—"}</span>;
}
