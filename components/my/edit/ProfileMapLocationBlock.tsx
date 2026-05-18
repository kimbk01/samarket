"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { UserAddressDesignationTitle } from "@/components/addresses/UserAddressDesignationTitle";
import { buildTradePublicLine, stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";
import { formatPhAddressCardOneLine, formatPhAddressCardOneLinePlain } from "@/lib/addresses/ph-address-display";
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

function pickRepresentative(rows: UserAddressDTO[]): UserAddressDTO | null {
  const master = rows.find((r) => r.isDefaultMaster);
  return master ?? null;
}

function RepresentativeRow({ row, repBadge }: { row: UserAddressDTO; repBadge: string }) {
  const isPh = (row.countryCode ?? "PH").trim().toUpperCase() === "PH";
  const repPh = isPh ? formatPhAddressCardOneLine(row) : null;
  const sub = isPh
    ? formatPhAddressCardOneLinePlain(row)
    : stripCountryFromAddressDisplayLine(buildTradePublicLine(row), row.countryName);
  return (
    <li className="flex items-start gap-2 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <UserAddressDesignationTitle row={row} className="sam-text-body font-semibold text-ui-fg" />
          <span className="rounded-full bg-signature/10 px-2 py-0.5 sam-text-xxs font-semibold text-signature">
            {repBadge}
          </span>
        </div>
        <p className="mt-0.5 sam-text-body-secondary leading-snug text-ui-muted">
          {isPh && repPh ? (
            <>
              {repPh.gatePrefix ? (
                <strong className="font-bold text-ui-fg">{repPh.gatePrefix}</strong>
              ) : null}
              {repPh.gatePrefix && repPh.streetBody ? <span className="text-ui-fg">, </span> : null}
              {repPh.streetBody ? <span>{repPh.streetBody}</span> : null}
              {!repPh.gatePrefix && !repPh.streetBody ? "—" : null}
            </>
          ) : (
            sub || "—"
          )}
        </p>
      </div>
    </li>
  );
}

export function ProfileMapLocationBlock({ addresses, listError }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sorted = addresses ? sortAddresses(addresses) : [];
  const representative = pickRepresentative(sorted);

  return (
    <div className="space-y-3">
      <div>
        <p className={OWNER_STORE_FORM_LEAD_CLASS}>{t("profile_edit_section_address")}</p>
        <p className="mt-1 sam-text-helper leading-relaxed text-ui-muted">{t("profile_edit_map_intro")}</p>
      </div>

      {listError ? (
        <p className="sam-text-body-secondary text-ui-muted">{t("profile_edit_map_load_failed")}</p>
      ) : addresses === null ? (
        <p className="sam-text-body-secondary text-ui-muted">{t("common_loading")}</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-3 sam-text-body-secondary leading-relaxed text-ui-fg">
          <p className="font-medium">{t("profile_edit_map_no_address")}</p>
          <p className="mt-1 sam-text-helper text-ui-muted">{t("profile_edit_map_empty_desc")}</p>
        </div>
      ) : representative == null ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/90 px-3 py-3 sam-text-body-secondary leading-relaxed text-ui-fg">
          <p className="font-medium">{t("profile_edit_map_no_primary")}</p>
          <p className="mt-1 sam-text-helper text-ui-muted">{t("profile_edit_map_no_primary_desc")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-ui-surface">
          <RepresentativeRow key={representative.id} row={representative} repBadge={t("profile_edit_address_rep_badge")} />
        </ul>
      )}

      <button
        type="button"
        onClick={() => {
          const back = typeof pathname === "string" && pathname ? pathname : "/mypage";
          router.push(`/mypage/addresses?returnTo=${encodeURIComponent(back + "#profile-address")}`);
        }}
        className="w-full rounded-ui-rect border border-sam-border bg-ui-surface py-3.5 sam-text-body font-semibold text-ui-fg"
      >
        {t("address_manage_title")}
      </button>
    </div>
  );
}
