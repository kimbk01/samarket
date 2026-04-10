"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressDefaultsSummary } from "@/components/addresses/AddressDefaultsSummary";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import {
  PROFILE_MAP_LOCATION_SECTION_TITLE,
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
};

/**
 * 프로필 수정 전용: `/address/select` 지도 선택 + 기본 주소록 요약(생활·거래·배달).
 * 상세 지번·동호 그리드는 두지 않고, 역지오코딩 full_address 로 저장 가능.
 */
export function ProfileMapLocationBlock({ latitude, longitude, fullAddress }: Props) {
  const router = useRouter();
  const [defaults, setDefaults] = useState<UserAddressDefaultsDTO | null>(null);
  const [defaultsErr, setDefaultsErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/address-defaults", { credentials: "include" });
        const j = (await res.json()) as {
          ok?: boolean;
          defaults?: UserAddressDefaultsDTO;
        };
        if (cancelled) return;
        if (res.ok && j.ok && j.defaults) setDefaults(j.defaults);
        else setDefaultsErr(true);
      } catch {
        if (!cancelled) setDefaultsErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-ui-fg">기본 주소록</p>
        {defaultsErr ? (
          <p className="text-[12px] text-ui-muted">기본 주소를 불러오지 못했습니다.</p>
        ) : defaults ? (
          <AddressDefaultsSummary defaults={defaults} />
        ) : (
          <p className="text-[12px] text-ui-muted">불러오는 중…</p>
        )}
        <p className="text-[12px] leading-relaxed text-ui-muted">
          생활·거래·배달 기본지는{" "}
          <Link href="/mypage/addresses" className="text-signature underline">
            주소록
          </Link>
          에서 지정합니다. 프로필 지도 위치만 바꿔도 주소록은 자동으로 같이 바뀌지 않습니다.
        </p>
      </div>
    </div>
  );
}
