"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { formatUserAddressListPlainLine } from "@/lib/addresses/format-user-address-list-line";

function Line({ label, text, unsetLabel }: { label: string; text: string | null; unsetLabel: string }) {
  return (
    <div className="rounded-ui-rect bg-sam-app px-3 py-2">
      <p className="sam-text-xxs font-medium text-sam-muted">{label}</p>
      <p className="mt-0.5 sam-text-body-secondary text-sam-fg">{text?.trim() || unsetLabel}</p>
    </div>
  );
}

function formatDefaultRowLine(row: UserAddressDefaultsDTO["life"]): string | null {
  if (!row?.id) return null;
  const line = formatUserAddressListPlainLine(row).trim();
  return line && line !== "—" && line !== "주소 미입력" ? line : null;
}

export function AddressDefaultsSummary({ defaults }: { defaults: UserAddressDefaultsDTO | null }) {
  const { t } = useI18n();
  if (!defaults) return null;
  const life = defaults.life ? formatDefaultRowLine(defaults.life) : null;
  const trade = defaults.trade ? formatDefaultRowLine(defaults.trade) : null;
  const del = defaults.delivery ? formatDefaultRowLine(defaults.delivery) : null;
  return (
    <section className="grid gap-2 sm:grid-cols-3">
      <Line label={t("addr_ui_default_life")} text={life} unsetLabel={t("addr_ui_unset")} />
      <Line label={t("addr_ui_default_trade")} text={trade} unsetLabel={t("addr_ui_unset")} />
      <Line label={t("addr_ui_default_delivery")} text={del} unsetLabel={t("addr_ui_unset")} />
    </section>
  );
}
