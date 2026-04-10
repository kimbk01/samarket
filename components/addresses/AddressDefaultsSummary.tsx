"use client";

import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { buildTradePublicLine, stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";

function Line({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="rounded-ui-rect bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-[13px] text-gray-900">{text?.trim() || "미설정"}</p>
    </div>
  );
}

export function AddressDefaultsSummary({ defaults }: { defaults: UserAddressDefaultsDTO | null }) {
  if (!defaults) return null;
  const life = defaults.life
    ? stripCountryFromAddressDisplayLine(buildTradePublicLine(defaults.life), defaults.life.countryName)
    : null;
  const trade = defaults.trade
    ? stripCountryFromAddressDisplayLine(buildTradePublicLine(defaults.trade), defaults.trade.countryName)
    : null;
  const del = defaults.delivery
    ? stripCountryFromAddressDisplayLine(buildTradePublicLine(defaults.delivery), defaults.delivery.countryName)
    : null;
  return (
    <section className="grid gap-2 sm:grid-cols-3">
      <Line label="기본 생활 동네" text={life} />
      <Line label="기본 거래 주소" text={trade} />
      <Line label="기본 배달 주소" text={del} />
    </section>
  );
}
