"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { StoreAddressStreetDetailGrid } from "@/components/stores/StoreAddressStreetDetailGrid";
import {
  PROFILE_MAP_LOCATION_SECTION_TITLE,
  STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO,
  STORE_LOCATION_SECTION_HINT_PROFILE_EDIT,
} from "@/lib/stores/store-address-form-ui";
import {
  OWNER_STORE_FORM_HINT_CLASS,
  OWNER_STORE_FORM_LEAD_CLASS,
} from "@/lib/business/owner-store-stack";

type Props = {
  latitude: number | null;
  longitude: number | null;
  fullAddress: string;
  addressStreetLine: string;
  addressDetail: string;
  onAddressStreetLineChange: (v: string) => void;
  onAddressDetailChange: (v: string) => void;
};

/**
 * 프로필 수정 전용: `/address/select` 지도 선택 + 지번·동호 그리드 (매장 주소록·AddressEditorSheet 와 동일 패턴)
 */
export function ProfileMapLocationBlock({
  latitude,
  longitude,
  fullAddress,
  addressStreetLine,
  addressDetail,
  onAddressStreetLineChange,
  onAddressDetailChange,
}: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div>
        <p className={OWNER_STORE_FORM_LEAD_CLASS}>{PROFILE_MAP_LOCATION_SECTION_TITLE}</p>
        <p className={OWNER_STORE_FORM_HINT_CLASS}>{STORE_LOCATION_SECTION_HINT_PROFILE_EDIT}</p>
        <button
          type="button"
          onClick={() => router.push("/address/select")}
          className="mt-2 w-full rounded-ui-rect border border-ig-border bg-ui-surface py-3 text-[14px] font-medium text-ui-fg"
        >
          지도에서 위치 선택
        </button>
        {fullAddress.trim() || latitude != null ? (
          <p className="mt-2 text-[13px] leading-snug text-ui-fg">
            {fullAddress.trim() ||
              (latitude != null && longitude != null
                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                : "")}
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-amber-800">지도에서 위치를 선택해 주세요.</p>
        )}
      </div>

      <div>
        <p className="mb-1 text-[13px] font-medium text-ui-fg">상세 주소</p>
        <p className="mb-2 text-[12px] leading-relaxed text-ui-muted">
          {STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO}
        </p>
        <StoreAddressStreetDetailGrid
          addressStreetLine={addressStreetLine}
          addressDetail={addressDetail}
          onAddressStreetLineChange={onAddressStreetLineChange}
          onAddressDetailChange={onAddressDetailChange}
        />
        <p className="mt-3 text-[12px] leading-relaxed text-ui-muted">
          거래·생활·배달의 <strong className="font-medium text-ui-fg">기본 주소</strong>는{" "}
          <Link href="/mypage/addresses" className="text-signature underline">
            주소록
          </Link>
          에서 따로 지정합니다. 프로필 위치만 바꿔도 주소록·매장 배달 주소는 자동으로 같이 바뀌지
          않습니다.
        </p>
      </div>
    </div>
  );
}
