"use client";

import { useRouter } from "next/navigation";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { buildTradePublicLine } from "@/lib/addresses/user-address-format";
import { PROFILE_ADDRESS_SECTION_TITLE } from "@/lib/stores/store-address-form-ui";
import { OWNER_STORE_FORM_LEAD_CLASS } from "@/lib/business/owner-store-stack";

type Props = {
  /** null 이면 목록 로딩 중 */
  addresses: UserAddressDTO[] | null;
  listError?: boolean;
};

function sortAddresses(rows: UserAddressDTO[]): UserAddressDTO[] {
  return [...rows].sort((a, b) => {
    if (a.isDefaultMaster !== b.isDefaultMaster) return a.isDefaultMaster ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

/** 프로필 수정 — 주소록 요약 + 주소 관리 이동(지도 직행 아님) */
export function ProfileMapLocationBlock({ addresses, listError }: Props) {
  const router = useRouter();
  const sorted = addresses ? sortAddresses(addresses) : [];

  return (
    <div className="space-y-3">
      <div>
        <p className={OWNER_STORE_FORM_LEAD_CLASS}>{PROFILE_ADDRESS_SECTION_TITLE}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ui-muted">
          대표 주소는 거래·동네·배달에 기본으로 쓰입니다. 배달은 주문 단계에서 바꿀 수 있어요.
        </p>
      </div>

      {listError ? (
        <p className="text-[13px] text-ui-muted">주소를 불러오지 못했습니다.</p>
      ) : addresses === null ? (
        <p className="text-[13px] text-ui-muted">불러오는 중…</p>
      ) : sorted.length === 0 ? (
        <p className="text-[13px] text-ui-muted">저장된 주소가 없어요.</p>
      ) : (
        <ul className="divide-y divide-ig-border rounded-ui-rect border border-ig-border bg-ui-surface">
          {sorted.map((row) => {
            const title = row.nickname?.trim() || ADDRESS_LABEL_KO[row.labelType];
            const sub = buildTradePublicLine(row);
            return (
              <li key={row.id} className="flex items-start gap-2 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14px] font-semibold text-ui-fg">{title}</span>
                    {row.isDefaultMaster ? (
                      <span className="rounded-full bg-signature/10 px-2 py-0.5 text-[10px] font-semibold text-signature">
                        대표
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ui-muted">{sub || "—"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => router.push("/mypage/addresses")}
        className="w-full rounded-ui-rect border border-gray-900 bg-ui-surface py-3.5 text-[14px] font-semibold text-ui-fg"
      >
        주소 관리
      </button>
    </div>
  );
}
