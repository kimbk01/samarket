import {
  OPERATIONAL_FREQUENCY_ORDER,
  type OperationalFrequencyClass,
} from "./types";
import { catalogPair } from "@/lib/i18n/catalog-pair";

/** Operational semantics — never claim measured usage %. */
export const OPERATIONAL_FREQUENCY_LABEL = {
  DAILY_CRITICAL: { ...catalogPair("admin_real_time_operations"), purpose: "Repeated same-day operator actions that unblock users/stores" },
  FREQUENT: { ...catalogPair("admin_routine_management"), purpose: "Daily/weekly entity management lists" },
  OCCASIONAL: { ...catalogPair("admin_occasional_handling"), purpose: "Infrequent but operational tasks" },
  CONFIGURATION: { ...catalogPair("admin_configuration"), purpose: "Policies and settings" },
  ARCHIVE: { ...catalogPair("admin_records_archive"), purpose: "Logs, history, deprecated compat" },
} as const satisfies Record<
  OperationalFrequencyClass,
  { ko: string; en: string; purpose: string }
>;

export function compareOperationalFrequency(
  a: OperationalFrequencyClass,
  b: OperationalFrequencyClass
): number {
  return OPERATIONAL_FREQUENCY_ORDER[a] - OPERATIONAL_FREQUENCY_ORDER[b];
}

export function sortByOperationalFrequency<T extends { frequency: OperationalFrequencyClass }>(
  entries: readonly T[]
): T[] {
  return [...entries].sort((x, y) => {
    const byFreq = compareOperationalFrequency(x.frequency, y.frequency);
    if (byFreq !== 0) return byFreq;
    const ox = "order" in x && typeof (x as { order?: number }).order === "number"
      ? (x as { order: number }).order
      : 0;
    const oy = "order" in y && typeof (y as { order?: number }).order === "number"
      ? (y as { order: number }).order
      : 0;
    return ox - oy;
  });
}
