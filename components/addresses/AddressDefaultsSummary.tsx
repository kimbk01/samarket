"use client";

import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { buildTradePublicLine } from "@/lib/addresses/user-address-format";

function Line({ label, text }: { label: string; text: string | null }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-[13px] text-gray-900">{text?.trim() || "미설정"}</p>
    </div>
  );
}

export function AddressDefaultsSummary({ defaults }: { defaults: UserAddressDefaultsDTO | null }) {
  if (!defaults) return null;
  const life = defaults.life ? buildTradePublicLine(defaults.life) : null;
  const trade = defaults.trade ? buildTradePublicLine(defaults.trade) : null;
  const del = defaults.delivery ? buildTradePublicLine(defaults.delivery) : null;
  return (
    <section className="grid gap-2 sm:grid-cols-3">
      <Line label="기본 생활 동네" text={life} />
      <Line label="기본 거래 주소" text={trade} />
      <Line label="기본 배달 주소" text={del} />
    </section>
  );
}
