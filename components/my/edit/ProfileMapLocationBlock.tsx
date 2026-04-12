"use client";

import { useRouter } from "next/navigation";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADDRESS_LABEL_KO } from "@/components/addresses/address-labels";
import { buildTradePublicLine, stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
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

/** 프로필 카드에는 대표(마스터) 한 건만 노출 */
function pickRepresentative(rows: UserAddressDTO[]): UserAddressDTO | null {
  const master = rows.find((r) => r.isDefaultMaster);
  return master ?? null;
}

function RepresentativeRow({ row }: { row: UserAddressDTO }) {
  const nick = row.nickname?.trim();
  const title =
    nick && nick.toLowerCase() !== "null" && nick.toLowerCase() !== "undefined"
      ? nick
      : ADDRESS_LABEL_KO[row.labelType];
  const sub = stripCountryFromAddressDisplayLine(buildTradePublicLine(row), row.countryName);
  return (
    <li className="flex items-start gap-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] font-semibold text-ui-fg">{title}</span>
          <span className="rounded-full bg-signature/10 px-2 py-0.5 text-[10px] font-semibold text-signature">
            대표
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-ui-muted">{sub || "—"}</p>
      </div>
    </li>
  );
}

/** 프로필 수정 — 주소록 요약 + 주소 관리 이동(지도 직행 아님) */
export function ProfileMapLocationBlock({ addresses, listError }: Props) {
  const router = useRouter();
  const sorted = addresses ? sortAddresses(addresses) : [];
  const representative = pickRepresentative(sorted);

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
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-3 text-[13px] leading-relaxed text-ui-fg">
          <p className="font-medium">등록된 주소가 없어요.</p>
          <p className="mt-1 text-[12px] text-ui-muted">
            서비스 이용을 위해 지도에서 위치를 지정한 대표 주소가 필요합니다. 아래 「주소 관리」에서
            추가해 주세요.
          </p>
        </div>
      ) : representative == null ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-3 text-[13px] leading-relaxed text-ui-fg">
          <p className="font-medium">대표 주소가 지정되어 있지 않아요.</p>
          <p className="mt-1 text-[12px] text-ui-muted">
            「주소 관리」에서 한 곳을 대표로 지정하거나, 새로 등록해 주세요.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ig-border rounded-ui-rect border border-ig-border bg-ui-surface">
          <RepresentativeRow key={representative.id} row={representative} />
        </ul>
      )}

      <button
        type="button"
        onClick={() => router.push("/mypage/addresses")}
        className="w-full rounded-ui-rect border border-sam-border bg-ui-surface py-3.5 text-[14px] font-semibold text-ui-fg"
      >
        주소 관리
      </button>
    </div>
  );
}
