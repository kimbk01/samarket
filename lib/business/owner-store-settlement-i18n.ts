import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { OwnerStoreSettlementStatusFilter } from "./owner-store-settlement-labels";

const STATUS_KEYS: Record<string, MessageKey> = {
  scheduled: "store_owner_settlement_status_scheduled",
  processing: "store_owner_settlement_status_processing",
  paid: "store_owner_settlement_status_paid",
  held: "store_owner_settlement_status_held",
  cancelled: "store_owner_settlement_status_cancelled",
};

const FILTER_KEYS: Record<OwnerStoreSettlementStatusFilter, MessageKey> = {
  all: "store_owner_tab_all",
  scheduled: "store_owner_settlement_status_scheduled",
  processing: "store_owner_settlement_status_processing",
  paid: "store_owner_settlement_status_paid",
  held: "store_owner_settlement_status_held",
  cancelled: "store_owner_settlement_status_cancelled",
};

export function ownerSettlementStatusLabel(lang: AppLanguageCode, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? translate(lang, key) : status;
}

export function ownerSettlementFilterLabel(
  lang: AppLanguageCode,
  filter: OwnerStoreSettlementStatusFilter
): string {
  return translate(lang, FILTER_KEYS[filter]);
}

export const OWNER_STORE_SETTLEMENT_STATUS_FILTERS_I18N: OwnerStoreSettlementStatusFilter[] = [
  "all",
  "scheduled",
  "processing",
  "paid",
  "held",
  "cancelled",
];
