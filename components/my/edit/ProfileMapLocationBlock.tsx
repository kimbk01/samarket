"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressDefaultsSummary } from "@/components/addresses/AddressDefaultsSummary";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { PROFILE_MAP_LOCATION_SECTION_TITLE } from "@/lib/stores/store-address-form-ui";
import { OWNER_STORE_FORM_LEAD_CLASS } from "@/lib/business/owner-store-stack";

type Props = {
  latitude: number | null;
  longitude: number | null;
  fullAddress: string;
};

/**
 * 프로필 수정: `/address/select` 지도 선택 + 기본 주소록 요약.
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ui-fg">기본 주소록</p>
          <Link href="/mypage/addresses" className="text-[13px] text-signature">
            관리
          </Link>
        </div>
        {defaultsErr ? (
          <p className="text-[12px] text-ui-muted">불러오지 못했습니다.</p>
        ) : defaults ? (
          <AddressDefaultsSummary defaults={defaults} />
        ) : (
          <p className="text-[12px] text-ui-muted">불러오는 중…</p>
        )}
      </div>
    </div>
  );
}
