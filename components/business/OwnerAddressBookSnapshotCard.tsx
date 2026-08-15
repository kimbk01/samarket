"use client";

import { useRouter } from "next/navigation";
import {
  formatAddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressBookCardLine } from "@/components/addresses/AddressBookCardLine";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";

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
  const { t } = useI18n();
  const router = useRouter();
  const presentation =
    addressDefault?.id != null ? formatAddressBookCardPresentation(addressDefault) : null;

  const shell = bare
    ? `px-0 py-0 ${className}`.trim()
    : `rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 ${className}`.trim();

  const title =
    snapshotMode === "store_linked" ? t("business_phase7_668") : t("business_phase7_669");

  const emptyHint =
    snapshotMode === "store_linked" ? t("business_phase7_670") : t("business_phase7_671");

  return (
    <div className={shell}>
      <p className="sam-text-body-secondary font-bold text-sam-fg">{title}</p>
      <p
        className={`mt-1 sam-text-body font-normal ${
          addressReady && addressDefault?.id && !listError ? "text-sam-fg" : "text-sam-muted"
        }`}
      >
        {addressReady
          ? listError
            ? <span className="text-sam-danger">{listError}</span>
            : addressDefault?.id
              ? <AddressBookCardLine presentation={presentation} />
              : emptyHint
          : t("common_loading")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push(`/mypage/addresses?returnTo=${encodeURIComponent(returnToPath)}`)}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-app"
        >
          <AddressKindHeadPin kind="master" className="mr-1 inline-flex h-4 w-4 align-[-2px] [&_svg]:h-4 [&_svg]:w-[0.85rem]" />
          {t("business_phase7_672")}
        </button>
      </div>
    </div>
  );
}
