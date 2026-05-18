"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { buildTradePublicLine, stripCountryFromAddressDisplayLine } from "@/lib/addresses/user-address-format";

function Line({ label, text, unsetLabel }: { label: string; text: string | null; unsetLabel: string }) {
  return (
    <div className="rounded-ui-rect bg-sam-app px-3 py-2">
      <p className="sam-text-xxs font-medium text-sam-muted">{label}</p>
      <p className="mt-0.5 sam-text-body-secondary text-sam-fg">{text?.trim() || unsetLabel}</p>
    </div>
  );
}

export function AddressDefaultsSummary({ defaults }: { defaults: UserAddressDefaultsDTO | null }) {
  const { t } = useI18n();
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
      <Line label={t("addr_ui_default_life")} text={life} unsetLabel={t("addr_ui_unset")} />
      <Line label={t("addr_ui_default_trade")} text={trade} unsetLabel={t("addr_ui_unset")} />
      <Line label={t("addr_ui_default_delivery")} text={del} unsetLabel={t("addr_ui_unset")} />
    </section>
  );
}
