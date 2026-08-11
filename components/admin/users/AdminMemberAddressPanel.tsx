"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { ADMIN_USERS_LITE_CARD } from "@/lib/ui/admin-users-lite-styles";

type AddressPayload = {
  profileAddress: {
    regionCode: string | null;
    regionName: string | null;
    lines: string[];
  };
  addresses: UserAddressDTO[];
};

export function AdminMemberAddressPanel({ userId }: { userId: string }) {
  const { t, safeT, language } = useI18n();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error" } | { kind: "ok"; data: AddressPayload }>({
    kind: "loading",
  });
  const empty = t("admin_users_empty_placeholder");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/addresses`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as AddressPayload & { ok?: boolean };
        if (cancelled) return;
        if (!res.ok || data.ok === false) {
          setState({ kind: "error" });
          return;
        }
        setState({
          kind: "ok",
          data: {
            profileAddress: data.profileAddress,
            addresses: Array.isArray(data.addresses) ? data.addresses : [],
          },
        });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.kind === "loading") {
    return <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-[#667085]`}>{t("admin_users_detail_loading")}</div>;
  }
  if (state.kind === "error") {
    return (
      <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm font-semibold text-[#b42318]`}>
        {safeT("admin_users_cc_metric_error", { fallbackKo: "불러오지 못함", fallbackEn: "Load error" })}
      </div>
    );
  }

  const { profileAddress, addresses } = state.data;
  const fmt = (value: string | null) => {
    if (!value) return empty;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return value;
    return new Date(time).toLocaleString(language === "en" ? "en-US" : "ko-KR");
  };

  return (
    <div className="space-y-3">
      <div className={`${ADMIN_USERS_LITE_CARD} p-4`}>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[#667085]">
          {safeT("admin_users_cc_address_profile", { fallbackKo: "프로필 주소", fallbackEn: "Profile address" })}
        </h3>
        <p className="mt-2 text-sm font-semibold text-[#101828]">
          {profileAddress.lines.length > 0 ? profileAddress.lines.join(" · ") : empty}
        </p>
        <p className="mt-1 text-xs text-[#667085]">{profileAddress.regionName || profileAddress.regionCode || empty}</p>
      </div>
      {addresses.length === 0 ? (
        <div className={`${ADMIN_USERS_LITE_CARD} py-8 text-center text-sm text-[#667085]`}>
          {safeT("admin_users_cc_address_empty", { fallbackKo: "저장된 주소가 없습니다.", fallbackEn: "No saved addresses." })}
        </div>
      ) : (
        addresses.map((addr) => (
          <div key={addr.id} className={`${ADMIN_USERS_LITE_CARD} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[#101828]">{addr.nickname || addr.labelType}</p>
              {addr.isDefaultMaster ? (
                <span className="rounded-full border border-[#abefc6] bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-semibold text-[#067647]">
                  {safeT("admin_users_cc_address_default", { fallbackKo: "기본", fallbackEn: "Default" })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[#344054]">{addr.fullAddress || addr.formattedAddress || empty}</p>
            <p className="mt-1 text-xs text-[#667085]">
              {addr.recipientName || empty} · {addr.phoneNumber || empty}
            </p>
            <p className="mt-1 text-xs text-[#667085]">
              {[
                addr.isDefaultLife ? safeT("admin_users_cc_address_life", { fallbackKo: "생활", fallbackEn: "Life" }) : null,
                addr.isDefaultTrade ? safeT("admin_users_cc_address_trade", { fallbackKo: "거래", fallbackEn: "Trade" }) : null,
                addr.isDefaultDelivery ? safeT("admin_users_cc_address_delivery", { fallbackKo: "배달", fallbackEn: "Delivery" }) : null,
              ]
                .filter(Boolean)
                .join(" · ") || empty}
            </p>
            <p className="mt-1 text-xs text-[#98a2b3]">
              {safeT("admin_users_lite_label_updated_at", { fallbackKo: "수정", fallbackEn: "Updated" })}: {fmt(addr.updatedAt)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
