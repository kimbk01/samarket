"use client";

import Link from "next/link";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export function OwnerAddressBookSnapshotCard({
  returnToPath,
  addressReady,
  addressDefault,
  className = "",
  bare = false,
}: {
  /** `encodeURIComponent` 전 원 경로 (예: `/stores/owner/basic-info?storeId=…`) */
  returnToPath: string;
  addressReady: boolean;
  addressDefault: UserAddressDTO | null;
  /** 래퍼에 추가 클래스 */
  className?: string;
  /** true면 카드 테두리·배경 생략(상위 패널 안에 끼울 때) */
  bare?: boolean;
}) {
  const line =
    addressDefault?.id != null
      ? stripCountryFromAddressDisplayLine(
          buildTradePublicLine(addressDefault),
          addressDefault.countryName
        ) || "—"
      : null;

  const shell = bare
    ? `px-0 py-0 ${className}`.trim()
    : `rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 ${className}`.trim();

  return (
    <div className={shell}>
      <p className="sam-text-body-secondary font-bold text-sam-fg">주소 (내정보 · 주소록)</p>
      <p className="mt-1 sam-text-helper font-normal text-sam-muted">
        {addressReady
          ? addressDefault?.id
            ? line
            : "대표 주소가 없습니다. 주소록에서 대표 주소를 먼저 설정해 주세요."
          : "불러오는 중…"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={`/mypage/addresses?returnTo=${encodeURIComponent(returnToPath)}`}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
        >
          주소록 열기
        </Link>
      </div>
    </div>
  );
}
