"use client";

import Link from "next/link";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export type OwnerAddressBookSnapshotMode = "representative" | "store_linked";

export function OwnerAddressBookSnapshotCard({
  returnToPath,
  addressReady,
  addressDefault,
  className = "",
  bare = false,
  snapshotMode = "representative",
  listError = null,
}: {
  /** `encodeURIComponent` 전 원 경로 (예: `/stores/owner/basic-info?storeId=…`) */
  returnToPath: string;
  addressReady: boolean;
  addressDefault: UserAddressDTO | null;
  /** 래퍼에 추가 클래스 */
  className?: string;
  /** true면 카드 테두리·배경 생략(상위 패널 안에 끼울 때) */
  bare?: boolean;
  /**
   * `store_linked`: 이 매장에 연결된 주소록 「매장」행만 표시·좌표 동기화 대상(기본 정보 화면).
   * `representative`: 대표 주소 스냅샷(입점 신청 등).
   */
  snapshotMode?: OwnerAddressBookSnapshotMode;
  /** 주소 목록 API 실패 시 — `addressReady` 가 true 일 때만 표시 */
  listError?: string | null;
}) {
  const line =
    addressDefault?.id != null
      ? stripCountryFromAddressDisplayLine(
          buildTradePublicLine(addressDefault),
          addressDefault.countryName,
        ) || "—"
      : null;

  const shell = bare
    ? `px-0 py-0 ${className}`.trim()
    : `rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 ${className}`.trim();

  const title =
    snapshotMode === "store_linked" ? "매장 주소 (내정보 · 주소록)" : "주소 (내정보 · 주소록)";

  const emptyHint =
    snapshotMode === "store_linked"
      ? "이 매장에 연결된 주소록 항목이 없습니다. 주소록에서 유형을 「매장」으로 고르고 이 매장을 연결한 뒤, 지도에서 위치를 저장해 주세요."
      : "대표 주소가 없습니다. 주소록에서 대표 주소를 먼저 설정해 주세요.";

  return (
    <div className={shell}>
      <p className="sam-text-body-secondary font-bold text-sam-fg">{title}</p>
      <p className="mt-1 sam-text-helper font-normal text-sam-muted">
        {addressReady
          ? listError
            ? <span className="text-sam-danger">{listError}</span>
            : addressDefault?.id
              ? line
              : emptyHint
          : "불러오는 중…"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={`/mypage/addresses?returnTo=${encodeURIComponent(returnToPath)}`}
          prefetch={false}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-semibold text-sam-fg hover:bg-sam-app"
        >
          주소록 열기
        </Link>
      </div>
    </div>
  );
}
